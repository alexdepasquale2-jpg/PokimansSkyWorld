"""Thin call wrappers, plus the standards corpus and its cache discipline.

Every model call streams. On Opus 5 thinking is on by default and counts against
max_tokens, so budgets are large; streaming keeps a large budget from tripping
the SDK's non-streaming timeout guard.

The cache discipline here is not incidental. Per `02-stack-and-costs.md`, a
byte-unstable prompt prefix silently triples per-report cost — silently, because
nothing errors. `load_corpus` fingerprints the corpus and `assert_cache_engaged`
turns a cache miss into a visible warning instead of a quiet margin leak.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel

from .config import CACHE_MINIMUM_TOKENS
from .cost import CostMeter
from .schemas import strict_schema

T = TypeVar("T", bound=BaseModel)


class CorpusError(RuntimeError):
    pass


# --- standards corpus -------------------------------------------------------


class Corpus:
    def __init__(self, text: str, sha256: str, sources: list[str]):
        self.text = text
        self.sha256 = sha256
        self.sources = sources

    @property
    def approx_tokens(self) -> int:
        # Rough: ~4 chars/token. Only used to warn about the cache floor.
        return len(self.text) // 4


def load_corpus(directory: Path) -> Corpus:
    """Concatenate the standards corpus in a deterministic order.

    Sorted filenames matter: any reordering changes the prompt prefix and
    invalidates every cache entry downstream of it.
    """
    if not directory.is_dir():
        raise CorpusError(f"procedure library directory not found: {directory}")
    files = sorted(p for p in directory.glob("*.md") if p.name != "README.md")
    if not files:
        raise CorpusError(
            f"no .md procedure files in {directory}. See {directory / 'README.md'} — "
            "the library is authored content you must supply."
        )
    parts = [f"<<< {p.name} >>>\n{p.read_text()}" for p in files]
    text = "\n\n".join(parts)
    digest = hashlib.sha256(text.encode()).hexdigest()
    return Corpus(text=text, sha256=digest, sources=[p.name for p in files])


def check_corpus_stability(corpus: Corpus, state_path: Path) -> str | None:
    """Compare this run's corpus fingerprint with the previous run's."""
    previous = None
    if state_path.exists():
        previous = json.loads(state_path.read_text()).get("corpus_sha256")
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({"corpus_sha256": corpus.sha256}, indent=2))
    if previous and previous != corpus.sha256:
        return (
            "standards corpus changed since the last run — every cached prefix is "
            "now cold. Expect this run's cost to be unrepresentative."
        )
    return None


def system_blocks(role_prompt: str, corpus: Corpus) -> list[dict[str, Any]]:
    """Stable prefix, cache breakpoint on the last block.

    Nothing inspection-specific belongs here. Per-inspection content goes in the
    user turn, after the breakpoint, or the cache never hits twice.
    """
    return [
        {"type": "text", "text": role_prompt},
        {
            "type": "text",
            "text": f"<standards_corpus>\n{corpus.text}\n</standards_corpus>",
            "cache_control": {"type": "ephemeral"},
        },
    ]


def cache_warning(model: str, corpus: Corpus, usage) -> str | None:
    """Warn when caching silently failed to engage."""
    floor = CACHE_MINIMUM_TOKENS.get(model)
    if floor and corpus.approx_tokens < floor:
        return (
            f"corpus is ~{corpus.approx_tokens:,} tokens, below the {floor:,}-token "
            f"cache floor for {model}. Caching will not engage and per-report cost "
            "will not reflect production."
        )
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    written = getattr(usage, "cache_creation_input_tokens", 0) or 0
    if read == 0 and written == 0:
        return (
            f"{model}: no cache read and no cache write. The prefix is probably not "
            "byte-stable — check for interpolated timestamps or unsorted JSON."
        )
    return None


# --- calls ------------------------------------------------------------------


def structured_call(
    client,
    meter: CostMeter,
    *,
    stage: str,
    model: str,
    system: list[dict[str, Any]] | str,
    user_content: Any,
    schema: type[T],
    max_tokens: int,
    effort: str,
    measurement: bool = False,
) -> tuple[T, Any]:
    """Stream a schema-constrained response and validate it client-side."""
    params: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_content}],
        "output_config": {
            "effort": effort,
            "format": {"type": "json_schema", "schema": strict_schema(schema)},
        },
    }
    with meter.timed(stage, model, measurement=measurement):
        with client.messages.stream(**params) as stream:
            message = stream.get_final_message()

    meter.record(stage, model, message.usage, measurement=measurement)
    _guard_stop_reason(stage, message)
    text = "".join(b.text for b in message.content if b.type == "text")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:  # pragma: no cover - shape is API-guaranteed
        raise RuntimeError(f"{stage}: response was not valid JSON: {exc}\n{text[:500]}")
    return schema.model_validate(data), message.usage


def text_call(
    client,
    meter: CostMeter,
    *,
    stage: str,
    model: str,
    system: list[dict[str, Any]] | str,
    user_content: Any,
    max_tokens: int,
    effort: str,
) -> tuple[str, Any]:
    """Stream a prose response."""
    with meter.timed(stage, model):
        with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
            output_config={"effort": effort},
        ) as stream:
            message = stream.get_final_message()

    meter.record(stage, model, message.usage)
    _guard_stop_reason(stage, message)
    return "".join(b.text for b in message.content if b.type == "text"), message.usage


def _guard_stop_reason(stage: str, message) -> None:
    """Fail loudly on truncation or refusal rather than scoring a partial result."""
    reason = getattr(message, "stop_reason", None)
    if reason == "max_tokens":
        raise RuntimeError(
            f"{stage}: hit max_tokens. On Opus 5 thinking counts against the same "
            "budget — raise the limit in config.py rather than trimming the prompt."
        )
    if reason == "refusal":
        details = getattr(message, "stop_details", None)
        category = getattr(details, "category", None) if details else None
        raise RuntimeError(f"{stage}: request refused (category={category}).")
