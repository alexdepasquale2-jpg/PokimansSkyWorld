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
    corpus = load_corpus(HERE / "fixtures" / "standards")
    check("corpus loads", corpus.approx_tokens > 0, f"{corpus.approx_tokens} tokens")
    check("README excluded from corpus", "README" not in " ".join(corpus.sources))
    check("fingerprint is stable", corpus.sha256 == load_corpus(HERE / "fixtures" / "standards").sha256)

    zero_usage = SimpleNamespace(cache_read_input_tokens=0, cache_creation_input_tokens=0)
    warned = cache_warning("claude-opus-5", corpus, zero_usage)
    check("warns when cache never engaged", warned is not None)

    warm = SimpleNamespace(cache_read_input_tokens=5000, cache_creation_input_tokens=0)
    small = type(corpus)(text="x" * 400, sha256="x", sources=[])
    check("warns when corpus is below the model's cache floor",
          cache_warning("claude-haiku-4-5", small, warm) is not None)


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

    corpus = load_corpus(HERE / "fixtures" / "standards")
    unknown = [d.standard_clause for d in reference.deficiencies
               if d.standard_clause and d.standard_clause not in corpus.text]
    check("every reference citation exists in the corpus", not unknown, str(unknown))


def main() -> int:
    print("Gate 2 harness self-test (offline)")
    test_schemas()
    test_cost()
    test_gate_verdict()
    test_corpus_and_cache()
    test_fixture()
    print(f"\n{'FAILED: ' + ', '.join(FAILURES) if FAILURES else 'all checks passed'}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
