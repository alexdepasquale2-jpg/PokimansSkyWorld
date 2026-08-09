"""Jurisdiction amendments applied over a base edition.

The claim in `03-product-concept.md` is that adding a jurisdiction is a
configuration change rather than an engineering ticket. This is the file that
has to be true for that claim to hold.

Amendment format — plain text, one directive per block:

    # Travis County amendments to NFPA 25 (2023)

    ## replace 13.2.5
    Control valves shall be inspected monthly rather than quarterly.

    ## add 13.2.9
    A local knox-box key shall be verified at each annual inspection.

    ## delete 5.2.1

`replace` and `add` take body text; `delete` takes none. Anything else is a
parse error rather than a silent no-op — an amendment that quietly fails to
apply produces a citation that is wrong for the jurisdiction, which is worse
than one that is missing.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass

from .model import Chapter, Clause, Corpus, _chapter_of, _find_or_add_chapter

DIRECTIVE_RE = re.compile(r"^##\s+(replace|add|delete)\s+((?:[A-Z]\.)?\d+(?:\.\d+)+)\s*$", re.I)
TITLE_RE = re.compile(r"^#\s+(.+?)\s*$")


@dataclass
class Amendment:
    action: str   # replace | add | delete
    ref: str
    text: str = ""


class OverlayError(ValueError):
    pass


def parse_amendments(text: str) -> tuple[str, list[Amendment]]:
    title = ""
    amendments: list[Amendment] = []
    current: Amendment | None = None

    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip()

        if not title and (match := TITLE_RE.match(line)) and not line.startswith("##"):
            title = match.group(1)
            continue

        if line.startswith("##"):
            match = DIRECTIVE_RE.match(line)
            if not match:
                raise OverlayError(
                    f"line {lineno}: unrecognised directive {line!r}. "
                    "Expected '## replace|add|delete <clause-ref>'."
                )
            current = Amendment(action=match.group(1).lower(), ref=match.group(2))
            amendments.append(current)
            continue

        if line.strip() and current is not None:
            current.text = (current.text + " " + line.strip()).strip()

    for amendment in amendments:
        if amendment.action in ("replace", "add") and not amendment.text:
            raise OverlayError(f"'{amendment.action} {amendment.ref}' has no body text")
        if amendment.action == "delete" and amendment.text:
            raise OverlayError(f"'delete {amendment.ref}' should not have body text")

    if not amendments:
        raise OverlayError("no amendments found — check the file format")
    return title, amendments


def apply(base: Corpus, amendments: list[Amendment], *, jurisdiction: str) -> tuple[Corpus, list[str]]:
    """Return a new corpus with amendments applied. The base is not mutated."""
    result = copy.deepcopy(base)
    result.jurisdiction = jurisdiction
    index = result.clause_index()
    notes: list[str] = []

    for amendment in amendments:
        if amendment.action == "replace":
            clause = index.get(amendment.ref)
            if clause is None:
                raise OverlayError(
                    f"replace {amendment.ref}: no such clause in {base.standard} "
                    f"{base.edition}. Use 'add' if the jurisdiction is introducing it."
                )
            clause.text = amendment.text
            clause.amended_by = jurisdiction
            notes.append(f"replaced {amendment.ref}")

        elif amendment.action == "add":
            if amendment.ref in index:
                raise OverlayError(
                    f"add {amendment.ref}: clause already exists. Use 'replace'."
                )
            chapter = _find_or_add_chapter(result, _chapter_of(amendment.ref))
            clause = Clause(
                ref=amendment.ref,
                text=amendment.text,
                chapter=chapter.number,
                source_line=0,
                amended_by=jurisdiction,
            )
            chapter.clauses.append(clause)
            _sort_clauses(chapter)
            index[amendment.ref] = clause
            notes.append(f"added {amendment.ref}")

        else:  # delete
            clause = index.pop(amendment.ref, None)
            if clause is None:
                raise OverlayError(f"delete {amendment.ref}: no such clause")
            for chapter in result.chapters:
                chapter.clauses = [c for c in chapter.clauses if c.ref != amendment.ref]
            notes.append(f"deleted {amendment.ref}")

    result.chapters = [ch for ch in result.chapters if ch.clauses]
    return result, notes


def _sort_clauses(chapter: Chapter) -> None:
    """Numeric-segment sort so 13.2.10 follows 13.2.9 rather than 13.2.1."""
    def key(clause: Clause):
        parts = []
        for segment in clause.ref.split("."):
            parts.append((0, int(segment)) if segment.isdigit() else (1, 0, segment))
        return parts
    chapter.clauses.sort(key=key)
