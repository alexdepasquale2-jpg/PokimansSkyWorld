#!/usr/bin/env python3
"""Licensed standards source -> the corpus the harness reads.

    python corpus.py ingest  --source raw/nfpa25-2023.txt --standard NFPA25 \
                             --edition 2023 --out ~/gate2/corpus-nfpa25-2023
    python corpus.py overlay --base ~/gate2/corpus-nfpa25-2023 \
                             --amendments jurisdictions/travis-county.txt \
                             --jurisdiction travis-county \
                             --out ~/gate2/corpus-travis-county
    python corpus.py validate ~/gate2/corpus-travis-county

Output is never written inside the repository by default, and the .gitignore
blocks licensed text regardless. Keep corpora outside the working tree.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from corpus_tools import overlay as overlay_mod
from corpus_tools.model import Corpus, parse
from corpus_tools.validate import has_errors, validate

HERE = Path(__file__).parent
MANIFEST = "manifest.json"


def _write(corpus: Corpus, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for stale in out.glob("*.md"):
        if stale.name != "README.md":
            stale.unlink()
    for name, content in corpus.files().items():
        (out / name).write_text(content)
    (out / MANIFEST).write_text(json.dumps({
        "standard": corpus.standard,
        "edition": corpus.edition,
        "jurisdiction": corpus.jurisdiction,
        "chapters": [{"number": c.number, "title": c.title, "clauses": len(c.clauses)}
                     for c in corpus.chapters],
        "clause_count": len(corpus.clauses),
        "approx_tokens": corpus.approx_tokens,
        "fingerprint": corpus.fingerprint(),
        "files": list(corpus.files().keys()),
        # Provenance lives here rather than inline in the clause text, so a
        # reload reproduces the corpus byte-for-byte.
        "amendments": {c.ref: c.amended_by for c in corpus.clauses if c.amended_by},
    }, indent=2) + "\n")


def _load(directory: Path) -> Corpus:
    """Reconstruct a corpus from a directory previously written by ingest."""
    manifest_path = directory / MANIFEST
    if not manifest_path.exists():
        raise SystemExit(f"{directory}: no {MANIFEST} — was this written by `corpus.py ingest`?")
    manifest = json.loads(manifest_path.read_text())
    text = "\n".join(
        (directory / name).read_text() for name in manifest["files"] if (directory / name).exists()
    )
    # Round-trip through the parser: rendered bold refs are stripped first so
    # the clause pattern matches the same way it did on the original source.
    plain = text.replace("**", "")
    corpus, _ = parse(plain, standard=manifest["standard"], edition=manifest["edition"])
    corpus.jurisdiction = manifest.get("jurisdiction", "")
    for chapter in corpus.chapters:
        for entry in manifest["chapters"]:
            if entry["number"] == chapter.number:
                chapter.title = entry["title"]
    amendments = manifest.get("amendments", {})
    for clause in corpus.clauses:
        clause.amended_by = amendments.get(clause.ref, "")
    return corpus


def _report(findings, *, quiet: bool = False) -> None:
    icons = {"error": "ERROR", "warn": " warn", "info": " info"}
    for finding in findings:
        if quiet and finding.level == "info":
            continue
        print(f"  [{icons[finding.level]}] {finding.message}")


def cmd_ingest(args) -> int:
    source = args.source.read_text()
    corpus, warnings = parse(source, standard=args.standard, edition=args.edition)
    for warning in warnings:
        print(f"  [ warn] {warning}")

    findings = validate(corpus)
    _report(findings)
    if has_errors(findings):
        print("\ningest aborted — fix the errors above before writing a corpus")
        return 1

    _write(corpus, args.out)
    print(f"\nwrote {len(corpus.files())} chapter file(s) to {args.out}")
    print(f"fingerprint {corpus.fingerprint()[:12]} — record this; a change cold-starts the cache")
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
        print("\noverlay aborted — the amended corpus does not validate")
        return 1

    _write(result, args.out)
    print(f"\nwrote {len(result.files())} chapter file(s) to {args.out}")
    print(f"fingerprint {result.fingerprint()[:12]}")
    return 0


def cmd_validate(args) -> int:
    corpus = _load(args.directory)
    findings = validate(corpus)
    _report(findings)

    manifest = json.loads((args.directory / MANIFEST).read_text())
    if manifest["fingerprint"] != corpus.fingerprint():
        print("  [ERROR] fingerprint does not match the manifest — files edited by hand?")
        return 1
    return 1 if has_errors(findings) else 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    p = subparsers.add_parser("ingest", help="parse a licensed source document into a corpus")
    p.add_argument("--source", type=Path, required=True, help="plain-text standard")
    p.add_argument("--standard", required=True, help="e.g. NFPA25")
    p.add_argument("--edition", required=True, help="e.g. 2023")
    p.add_argument("--out", type=Path, required=True)
    p.set_defaults(func=cmd_ingest)

    p = subparsers.add_parser("overlay", help="apply jurisdiction amendments to a base corpus")
    p.add_argument("--base", type=Path, required=True)
    p.add_argument("--amendments", type=Path, required=True)
    p.add_argument("--jurisdiction", required=True, help="short id, e.g. travis-county")
    p.add_argument("--out", type=Path, required=True)
    p.set_defaults(func=cmd_overlay)

    p = subparsers.add_parser("validate", help="check an existing corpus directory")
    p.add_argument("directory", type=Path)
    p.set_defaults(func=cmd_validate)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
