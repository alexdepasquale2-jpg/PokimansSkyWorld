#!/usr/bin/env python3
"""Manage the authored procedure library.

    python corpus.py ingest   --source drafts/itm-v2.md --standard NFPA25 \
                              --version v2 --author "J. Doe" --out ~/gate2/library-v2
    python corpus.py overlay  --base ~/gate2/library-v2 \
                              --amendments jurisdictions/travis-county.txt \
                              --jurisdiction travis-county --out ~/gate2/library-travis
    python corpus.py validate ~/gate2/library-travis
    python corpus.py coverage ~/gate2/library-travis --scope scope/nfpa25-annual.txt

The library is authored content we own — see `fixtures/library/README.md` for the
authoring discipline, which is what keeps it defensibly ours.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from corpus_tools import overlay as overlay_mod
from corpus_tools.library import Library, parse
from corpus_tools.validate import coverage as coverage_of
from corpus_tools.validate import has_errors, validate

HERE = Path(__file__).parent
MANIFEST = "manifest.json"


def _write(library: Library, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for stale in out.glob("*.md"):
        if stale.name != "README.md":
            stale.unlink()
    for name, content in library.files().items():
        (out / name).write_text(content)
    (out / MANIFEST).write_text(json.dumps({
        "standard": library.standard,
        "version": library.version,
        "jurisdiction": library.jurisdiction,
        "author": library.author,
        "sections": [{"title": s.title, "procedures": len(s.procedures)}
                     for s in library.sections],
        "procedure_count": len(library.procedures),
        "approx_tokens": library.approx_tokens,
        "fingerprint": library.fingerprint(),
        "files": list(library.files().keys()),
        # Provenance lives here rather than inline in procedure bodies, so a
        # reload reproduces the library byte-for-byte.
        "amendments": {p.id: p.amended_by for p in library.procedures if p.amended_by},
        "maps_to": {p.id: p.maps_to for p in library.procedures},
        # Section membership is not recoverable from the rendered files: each
        # file's H1 is indistinguishable from an authored document title, so
        # reload would collapse everything into one section and the fingerprint
        # would drift. Record it explicitly.
        "section_of": {p.id: p.section for p in library.procedures},
    }, indent=2) + "\n")


def _load(directory: Path) -> Library:
    manifest_path = directory / MANIFEST
    if not manifest_path.exists():
        raise SystemExit(f"{directory}: no {MANIFEST} — was this written by `corpus.py ingest`?")
    manifest = json.loads(manifest_path.read_text())
    text = "\n".join(
        (directory / name).read_text() for name in manifest["files"]
        if (directory / name).exists()
    )
    library, _ = parse(text, standard=manifest["standard"], version=manifest["version"])
    library.jurisdiction = manifest.get("jurisdiction", "")
    library.author = manifest.get("author", "")
    amendments = manifest.get("amendments", {})
    section_of = manifest.get("section_of", {})
    for procedure in library.procedures:
        procedure.amended_by = amendments.get(procedure.id, "")
        procedure.section = section_of.get(procedure.id, procedure.section)

    if section_of:
        from corpus_tools.library import Section
        by_title: dict[str, Section] = {}
        order = [entry["title"] for entry in manifest.get("sections", [])]
        for title in order:
            by_title[title] = Section(title=title)
        for procedure in library.procedures:
            section = by_title.setdefault(procedure.section, Section(title=procedure.section))
            section.procedures.append(procedure)
        library.sections = [by_title[t] for t in order if by_title[t].procedures] + [
            s for t, s in by_title.items() if t not in order and s.procedures
        ]
    return library


def _report(findings) -> None:
    icons = {"error": "ERROR", "warn": " warn", "info": " info"}
    for finding in findings:
        print(f"  [{icons[finding.level]}] {finding.message}")


def cmd_ingest(args) -> int:
    library, warnings = parse(
        args.source.read_text(), standard=args.standard, version=args.version
    )
    library.author = args.author
    for warning in warnings[:10]:
        print(f"  [ warn] {warning}")
    if len(warnings) > 10:
        print(f"  [ warn] ...and {len(warnings) - 10} more parse warnings")

    findings = validate(library)
    _report(findings)
    if has_errors(findings):
        print("\ningest aborted — fix the errors above")
        return 1

    _write(library, args.out)
    print(f"\nwrote {len(library.files())} section file(s) to {args.out}")
    print(f"fingerprint {library.fingerprint()[:12]} — a change cold-starts the cache")
    return 0


def cmd_overlay(args) -> int:
    base = _load(args.base)
    try:
        title, amendments = overlay_mod.parse_amendments(args.amendments.read_text())
        result, notes = overlay_mod.apply(base, amendments, jurisdiction=args.jurisdiction)
    except overlay_mod.OverlayError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"{title or args.jurisdiction}: {len(notes)} amendment(s)")
    for note in notes:
        print(f"  - {note}")

    findings = validate(result)
    _report(findings)
    if has_errors(findings):
        print("\noverlay aborted — the amended library does not validate")
        return 1

    _write(result, args.out)
    print(f"\nwrote {len(result.files())} section file(s) to {args.out}")
    print(f"fingerprint {result.fingerprint()[:12]}")
    return 0


def cmd_validate(args) -> int:
    library = _load(args.directory)
    findings = validate(library)
    _report(findings)

    manifest = json.loads((args.directory / MANIFEST).read_text())
    if manifest["fingerprint"] != library.fingerprint():
        print("  [ERROR] fingerprint does not match the manifest — files edited by hand?")
        return 1
    return 1 if has_errors(findings) else 0


def cmd_coverage(args) -> int:
    """Readiness, not correctness.

    A library grounding 40% of the clauses an inspection touches will silently
    under-report: the model has nothing to cite, records fewer findings, and
    Gate 2 reads as a model failure when it is a content gap.
    """
    library = _load(args.directory) if (args.directory / MANIFEST).exists() else None
    if library is None:
        text = "\n".join(p.read_text() for p in sorted(args.directory.glob("*.md"))
                         if p.name != "README.md")
        library, _ = parse(text, standard="library", version="wip")

    scope = [line.split("#")[0].strip() for line in args.scope.read_text().splitlines()]
    scope = [s for s in scope if s]
    result = coverage_of(library, scope)

    print(f"scope: {len(scope)} clause(s)   library: {len(library.procedures)} procedure(s)")
    print(f"covered      {len(result.covered):>4}   {result.ratio:.0%}")
    print(f"missing      {len(result.missing):>4}")
    print(f"out of scope {len(result.out_of_scope):>4}")

    if result.missing:
        print("\nmissing procedures for:")
        for ref in result.missing[:40]:
            print(f"  {ref}")
        if len(result.missing) > 40:
            print(f"  ...and {len(result.missing) - 40} more")
    if result.out_of_scope:
        print("\nprocedures mapping outside the scope file "
              "(fine if the scope is partial, a typo otherwise):")
        for ref in result.out_of_scope[:10]:
            print(f"  {ref}")

    if result.ratio < args.threshold:
        print(f"\ncoverage {result.ratio:.0%} is below the {args.threshold:.0%} threshold.")
        print("Running Gate 2 against this will read as a model failure when it is a")
        print("content gap. Author the missing procedures first.")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("ingest", help="parse an authored library into a versioned directory")
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--standard", required=True, help="e.g. NFPA25")
    p.add_argument("--version", required=True, help="library version, e.g. v2")
    p.add_argument("--author", default="", help="who authored this version")
    p.add_argument("--out", type=Path, required=True)
    p.set_defaults(func=cmd_ingest)

    p = sub.add_parser("overlay", help="apply jurisdiction amendments")
    p.add_argument("--base", type=Path, required=True)
    p.add_argument("--amendments", type=Path, required=True)
    p.add_argument("--jurisdiction", required=True)
    p.add_argument("--out", type=Path, required=True)
    p.set_defaults(func=cmd_overlay)

    p = sub.add_parser("validate", help="check a library directory")
    p.add_argument("directory", type=Path)
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("coverage", help="which in-scope clauses have procedures")
    p.add_argument("directory", type=Path)
    p.add_argument("--scope", type=Path, required=True,
                   help="one clause reference per line; # comments allowed")
    p.add_argument("--threshold", type=float, default=0.90)
    p.set_defaults(func=cmd_coverage)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
