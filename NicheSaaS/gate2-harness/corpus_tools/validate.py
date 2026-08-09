"""Corpus integrity checks.

Everything here guards a failure that is silent in production: a duplicate
clause reference makes the extraction stage's fabricated-citation check
ambiguous, a corpus under the cache floor triples per-report cost without
erroring, and unstable filename ordering cold-starts the cache on every run.

None of these raise at request time. They just cost money or credibility.
"""

from __future__ import annotations

from dataclasses import dataclass

from harness.config import CACHE_MINIMUM_TOKENS, REASONING_MODEL

from .model import Corpus


@dataclass
class Finding:
    level: str   # error | warn | info
    message: str


def validate(corpus: Corpus, *, model: str = REASONING_MODEL) -> list[Finding]:
    findings: list[Finding] = []

    if not corpus.clauses:
        findings.append(Finding("error", "corpus contains no clauses"))
        return findings

    # 1. Duplicate references break the fabricated-citation substring check.
    seen: dict[str, int] = {}
    for clause in corpus.clauses:
        seen[clause.ref] = seen.get(clause.ref, 0) + 1
    for ref, count in sorted(seen.items()):
        if count > 1:
            findings.append(Finding("error", f"clause {ref} appears {count} times"))

    # 2. A clause whose reference does not survive rendering cannot be verified.
    rendered = "\n".join(corpus.files().values())
    for clause in corpus.clauses:
        if clause.ref not in rendered:
            findings.append(
                Finding("error", f"clause {clause.ref} is not greppable in rendered output")
            )

    # 3. Empty or stub clause bodies produce citations with nothing to quote.
    for clause in corpus.clauses:
        if len(clause.text.strip()) < 12:
            findings.append(
                Finding("warn", f"clause {clause.ref} has a very short body: {clause.text[:40]!r}")
            )

    # 4. Filename ordering must be deterministic and collision-free.
    names = list(corpus.files().keys())
    if names != sorted(names):
        findings.append(Finding("error", "file ordering is not sorted — cache prefix unstable"))
    if len(set(names)) != len(names):
        findings.append(Finding("error", "duplicate filenames — chapters would overwrite"))

    # 5. Below the model's cache floor, caching silently never engages.
    floor = CACHE_MINIMUM_TOKENS.get(model)
    if floor and corpus.approx_tokens < floor:
        findings.append(Finding(
            "warn",
            f"~{corpus.approx_tokens:,} tokens is below the {floor:,}-token cache floor "
            f"for {model}; caching will not engage and cost will not reflect production",
        ))

    # 6. Chapter coverage — a gap usually means a parse failure, not a real gap.
    numbers = sorted({ch.number for ch in corpus.chapters})
    missing = [n for n in range(numbers[0], numbers[-1] + 1) if n not in numbers]
    if missing:
        findings.append(Finding(
            "info", f"no clauses parsed for chapter(s) {missing} — verify against the source"
        ))

    findings.append(Finding(
        "info",
        f"{len(corpus.clauses):,} clauses across {len(corpus.chapters)} chapters, "
        f"~{corpus.approx_tokens:,} tokens, fingerprint {corpus.fingerprint()[:12]}",
    ))
    return findings


def has_errors(findings: list[Finding]) -> bool:
    return any(f.level == "error" for f in findings)
