"""The five production stages: transcribe, classify photos, extract, report, price.

Stage boundaries are drawn so that cost is attributable and so that each stage
does one kind of judgment:

- Photos report what is *visible*. They never decide compliance.
- Extraction decides compliance, grounded only in the supplied corpus.
- The report writes prose from decided deficiencies; it adds no new findings.

Collapsing these produces a vision model inventing code violations from a blurry
photo, which is the failure mode this product cannot have.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from .config import (
    ASR_USD_PER_MINUTE,
    CHEAP_MODEL,
    EFFORT_EXTRACT,
    EFFORT_PROPOSAL,
    EFFORT_REPORT,
    MAX_TOKENS_EXTRACT,
    MAX_TOKENS_PHOTOS,
    MAX_TOKENS_PROPOSAL,
    MAX_TOKENS_REPORT,
    REASONING_MODEL,
)
from .cost import CostMeter
from .llm import Corpus, cache_warning, structured_call, system_blocks, text_call
from .schemas import DeficiencyList, PhotoBatch, Proposal

PHOTOS_PER_CALL = 8
_MEDIA_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
}

# --- prompts ----------------------------------------------------------------

PHOTO_ROLE = """\
You are grading field photographs from a fire and life-safety inspection.

Report only what is visibly true in each image. Describe the device, its visible
condition, and any readable tag text.

Do not decide whether anything violates a code or standard. That judgment happens
downstream, with the standard in hand, by a process that can see the inspector's
narration as well as the photo. A photograph alone cannot establish a violation.

If an image is too dark, blurred, or cropped to support a finding, say so in
image_quality_note and leave observations sparse. An honest "I cannot tell from
this image" is worth more than a confident guess.\
"""

EXTRACT_ROLE = """\
You convert a fire and life-safety inspection into a list of deficiencies, each
grounded in the standards corpus supplied below.

Rules:

1. Cite only clauses that appear in the supplied corpus. If nothing in the corpus
   covers an observation, leave standard_clause empty and still record the
   deficiency. Never invent, guess at, or reconstruct a clause number from memory
   — a fabricated citation is worse than a missing one, because a reviewer can
   see a gap but cannot see a plausible-looking error.
2. Quote the corpus sentence your citation points at, verbatim, in clause_quote.
3. The inspector's narration is the primary record. Photos corroborate it. A
   photo alone can support a deficiency only for plainly visible physical
   conditions (obstruction, damage, missing signage).
4. When the narration is ambiguous about whether something is a deficiency, do
   not force it into the list. Put it in uncertain_items so a reviewer sees it.
5. Set confidence to low whenever you are inferring rather than recording.

You are not being scored on how many deficiencies you find. You are being scored
on whether a licensed reviewer would sign what you produced.\
"""

REPORT_ROLE = """\
You write the narrative body of a fire and life-safety inspection report from a
decided list of deficiencies.

Write for two readers: the Authority Having Jurisdiction, who needs the findings
and their clause references, and the building owner, who needs to know what is
wrong and how urgent it is.

Add no findings that are not in the supplied list. You are writing up decided
facts, not re-doing the inspection. Do not soften severity, and do not editorialise
about cost — pricing is handled separately.\
"""

PROPOSAL_ROLE = """\
You turn a list of inspection deficiencies into a priced repair proposal, using
only the customer's supplied price book.

For anything the price book does not cover, still write the line, set price_usd
to 0, and record the gap in assumptions so an estimator prices it by hand. Do not
extrapolate a price from a similar item — an invented number that reaches a
customer is worse than a blank one an estimator fills in.

Urgency follows severity: critical deficiencies are immediate, major are
scheduled, minor and observations go to next_cycle unless the narration says
otherwise.\
"""


# --- 1. transcribe ----------------------------------------------------------


def transcribe(inspection_dir: Path, meter: CostMeter, *, api_key: str | None) -> str:
    """Return the inspector's narration.

    A committed transcript.txt always wins, which keeps re-runs free and makes
    the pipeline reproducible while iterating on later stages.
    """
    committed = inspection_dir / "transcript.txt"
    if committed.exists():
        return committed.read_text().strip()

    audio = [p for p in sorted((inspection_dir / "audio").glob("*")) if p.is_file()]
    if not audio:
        raise FileNotFoundError(
            f"{inspection_dir}: supply either transcript.txt or audio/ files."
        )
    if not api_key:
        raise RuntimeError(
            "audio present but DEEPGRAM_API_KEY is unset. Set it, or drop a "
            "transcript.txt into the inspection directory."
        )

    import httpx

    chunks: list[str] = []
    with meter.timed("transcribe"):
        for path in audio:
            response = httpx.post(
                "https://api.deepgram.com/v1/listen",
                params={"model": "nova-2", "smart_format": "true", "punctuate": "true"},
                headers={"Authorization": f"Token {api_key}"},
                content=path.read_bytes(),
                timeout=300.0,
            )
            response.raise_for_status()
            body = response.json()
            alt = body["results"]["channels"][0]["alternatives"][0]
            chunks.append(alt["transcript"])
            duration_min = body.get("metadata", {}).get("duration", 0) / 60
            meter.record_flat("transcribe", duration_min * ASR_USD_PER_MINUTE)

    transcript = "\n\n".join(chunks).strip()
    committed.write_text(transcript)  # cache for re-runs
    return transcript


# --- 2. classify photos -----------------------------------------------------


def classify_photos(
    client, inspection_dir: Path, meter: CostMeter
) -> tuple[PhotoBatch, list[str]]:
    photo_dir = inspection_dir / "photos"
    photos = [
        p for p in sorted(photo_dir.glob("*"))
        if p.suffix.lower() in _MEDIA_TYPES
    ] if photo_dir.is_dir() else []

    findings, warnings = [], []
    if not photos:
        return PhotoBatch(findings=[]), ["no photos found — running transcript-only"]

    for start in range(0, len(photos), PHOTOS_PER_CALL):
        batch = photos[start : start + PHOTOS_PER_CALL]
        content: list[dict[str, Any]] = []
        for path in batch:
            content.append({"type": "text", "text": f"photo_id: {path.name}"})
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": _MEDIA_TYPES[path.suffix.lower()],
                    "data": base64.standard_b64encode(path.read_bytes()).decode(),
                },
            })
        content.append({
            "type": "text",
            "text": "Return one finding per photo_id above, in the same order.",
        })

        result, _ = structured_call(
            client, meter,
            stage="photos",
            model=CHEAP_MODEL,
            system=PHOTO_ROLE,
            user_content=content,
            schema=PhotoBatch,
            max_tokens=MAX_TOKENS_PHOTOS,
            effort="low",
        )
        findings.extend(result.findings)

    seen = {f.photo_id for f in findings}
    missing = [p.name for p in photos if p.name not in seen]
    if missing:
        warnings.append(f"no finding returned for {len(missing)} photo(s): {missing[:5]}")
    return PhotoBatch(findings=findings), warnings


# --- 3. extract deficiencies ------------------------------------------------


def extract_deficiencies(
    client,
    meter: CostMeter,
    *,
    corpus: Corpus,
    transcript: str,
    photos: PhotoBatch,
    meta: dict[str, Any],
) -> tuple[DeficiencyList, list[str]]:
    user_content = "\n\n".join([
        f"<inspection_meta>\n{json.dumps(meta, indent=2)}\n</inspection_meta>",
        f"<inspector_narration>\n{transcript}\n</inspector_narration>",
        "<photo_findings>\n"
        + json.dumps([f.model_dump() for f in photos.findings], indent=2)
        + "\n</photo_findings>",
        "Produce the deficiency list.",
    ])

    result, usage = structured_call(
        client, meter,
        stage="extract",
        model=REASONING_MODEL,
        system=system_blocks(EXTRACT_ROLE, corpus),
        user_content=user_content,
        schema=DeficiencyList,
        max_tokens=MAX_TOKENS_EXTRACT,
        effort=EFFORT_EXTRACT,
    )

    warnings = []
    if (warning := cache_warning(REASONING_MODEL, corpus, usage)):
        warnings.append(warning)

    # A clause the corpus does not contain is the failure this product cannot ship.
    for deficiency in result.deficiencies:
        if deficiency.standard_clause and deficiency.standard_clause not in corpus.text:
            warnings.append(
                f"{deficiency.id}: cited clause '{deficiency.standard_clause}' does not "
                "appear in the corpus — possible fabricated citation"
            )
    return result, warnings


# --- 4. write report --------------------------------------------------------


def write_report(
    client,
    meter: CostMeter,
    *,
    corpus: Corpus,
    deficiencies: DeficiencyList,
    meta: dict[str, Any],
) -> str:
    user_content = "\n\n".join([
        f"<inspection_meta>\n{json.dumps(meta, indent=2)}\n</inspection_meta>",
        "<deficiencies>\n"
        + json.dumps(deficiencies.model_dump(), indent=2)
        + "\n</deficiencies>",
        "Write the report body in Markdown: a summary paragraph, a findings "
        "section with one subsection per deficiency, and a closing statement of "
        "what the owner must do next. Do not include a signature block.",
    ])
    text, _ = text_call(
        client, meter,
        stage="report",
        model=REASONING_MODEL,
        system=system_blocks(REPORT_ROLE, corpus),
        user_content=user_content,
        max_tokens=MAX_TOKENS_REPORT,
        effort=EFFORT_REPORT,
    )
    return text


# --- 5. price proposal ------------------------------------------------------


def price_proposal(
    client,
    meter: CostMeter,
    *,
    deficiencies: DeficiencyList,
    price_book: dict[str, Any] | None,
) -> Proposal | None:
    """The ROI hook. Skipped when the customer supplied no price book."""
    if not price_book:
        return None
    user_content = "\n\n".join([
        f"<price_book>\n{json.dumps(price_book, indent=2)}\n</price_book>",
        "<deficiencies>\n"
        + json.dumps(deficiencies.model_dump(), indent=2)
        + "\n</deficiencies>",
        "Produce the priced proposal.",
    ])
    result, _ = structured_call(
        client, meter,
        stage="proposal",
        model=REASONING_MODEL,
        system=PROPOSAL_ROLE,
        user_content=user_content,
        schema=Proposal,
        max_tokens=MAX_TOKENS_PROPOSAL,
        effort=EFFORT_PROPOSAL,
    )
    return result
