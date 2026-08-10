"""Scoring against the human-written report.

Matching is semantic, not textual: "gauge past cal date" and "pressure gauge
exceeds its five-year calibration interval" are the same finding, and no string
comparison recovers that. So a model does the alignment.

Two deliberate choices:

- Misses and fabrications are counted separately, never averaged into one
  accuracy number. In a compliance product they are different failures: a miss
  is work the reviewer must catch, a fabrication is a false statement filed
  under someone's licence.
- Scoring runs on the reasoning model and its cost is tagged `measurement`, so
  it never inflates the COGS figure the gate checks.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import (
    EFFORT_SCORE,
    GATE2_MAX_COGS_USD,
    GATE2_MAX_FABRICATIONS_PER_REPORT,
    GATE2_MAX_WALL_CLOCK_S,
    GATE2_MIN_ACCURACY,
    MAX_TOKENS_SCORE,
    SCORER_MODEL,
)
from .cost import CostMeter
from .schemas import DeficiencyList, ScoreReport

JUDGE_ROLE = """\
You align two lists of inspection deficiencies: one written by a licensed human
inspector (the reference), one produced by a system under test.

For each reference item, find the system item describing the same underlying
physical problem at the same location, if one exists. Wording will differ; judge
by the problem described, not by phrasing. Two items about the same device but
different problems are not a match.

Emit exactly one alignment per reference item and one per unmatched system item:

- match      — a system item corresponds to a reference item
- missed     — a reference item with no corresponding system item
- fabricated — a system item with no corresponding reference item

For matches, set citation_correct true only if the system's cited clause plainly
governs the problem described.

Be strict. A generous match here produces a number that says the product works
when it does not, and that number is the only thing this gate exists to produce.\
"""

EXTRACT_REFERENCE_ROLE = """\
Extract the deficiencies recorded in this human-written inspection report into a
structured list. Record only what the report states. Do not add clause citations
the report does not contain, and do not merge or split findings.\
"""


@dataclass
class Score:
    matched: int
    missed: int
    fabricated: int
    citations_correct: int
    reference_total: int
    extracted_total: int
    alignments: list[dict[str, Any]]
    notes: str

    @property
    def accuracy(self) -> float:
        return self.matched / self.reference_total if self.reference_total else 0.0

    @property
    def citation_accuracy(self) -> float:
        return self.citations_correct / self.matched if self.matched else 0.0


def load_reference(
    client, inspection_dir: Path, meter: CostMeter
) -> DeficiencyList | None:
    """Prefer a hand-written reference list; fall back to parsing the report."""
    structured = inspection_dir / "reference-deficiencies.json"
    if structured.exists():
        return DeficiencyList.model_validate(json.loads(structured.read_text()))

    report = inspection_dir / "reference-report.md"
    if not report.exists():
        return None

    from .llm import structured_call

    result, _ = structured_call(
        client, meter,
        stage="reference-parse",
        model=SCORER_MODEL,
        system=EXTRACT_REFERENCE_ROLE,
        user_content=report.read_text(),
        schema=DeficiencyList,
        max_tokens=MAX_TOKENS_SCORE,
        effort=EFFORT_SCORE,
        measurement=True,
    )
    structured.write_text(json.dumps(result.model_dump(), indent=2))
    return result


def score(
    client,
    meter: CostMeter,
    *,
    extracted: DeficiencyList,
    reference: DeficiencyList,
) -> Score:
    from .llm import structured_call

    user_content = "\n\n".join([
        "<reference_deficiencies>\n"
        + json.dumps([d.model_dump() for d in reference.deficiencies], indent=2)
        + "\n</reference_deficiencies>",
        "<system_deficiencies>\n"
        + json.dumps([d.model_dump() for d in extracted.deficiencies], indent=2)
        + "\n</system_deficiencies>",
        "Produce the alignment.",
    ])

    report, _ = structured_call(
        client, meter,
        stage="score",
        model=SCORER_MODEL,
        system=JUDGE_ROLE,
        user_content=user_content,
        schema=ScoreReport,
        max_tokens=MAX_TOKENS_SCORE,
        effort=EFFORT_SCORE,
        measurement=True,
    )

    matched = sum(1 for a in report.alignments if a.verdict == "match")
    return Score(
        matched=matched,
        missed=sum(1 for a in report.alignments if a.verdict == "missed"),
        fabricated=sum(1 for a in report.alignments if a.verdict == "fabricated"),
        citations_correct=sum(
            1 for a in report.alignments if a.verdict == "match" and a.citation_correct
        ),
        reference_total=len(reference.deficiencies),
        extracted_total=len(extracted.deficiencies),
        alignments=[a.model_dump() for a in report.alignments],
        notes=report.notes,
    )


# --- gate verdict -----------------------------------------------------------


@dataclass
class Verdict:
    passed: bool
    lines: list[str]


def gate_verdict(
    *, accuracy: float, fabrications_per_report: float, cogs: float, seconds: float
) -> Verdict:
    checks = [
        ("extraction accuracy", accuracy, GATE2_MIN_ACCURACY, "≥", f"{accuracy:.0%}",
         f"{GATE2_MIN_ACCURACY:.0%}"),
        ("fabrications/report", -fabrications_per_report,
         -GATE2_MAX_FABRICATIONS_PER_REPORT, "≤", f"{fabrications_per_report:.2f}",
         f"{GATE2_MAX_FABRICATIONS_PER_REPORT:.2f}"),
        ("COGS/report", -cogs, -GATE2_MAX_COGS_USD, "≤", f"${cogs:.2f}",
         f"${GATE2_MAX_COGS_USD:.2f}"),
        ("wall clock/report", -seconds, -GATE2_MAX_WALL_CLOCK_S, "≤", f"{seconds:.0f}s",
         f"{GATE2_MAX_WALL_CLOCK_S}s"),
    ]
    lines, passed = [], True
    for name, value, threshold, op, shown, target in checks:
        ok = value >= threshold
        passed &= ok
        lines.append(f"  [{'PASS' if ok else 'FAIL'}] {name:<22}{shown:>10}  ({op} {target})")
    return Verdict(passed=bool(passed), lines=lines)
