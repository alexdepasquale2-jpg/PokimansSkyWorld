#!/usr/bin/env python3
"""Offline checks — no API key, no spend.

    python selftest.py

Covers the parts that are wrong silently: schema shape (the API rejects a bad
one at request time, which is an expensive way to find out), cache-aware cost
arithmetic, and the gate verdict boundaries.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

from harness.config import GATE2_MAX_COGS_USD, GATE2_MIN_ACCURACY, PRICING
from harness.cost import CostMeter
from harness.llm import cache_warning, load_corpus
from harness.schemas import (
    DeficiencyList, PhotoBatch, Proposal, ScoreReport, strict_schema,
)
from harness.score import gate_verdict

HERE = Path(__file__).parent
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    print(f"  [{'ok' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


def audit_schema(node, path="$", problems=None) -> list[str]:
    problems = [] if problems is None else problems
    if isinstance(node, dict):
        if node.get("type") == "object" and "properties" in node:
            if node.get("additionalProperties") is not False:
                problems.append(f"{path}: additionalProperties not false")
            if set(node.get("required", [])) != set(node["properties"]):
                problems.append(f"{path}: required does not cover all properties")
        for banned in ("minimum", "maximum", "maxLength", "minLength", "pattern",
                       "default", "title", "minItems", "maxItems"):
            if banned in node:
                problems.append(f"{path}: unsupported keyword {banned!r}")
        for key, value in node.items():
            audit_schema(value, f"{path}.{key}", problems)
    elif isinstance(node, list):
        for i, value in enumerate(node):
            audit_schema(value, f"{path}[{i}]", problems)
    return problems


def test_schemas() -> None:
    print("\nschemas")
    for model in (DeficiencyList, PhotoBatch, ScoreReport, Proposal):
        problems = audit_schema(strict_schema(model))
        check(f"{model.__name__} is structured-outputs clean", not problems, str(problems[:3]))


def test_cost() -> None:
    print("\ncost arithmetic")
    meter = CostMeter()

    # 1M plain input + 1M output on Opus 5 = $5 + $25.
    meter.record("a", "claude-opus-5",
                 SimpleNamespace(input_tokens=1_000_000, output_tokens=1_000_000,
                                 cache_read_input_tokens=0, cache_creation_input_tokens=0))
    check("plain tokens priced correctly", abs(meter.cogs_usd - 30.0) < 1e-6,
          f"got {meter.cogs_usd}")

    # Cache reads bill at 0.1x, writes at 1.25x.
    meter2 = CostMeter()
    meter2.record("b", "claude-opus-5",
                  SimpleNamespace(input_tokens=0, output_tokens=0,
                                  cache_read_input_tokens=1_000_000,
                                  cache_creation_input_tokens=1_000_000))
    expected = 5.0 * 0.10 + 5.0 * 1.25
    check("cache read/write multipliers applied", abs(meter2.cogs_usd - expected) < 1e-6,
          f"got {meter2.cogs_usd}, expected {expected}")

    # Measurement spend must never reach COGS — the gate checks production cost.
    meter3 = CostMeter()
    meter3.record("prod", "claude-haiku-4-5",
                  SimpleNamespace(input_tokens=1_000_000, output_tokens=0,
                                  cache_read_input_tokens=0, cache_creation_input_tokens=0))
    meter3.record("score", "claude-opus-5",
                  SimpleNamespace(input_tokens=1_000_000, output_tokens=0,
                                  cache_read_input_tokens=0, cache_creation_input_tokens=0),
                  measurement=True)
    check("scoring excluded from COGS", abs(meter3.cogs_usd - 1.0) < 1e-6, f"got {meter3.cogs_usd}")
    check("scoring tracked separately", abs(meter3.measurement_usd - 5.0) < 1e-6,
          f"got {meter3.measurement_usd}")

    meter4 = CostMeter()
    meter4.record_flat("transcribe", 0.23)
    check("flat (ASR) spend counts toward COGS", abs(meter4.cogs_usd - 0.23) < 1e-6)

    check("every configured model has pricing",
          all(m in PRICING for m in ("claude-opus-5", "claude-haiku-4-5")))


def test_gate_verdict() -> None:
    print("\ngate thresholds")
    passing = gate_verdict(accuracy=0.90, fabrications_per_report=0.2, cogs=1.10, seconds=120)
    check("clean run passes", passing.passed)

    for label, kwargs in [
        ("accuracy below floor", dict(accuracy=0.70, fabrications_per_report=0.0, cogs=1.0, seconds=60)),
        ("too many fabrications", dict(accuracy=0.95, fabrications_per_report=3.0, cogs=1.0, seconds=60)),
        ("COGS over budget", dict(accuracy=0.95, fabrications_per_report=0.0, cogs=5.0, seconds=60)),
        ("too slow", dict(accuracy=0.95, fabrications_per_report=0.0, cogs=1.0, seconds=900)),
    ]:
        check(f"fails on {label}", not gate_verdict(**kwargs).passed)

    boundary = gate_verdict(accuracy=GATE2_MIN_ACCURACY, fabrications_per_report=0.0,
                            cogs=GATE2_MAX_COGS_USD, seconds=1)
    check("thresholds are inclusive at the boundary", boundary.passed)


def test_corpus_and_cache() -> None:
    print("\ncorpus and cache guards")
    corpus = load_corpus(HERE / "fixtures" / "library")
    check("corpus loads", corpus.approx_tokens > 0, f"{corpus.approx_tokens} tokens")
    check("README excluded from corpus", "README" not in " ".join(corpus.sources))
    check("fingerprint is stable", corpus.sha256 == load_corpus(HERE / "fixtures" / "library").sha256)

    zero_usage = SimpleNamespace(cache_read_input_tokens=0, cache_creation_input_tokens=0)
    warned = cache_warning("claude-opus-5", corpus, zero_usage)
    check("warns when cache never engaged", warned is not None)

    warm = SimpleNamespace(cache_read_input_tokens=5000, cache_creation_input_tokens=0)
    small = type(corpus)(text="x" * 400, sha256="x", sources=[])
    check("warns when corpus is below the model's cache floor",
          cache_warning("claude-haiku-4-5", small, warm) is not None)


def test_reproduction_guard() -> None:
    """The control that keeps published standard wording out of our output.

    The model has read NFPA in training. Without this check it will happily
    supply remembered standard text where the library is silent — which is
    exactly the material an unlicensed product must not reproduce.
    """
    print("\nreproduction guard")
    from harness.pipeline import _grounded_in

    library = load_corpus(HERE / "fixtures" / "library").text

    drawn = ("Read the calibration date on the gauge tag. Replace or recalibrate "
             "at intervals no longer than five years.")
    check("passes text drawn from the library", _grounded_in(drawn, library))

    lightly_reworded = ("Check the gauge tag calibration date and replace or "
                        "recalibrate at intervals no longer than five years.")
    check("tolerates light rewording", _grounded_in(lightly_reworded, library))

    invented = ("Emergency egress illumination shall provide not less than one "
                "footcandle measured along the path of egress travel.")
    check("flags requirement language absent from the library",
          not _grounded_in(invented, library))

    check("empty claim is not flagged", _grounded_in("", library))


def test_fixture() -> None:
    print("\nfixture")
    path = HERE / "fixtures" / "inspections" / "demo-001"
    if not path.exists():
        check("fixture present", False, "run: python fixtures/make_fixtures.py")
        return
    reference = DeficiencyList.model_validate(
        json.loads((path / "reference-deficiencies.json").read_text())
    )
    check("reference validates against the production schema", len(reference.deficiencies) > 0)
    check("fixture carries the photo-only trap",
          any(d.source == "photo" for d in reference.deficiencies))
    check("fixture carries the ambiguity trap", len(reference.uncertain_items) > 0)

    corpus = load_corpus(HERE / "fixtures" / "library")
    unknown = [d.standard_clause for d in reference.deficiencies
               if d.standard_clause and d.standard_clause not in corpus.text]
    check("every reference citation exists in the corpus", not unknown, str(unknown))


LIBRARY_SOURCE = """\
# Test library v1

## Valves

### P-13-2-5 · Control valve inspection
**maps_to:** SYN-13.2.5

Inspect each control valve quarterly. Confirm it is open, supervised, reachable,
and free of leakage.
**Severity:** critical if closed.

### P-13-2-6 · Control valve identification
**maps_to:** SYN-13.2.6

Confirm each valve carries a durable sign naming what it controls.
**Severity:** minor.
"""

AMENDMENTS = """\
# Test County amendments

## replace P-13-2-5
Inspect control valves monthly within Test County, confirming the same five
checks as the base procedure.
**Severity:** critical if closed.

## add P-TC-1 · Knox-box key
**maps_to:** TC-4.2
Verify the Knox-box key is present and turns the box at each annual visit.
"""


def test_library_tools() -> None:
    print("\nlibrary tooling")
    from corpus_tools import overlay as ov
    from corpus_tools.library import parse
    from corpus_tools.validate import coverage, has_errors, validate as validate_lib

    library, warnings = parse(LIBRARY_SOURCE, standard="TEST", version="v1")
    check("parses procedures", len(library.procedures) == 2, f"got {len(library.procedures)}")
    check("captures maps_to references",
          [p.maps_to for p in library.procedures] == ["SYN-13.2.5", "SYN-13.2.6"])
    check("captures multi-line bodies", all(len(p.body) > 40 for p in library.procedures))
    check("no parse warnings on clean source", not warnings, str(warnings[:2]))

    # The round trip is what keeps the cache fingerprint stable.
    rendered = "\n\n".join(library.files().values())
    reparsed, _ = parse(rendered, standard="TEST", version="v1")
    check("render -> parse round trip preserves procedures",
          [p.id for p in reparsed.procedures] == [p.id for p in library.procedures])
    check("round trip preserves bodies",
          [p.body for p in reparsed.procedures] == [p.body for p in library.procedures])

    amended, notes = ov.apply(library, ov.parse_amendments(AMENDMENTS)[1],
                              jurisdiction="test-county")
    check("overlay applies both directives", len(notes) == 2, str(notes))
    check("base library is not mutated",
          "quarterly" in library.index()["P-13-2-5"].body)
    check("replaced procedure keeps its id and reference",
          amended.index()["P-13-2-5"].maps_to == "SYN-13.2.5"
          and "monthly" in amended.index()["P-13-2-5"].body)
    check("local additions go in their own section",
          any("Local requirements" in s.title for s in amended.sections))

    # Provenance must never land inside a procedure body — it would reach the
    # model's requirement_basis and into a filed compliance document.
    body = "\n".join(amended.files().values())
    proc_line = [l for l in body.splitlines() if l.startswith("### P-13-2-5")][0]
    check("amendment marker stays out of the procedure heading",
          "amended" not in proc_line.lower(), proc_line[:60])
    check("provenance appears in the section header", "Locally amended" in body)

    result = coverage(library, ["SYN-13.2.5", "SYN-13.2.6", "SYN-99.9.9"])
    check("coverage counts covered", len(result.covered) == 2)
    check("coverage counts missing", result.missing == ["SYN-99.9.9"])
    check("coverage ratio", abs(result.ratio - 2/3) < 1e-9, f"got {result.ratio}")

    dupe, _ = parse(LIBRARY_SOURCE.replace("P-13-2-6", "P-13-2-5"), standard="T", version="v")
    check("validator flags duplicate procedure ids", has_errors(validate_lib(dupe)))

    no_ref, _ = parse(LIBRARY_SOURCE.replace("**maps_to:** SYN-13.2.6", ""),
                      standard="T", version="v")
    check("validator flags a missing maps_to", has_errors(validate_lib(no_ref)))

    for bad, label in [
        ("# t\n\n## replace P-1\n", "replace with no body"),
        ("# t\n\n## delete P-1\nunexpected body\n", "delete with a body"),
        ("# t\n\n## rewrite P-1\nx\n", "unknown directive"),
        ("# t\n\n## add P-1\n**maps_to:** X\nbody\n", "add without a title"),
        ("# t\n\n## add P-1 · Title\nbody only\n", "add without maps_to"),
        ("# t\n\nnothing here\n", "no directives"),
    ]:
        try:
            ov.parse_amendments(bad)
            check(f"rejects {label}", False)
        except ov.OverlayError:
            check(f"rejects {label}", True)

    try:
        ov.apply(library, [ov.Amendment("replace", "P-NOPE", body="x")], jurisdiction="t")
        check("rejects replace of a missing procedure", False)
    except ov.OverlayError:
        check("rejects replace of a missing procedure", True)


def test_documented_commands() -> None:
    """Every `corpus.py` / `run.py` invocation in the docs must actually parse.

    Docs drift silently: a renamed flag leaves a copy-pasteable command that
    fails with "unrecognized arguments", and nothing catches it until someone
    follows the README. This walks the shell blocks and checks each command
    against the real argument parser.
    """
    print("\ndocumented commands")
    import re
    import shlex

    docs = [HERE / "README.md", HERE / "corpus_tools" / "README.md",
            HERE / "fixtures" / "library" / "README.md",
            HERE.parent / "04-validation-sprint.md"]
    text = "\n".join(d.read_text() for d in docs if d.exists())

    # Join backslash continuations, then pull out the tool invocations.
    joined = re.sub(r"\\\n\s*", " ", text)
    commands = re.findall(r"^\s*python (corpus\.py|run\.py) ([^\n`]+)$", joined, re.M)
    check("found documented commands", len(commands) >= 5, f"found {len(commands)}")

    known = {tool: _known_flags(HERE / tool) for tool in ("corpus.py", "run.py")}

    bad = []
    for tool, rest in commands:
        try:
            args = shlex.split(rest)
        except ValueError:
            continue
        unknown = [a for a in args if a.startswith("--") and a not in known[tool]]
        if unknown:
            bad.append(f"{tool} {rest[:44]}… -> unknown {unknown}")
    check("every documented flag exists in its parser", not bad, "; ".join(bad[:3]))


def _known_flags(path: Path) -> set[str]:
    """Every --flag the script's parser accepts, across all subcommands."""
    import re
    return set(re.findall(r'add_argument\("(--[a-z\-]+)"', path.read_text()))


def test_shipped_library() -> None:
    print("\nshipped library")
    from corpus_tools.library import parse
    from corpus_tools.validate import has_errors, validate as validate_lib

    source = (HERE / "fixtures" / "library" / "nfpa25-72-itm-v1.md").read_text()
    library, _ = parse(source, standard="NFPA25-72", version="v1")
    check("shipped library parses", len(library.procedures) > 20,
          f"got {len(library.procedures)}")
    check("every procedure carries a reference",
          all(p.maps_to for p in library.procedures))
    findings = validate_lib(library)
    check("shipped library validates", not has_errors(findings),
          str([f.message for f in findings if f.level == "error"][:2]))


def main() -> int:
    print("Gate 2 harness self-test (offline)")
    test_schemas()
    test_cost()
    test_gate_verdict()
    test_corpus_and_cache()
    test_library_tools()
    test_shipped_library()
    test_documented_commands()
    test_reproduction_guard()
    test_fixture()
    print(f"\n{'FAILED: ' + ', '.join(FAILURES) if FAILURES else 'all checks passed'}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
