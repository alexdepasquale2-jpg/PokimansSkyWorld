#!/usr/bin/env python3
"""Gate 2 feasibility harness — see ../04-validation-sprint.md.

Disposable by design: no UI, no database, no auth. Audio and photos in, draft
report out, plus the four numbers Gate 2 turns on.

    python run.py --all fixtures/inspections
    python run.py --inspection path/to/inspection --out out/
    python run.py --all fixtures/inspections --dry-run

If it lands well short of target, that is a finding about the value hypothesis,
not an invitation to tune this script. Read the fail condition in the sprint doc
before optimising anything here.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from harness import pipeline, score as scoring
from harness.config import CHEAP_MODEL, REASONING_MODEL
from harness.cost import CostMeter
from harness.llm import CorpusError, check_corpus_stability, load_corpus

HERE = Path(__file__).parent


@dataclass
class Result:
    name: str
    meter: CostMeter
    deficiencies: int
    score: scoring.Score | None
    warnings: list[str]


def run_inspection(client, inspection_dir: Path, corpus, out_dir: Path, *, do_score: bool) -> Result:
    meter = CostMeter()
    warnings: list[str] = []
    name = inspection_dir.name
    out = out_dir / name
    out.mkdir(parents=True, exist_ok=True)

    meta_path = inspection_dir / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {"id": name}

    price_book_path = inspection_dir / "price-book.json"
    price_book = json.loads(price_book_path.read_text()) if price_book_path.exists() else None

    print(f"\n=== {name} ===")

    print("  [1/5] transcribe")
    transcript = pipeline.transcribe(
        inspection_dir, meter, api_key=os.environ.get("DEEPGRAM_API_KEY")
    )

    print("  [2/5] classify photos")
    photos, photo_warnings = pipeline.classify_photos(client, inspection_dir, meter)
    warnings += photo_warnings
    (out / "photo-findings.json").write_text(json.dumps(photos.model_dump(), indent=2))

    print("  [3/5] extract deficiencies")
    deficiencies, extract_warnings = pipeline.extract_deficiencies(
        client, meter, corpus=corpus, transcript=transcript, photos=photos, meta=meta
    )
    warnings += extract_warnings
    (out / "deficiencies.json").write_text(json.dumps(deficiencies.model_dump(), indent=2))

    print("  [4/5] write report")
    report = pipeline.write_report(
        client, meter, corpus=corpus, deficiencies=deficiencies, meta=meta
    )
    (out / "report.md").write_text(report)

    print("  [5/5] price proposal")
    proposal = pipeline.price_proposal(client, meter, deficiencies=deficiencies, price_book=price_book)
    if proposal:
        (out / "proposal.json").write_text(json.dumps(proposal.model_dump(), indent=2))
    else:
        warnings.append("no price-book.json — skipped the proposal stage")

    result_score = None
    if do_score:
        print("  [score] aligning against reference")
        reference = scoring.load_reference(client, inspection_dir, meter)
        if reference is None:
            warnings.append(
                "no reference-deficiencies.json or reference-report.md — cannot score"
            )
        else:
            result_score = scoring.score(
                client, meter, extracted=deficiencies, reference=reference
            )
            (out / "score.json").write_text(
                json.dumps(
                    {
                        "matched": result_score.matched,
                        "missed": result_score.missed,
                        "fabricated": result_score.fabricated,
                        "accuracy": result_score.accuracy,
                        "citation_accuracy": result_score.citation_accuracy,
                        "alignments": result_score.alignments,
                        "notes": result_score.notes,
                    },
                    indent=2,
                )
            )

    return Result(
        name=name,
        meter=meter,
        deficiencies=len(deficiencies.deficiencies),
        score=result_score,
        warnings=warnings,
    )


def summarise(results: list[Result]) -> bool:
    print("\n" + "=" * 95)
    print("GATE 2 SUMMARY")
    print("=" * 95)

    header = (f"{'inspection':<24}{'defs':>6}{'match':>7}{'miss':>6}{'fab':>5}"
              f"{'acc':>7}{'cite':>7}{'COGS':>9}{'sec':>7}")
    print(header)
    print("-" * 95)

    total_cogs = total_seconds = 0.0
    total_matched = total_reference = total_fabricated = 0
    scored = 0

    for r in results:
        cogs = r.meter.cogs_usd
        seconds = r.meter.wall_clock_s
        total_cogs += cogs
        total_seconds += seconds
        if r.score:
            scored += 1
            total_matched += r.score.matched
            total_reference += r.score.reference_total
            total_fabricated += r.score.fabricated
            print(f"{r.name:<24}{r.deficiencies:>6}{r.score.matched:>7}"
                  f"{r.score.missed:>6}{r.score.fabricated:>5}"
                  f"{r.score.accuracy:>7.0%}{r.score.citation_accuracy:>7.0%}"
                  f"{cogs:>9.3f}{seconds:>7.0f}")
        else:
            print(f"{r.name:<24}{r.deficiencies:>6}{'-':>7}{'-':>6}{'-':>5}"
                  f"{'-':>7}{'-':>7}{cogs:>9.3f}{seconds:>7.0f}")

    n = len(results)
    print("-" * 95)
    print(f"{'mean':<24}{'':>24}{'':>14}{total_cogs / n:>9.3f}{total_seconds / n:>7.0f}")

    all_warnings = [(r.name, w) for r in results for w in r.warnings]
    if all_warnings:
        print("\nWarnings")
        for name, warning in all_warnings:
            print(f"  - {name}: {warning}")

    if not scored:
        print("\nNo inspections were scored — accuracy gate not evaluated.")
        print("Supply reference-deficiencies.json or reference-report.md to score.")
        return False

    accuracy = total_matched / total_reference if total_reference else 0.0
    verdict = scoring.gate_verdict(
        accuracy=accuracy,
        fabrications_per_report=total_fabricated / scored,
        cogs=total_cogs / n,
        seconds=total_seconds / n,
    )
    print("\nGate 2 thresholds")
    for line in verdict.lines:
        print(line)
    print(f"\n  VERDICT: {'PASS' if verdict.passed else 'FAIL'}"
          f"   ({scored} of {n} inspections scored)")
    if not verdict.passed:
        print("\n  A wide miss is a finding about the value hypothesis. Re-read the")
        print("  Gate 2 fail condition before tuning prompts in this script.")
    return verdict.passed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--inspection", type=Path, help="one inspection directory")
    source.add_argument("--all", type=Path, help="directory of inspection directories")
    parser.add_argument("--out", type=Path, default=HERE / "out")
    parser.add_argument("--standards", type=Path, default=HERE / "fixtures" / "standards")
    parser.add_argument("--no-score", action="store_true", help="skip scoring")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate inputs and corpus, make no API calls")
    args = parser.parse_args()

    if args.inspection:
        inspections = [args.inspection]
    else:
        inspections = sorted(p for p in args.all.iterdir() if p.is_dir())
    if not inspections:
        print("no inspection directories found", file=sys.stderr)
        return 2

    try:
        corpus = load_corpus(args.standards)
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"corpus: {len(corpus.sources)} file(s), ~{corpus.approx_tokens:,} tokens, "
          f"sha256 {corpus.sha256[:12]}")
    if (drift := check_corpus_stability(corpus, args.out / ".corpus-state.json")):
        print(f"warning: {drift}")

    if args.dry_run:
        print(f"\ndry run — {len(inspections)} inspection(s), no API calls")
        for path in inspections:
            has_transcript = (path / "transcript.txt").exists()
            audio = len(list((path / "audio").glob("*"))) if (path / "audio").is_dir() else 0
            photos = len(list((path / "photos").glob("*"))) if (path / "photos").is_dir() else 0
            reference = ((path / "reference-deficiencies.json").exists()
                         or (path / "reference-report.md").exists())
            print(f"  {path.name:<24} transcript={has_transcript} audio={audio} "
                  f"photos={photos} reference={reference}")
        print(f"\nmodels: {REASONING_MODEL} (reasoning), {CHEAP_MODEL} (photos)")
        return 0

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("error: ANTHROPIC_API_KEY is not set", file=sys.stderr)
        return 2

    import anthropic

    client = anthropic.Anthropic()
    results = [
        run_inspection(client, path, corpus, args.out, do_score=not args.no_score)
        for path in inspections
    ]
    return 0 if summarise(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
