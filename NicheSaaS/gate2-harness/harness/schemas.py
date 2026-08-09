"""Pydantic models plus the JSON-Schema strictifier.

Anthropic structured outputs require every object to carry
`additionalProperties: false` and list all of its properties in `required`, and
they reject numeric/length constraints. Pydantic emits neither of the first two
and happily emits the third, so every schema goes through `strict_schema()`
before it reaches the API.

Models here deliberately avoid Optional fields and validation constraints: with
all-required schemas, "unknown" is expressed as an empty string or empty list
rather than null.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Severity = Literal["critical", "major", "minor", "observation"]

# JSON-Schema keywords Anthropic structured outputs do not support.
_UNSUPPORTED_KEYS = {
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems",
    "default", "title",
}
_SUPPORTED_FORMATS = {
    "date-time", "time", "date", "duration", "email", "hostname", "uri",
    "ipv4", "ipv6", "uuid",
}


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Pydantic model -> a JSON Schema the structured-outputs API will accept."""
    return _strictify(model.model_json_schema())


def _strictify(node: Any) -> Any:
    if isinstance(node, list):
        return [_strictify(n) for n in node]
    if not isinstance(node, dict):
        return node

    out: dict[str, Any] = {}
    for key, value in node.items():
        if key in _UNSUPPORTED_KEYS:
            continue
        if key == "format" and value not in _SUPPORTED_FORMATS:
            continue
        out[key] = _strictify(value)

    if out.get("type") == "object" and "properties" in out:
        out["additionalProperties"] = False
        out["required"] = list(out["properties"].keys())
    return out


# --- stage outputs ----------------------------------------------------------


class PhotoFinding(BaseModel):
    photo_id: str = Field(description="Filename of the photo, exactly as given.")
    device_type: str = Field(
        description="Device or component shown, e.g. 'pressure gauge', "
        "'sprinkler head', 'FACP'. Empty string if not identifiable."
    )
    observations: list[str] = Field(
        description="What is visibly true in the image. Physical description "
        "only. Do not infer code compliance here."
    )
    condition_flags: list[str] = Field(
        description="Visible condition issues drawn from this closed set: "
        "corrosion, physical_damage, obstruction, missing_signage, "
        "illegible_tag, leakage, paint_coating, none."
    )
    tag_legible: bool = Field(description="True if an inspection tag is readable.")
    tag_text: str = Field(description="Transcribed tag text, or empty string.")
    image_quality_note: str = Field(
        description="Empty string unless the image is too dark, blurred, or "
        "cropped to support a finding — in which case say so."
    )


class PhotoBatch(BaseModel):
    findings: list[PhotoFinding]


class Deficiency(BaseModel):
    id: str = Field(description="Short stable id, e.g. 'D-01'.")
    location: str = Field(description="Where in the building, as stated by the inspector.")
    device: str = Field(description="Device or system the deficiency applies to.")
    description: str = Field(description="One sentence, in the inspector's terms.")
    standard_clause: str = Field(
        description="Clause reference from the supplied standards corpus, e.g. "
        "'25-13.2.5'. Empty string if no supplied clause applies — never invent one."
    )
    clause_quote: str = Field(
        description="The sentence from the corpus the clause reference points at. "
        "Empty string if standard_clause is empty."
    )
    severity: Severity
    evidence_photo_ids: list[str] = Field(
        description="Photo filenames supporting this finding. Empty list if none."
    )
    source: Literal["transcript", "photo", "both"] = Field(
        description="Where the evidence came from."
    )
    confidence: Literal["high", "medium", "low"] = Field(
        description="low when the transcript is ambiguous or the photo is unclear."
    )


class DeficiencyList(BaseModel):
    deficiencies: list[Deficiency]
    uncertain_items: list[str] = Field(
        description="Things the inspector said that may be deficiencies but were "
        "too ambiguous to record. Surfaced for the reviewer, not filed."
    )


class ProposalLine(BaseModel):
    deficiency_id: str
    work_description: str
    parts: list[str]
    labor_hours: float
    price_usd: float
    urgency: Literal["immediate", "scheduled", "next_cycle"]


class Proposal(BaseModel):
    lines: list[ProposalLine]
    subtotal_usd: float
    assumptions: list[str] = Field(
        description="Anything priced on an assumption the estimator should check."
    )


# --- scoring ----------------------------------------------------------------


class Alignment(BaseModel):
    extracted_id: str = Field(description="Empty string if this is a missed reference item.")
    reference_id: str = Field(description="Empty string if this is a fabrication.")
    verdict: Literal["match", "missed", "fabricated"]
    citation_correct: bool = Field(
        description="For matches only: whether the cited clause is the right one. "
        "False for missed and fabricated."
    )
    rationale: str


class ScoreReport(BaseModel):
    alignments: list[Alignment]
    notes: str
