"""Library integrity and coverage checks.

Everything here guards a failure that is silent in production: a duplicate
reference makes the fabricated-citation check ambiguous, a library under the
cache floor triples per-report cost without erroring, and unstable filename
ordering cold-starts the cache on every run.

None of these raise at request time. They cost money or credibility instead.
"""

from __future__ import annotations

from dataclasses import dataclass

from harness.config import CACHE_MINIMUM_TOKENS, REASONING_MODEL

from .library import Library


@dataclass
class Finding:
    level: str   # error | warn | info
    message: str


def validate(library: Library, *, model: str = REASONING_MODEL) -> list[Finding]:
    findings: list[Finding] = []

    if not library.procedures:
        findings.append(Finding("error", "library contains no procedures"))
        return findings

    # 1. Duplicate ids break the procedure_id the extraction stage records.
    seen: dict[str, int] = {}
    for procedure in library.procedures:
        seen[procedure.id] = seen.get(procedure.id, 0) + 1
    for pid, count in sorted(seen.items()):
        if count > 1:
            findings.append(Finding("error", f"procedure id {pid} appears {count} times"))

    # 2. Two procedures claiming the same clause makes the citation ambiguous.
    by_ref: dict[str, list[str]] = {}
    for procedure in library.procedures:
        if procedure.maps_to:
            by_ref.setdefault(procedure.maps_to, []).append(procedure.id)
    for ref, ids in sorted(by_ref.items()):
        if len(ids) > 1:
            findings.append(
                Finding("warn", f"clause {ref} is claimed by {len(ids)} procedures: {ids}")
            )

    # 3. A procedure with no reference cannot be cited in a filing.
    for procedure in library.procedures:
        if not procedure.maps_to:
            findings.append(Finding("error", f"{procedure.id} has no maps_to reference"))

    # 4. Ids and references must survive rendering, or the guard cannot check them.
    rendered = "\n".join(library.files().values())
    for procedure in library.procedures:
        if procedure.id not in rendered:
            findings.append(Finding("error", f"{procedure.id} is not greppable after render"))
        if procedure.maps_to and procedure.maps_to not in rendered:
            findings.append(
                Finding("error", f"{procedure.id}: reference {procedure.maps_to} not greppable")
            )

    # 5. A stub body gives the model nothing to ground a finding in.
    for procedure in library.procedures:
        if len(procedure.body.strip()) < 40:
            findings.append(
                Finding("warn", f"{procedure.id} has a very short body "
                                f"({len(procedure.body.strip())} chars)")
            )

    # 6. Ordering must be deterministic and collision-free.
    names = list(library.files().keys())
    if names != sorted(names):
        findings.append(Finding("error", "file ordering is not sorted — cache prefix unstable"))
    if len(set(names)) != len(names):
        findings.append(Finding("error", "duplicate filenames — sections would overwrite"))

    # 7. Below the cache floor, caching silently never engages.
    floor = CACHE_MINIMUM_TOKENS.get(model)
    if floor and library.approx_tokens < floor:
        findings.append(Finding(
            "warn",
            f"~{library.approx_tokens:,} tokens is below the {floor:,}-token cache floor "
            f"for {model}; caching will not engage and cost will not reflect production",
        ))

    if not library.author:
        findings.append(Finding(
            "warn",
            "no author recorded — provenance you can produce later is worth having "
            "(corpus.py ingest --author)",
        ))

    findings.append(Finding(
        "info",
        f"{len(library.procedures)} procedures across {len(library.sections)} sections, "
        f"~{library.approx_tokens:,} tokens, fingerprint {library.fingerprint()[:12]}",
    ))
    return findings


# --- coverage ---------------------------------------------------------------


@dataclass
class Coverage:
    covered: list[str]
    missing: list[str]
    out_of_scope: list[str]

    @property
    def ratio(self) -> float:
        total = len(self.covered) + len(self.missing)
        return len(self.covered) / total if total else 0.0


def coverage(library: Library, scope: list[str]) -> Coverage:
    """Which in-scope clauses have a procedure, and which do not.

    This is the readiness measure. A library that grounds 40% of the clauses an
    inspection touches will silently under-report deficiencies — the model has
    nothing to cite, so it records fewer findings and Gate 2 reads as a model
    failure when it is a content gap.
    """
    mapped = {p.maps_to for p in library.procedures if p.maps_to}
    scope_set = set(scope)
    return Coverage(
        covered=sorted(scope_set & mapped),
        missing=sorted(scope_set - mapped),
        out_of_scope=sorted(mapped - scope_set),
    )


def has_errors(findings: list[Finding]) -> bool:
    return any(f.level == "error" for f in findings)
