"""Jurisdiction amendments applied over a base library version.

The claim in `03-product-concept.md` is that adding a jurisdiction is a
configuration change rather than an engineering ticket. This is the file that
has to be true for that claim to hold.

Amendment format — plain text, one directive per block:

    # Travis County amendments to the ITM library

    ## replace P-25-13-2-5
    Inspect control valves monthly rather than quarterly within Travis County.
    **Severity:** major.

    ## add P-TC-KNOX-1 · Knox-box key verification
    **maps_to:** TC-FIRE-4.2
    Verify the Knox-box key is present and turns the box at each annual visit.

    ## delete P-25-05-2-1

`replace` takes body text and keeps the existing id, title and reference.
`add` needs a title on the directive line and a `maps_to` in the body.
`delete` takes neither.

Anything malformed is a hard error rather than a silent no-op — an amendment
that quietly fails to apply produces a citation that is wrong for the
jurisdiction, which is worse than one that is missing.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass

from .library import MAPS_TO_RE, Library, Procedure, Section

DIRECTIVE_RE = re.compile(
    r"^##\s+(replace|add|delete)\s+([A-Za-z][\w\-.]*)\s*(?:[·|]\s*(.+?))?\s*$", re.I
)
TITLE_RE = re.compile(r"^#\s+(?!#)(.+?)\s*$")


@dataclass
class Amendment:
    action: str          # replace | add | delete
    procedure_id: str
    title: str = ""
    body: str = ""
    maps_to: str = ""


class OverlayError(ValueError):
    pass


def parse_amendments(text: str) -> tuple[str, list[Amendment]]:
    title = ""
    amendments: list[Amendment] = []
    current: Amendment | None = None
    body: list[str] = []

    def flush() -> None:
        nonlocal current, body
        if current is not None:
            current.body = "\n".join(body).strip()
            body = []

    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip()

        if not title and TITLE_RE.match(line) and not line.startswith("##"):
            title = TITLE_RE.match(line).group(1)
            continue

        if line.startswith("##"):
            flush()
            match = DIRECTIVE_RE.match(line)
            if not match:
                raise OverlayError(
                    f"line {lineno}: unrecognised directive {line!r}. Expected "
                    "'## replace|add|delete <procedure-id>' (add also needs '· Title')."
                )
            current = Amendment(
                action=match.group(1).lower(),
                procedure_id=match.group(2),
                title=(match.group(3) or "").strip(),
            )
            amendments.append(current)
            continue

        if (match := MAPS_TO_RE.match(line)) is not None and current is not None:
            current.maps_to = match.group(1)
            continue

        if current is not None:
            body.append(line)

    flush()

    for amendment in amendments:
        if amendment.action in ("replace", "add") and not amendment.body:
            raise OverlayError(f"'{amendment.action} {amendment.procedure_id}' has no body")
        if amendment.action == "delete" and amendment.body:
            raise OverlayError(f"'delete {amendment.procedure_id}' should not have a body")
        if amendment.action == "add" and not amendment.title:
            raise OverlayError(f"'add {amendment.procedure_id}' needs a title: '## add ID · Title'")
        if amendment.action == "add" and not amendment.maps_to:
            raise OverlayError(f"'add {amendment.procedure_id}' needs a **maps_to:** line")

    if not amendments:
        raise OverlayError("no amendments found — check the file format")
    return title, amendments


def apply(base: Library, amendments: list[Amendment], *, jurisdiction: str) -> tuple[Library, list[str]]:
    """Return a new library with amendments applied. The base is not mutated."""
    result = copy.deepcopy(base)
    result.jurisdiction = jurisdiction
    index = result.index()
    notes: list[str] = []

    for amendment in amendments:
        if amendment.action == "replace":
            procedure = index.get(amendment.procedure_id)
            if procedure is None:
                raise OverlayError(
                    f"replace {amendment.procedure_id}: no such procedure. "
                    "Use 'add' if the jurisdiction is introducing one."
                )
            procedure.body = amendment.body
            if amendment.maps_to:
                procedure.maps_to = amendment.maps_to
            procedure.amended_by = jurisdiction
            notes.append(f"replaced {amendment.procedure_id}")

        elif amendment.action == "add":
            if amendment.procedure_id in index:
                raise OverlayError(
                    f"add {amendment.procedure_id}: already exists. Use 'replace'."
                )
            section = _local_section(result, jurisdiction)
            procedure = Procedure(
                id=amendment.procedure_id, title=amendment.title,
                maps_to=amendment.maps_to, body=amendment.body,
                section=section.title, amended_by=jurisdiction,
            )
            section.procedures.append(procedure)
            index[procedure.id] = procedure
            notes.append(f"added {amendment.procedure_id}")

        else:  # delete
            if index.pop(amendment.procedure_id, None) is None:
                raise OverlayError(f"delete {amendment.procedure_id}: no such procedure")
            for section in result.sections:
                section.procedures = [
                    p for p in section.procedures if p.id != amendment.procedure_id
                ]
            notes.append(f"deleted {amendment.procedure_id}")

    result.sections = [s for s in result.sections if s.procedures]
    return result, notes


def _local_section(library: Library, jurisdiction: str) -> Section:
    """Jurisdiction additions live in their own section.

    Keeping them separate means a reviewer can see at a glance what is local,
    and the base library stays diffable across jurisdictions.
    """
    title = f"Local requirements — {jurisdiction}"
    for section in library.sections:
        if section.title == title:
            return section
    section = Section(title=title)
    library.sections.append(section)
    return section
