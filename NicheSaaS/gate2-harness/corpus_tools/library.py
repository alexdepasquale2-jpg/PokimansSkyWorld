"""The procedure library data model.

A procedure is the unit, not a clause. Each one states — in our words — what a
technician checks and what makes a finding a deficiency, and carries a
`maps_to` reference identifying the published clause it relates to. That
reference is a factual citation; the procedure body is our authored content.

Authored format:

    ## Water-based suppression

    ### P-25-08-2-2 · Gauge calibration interval
    **maps_to:** SYN-25-08.2.2

    Read the calibration date on the gauge tag...

    **Deficiency when:** the tag date is more than five years old.
    **Severity:** major.

Two invariants everything downstream depends on:

1. **Ids and references stay literal and greppable.** The extraction stage
   substring-checks every cited reference against the library to catch
   fabricated citations. Reformatting breaks that check silently.
2. **File order is deterministic.** Sorted filename order is the cached prompt
   prefix; a rename cold-starts every cache entry.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

SECTION_RE = re.compile(r"^##\s+(?!#)(.+?)\s*$")
PROCEDURE_RE = re.compile(r"^###\s+([A-Za-z][\w\-.]*)\s*[·|]\s*(.+?)\s*$")
MAPS_TO_RE = re.compile(r"^\*\*maps_to:\*\*\s*(\S+)\s*$")
TITLE_RE = re.compile(r"^#\s+(?!#)(.+?)\s*$")


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)[:48] or "untitled"


@dataclass
class Procedure:
    id: str
    title: str
    maps_to: str
    body: str
    section: str
    amended_by: str = ""

    def render(self) -> str:
        lines = [f"### {self.id} · {self.title}", f"**maps_to:** {self.maps_to}", ""]
        lines.append(self.body.strip())
        return "\n".join(lines)


@dataclass
class Section:
    title: str
    procedures: list[Procedure] = field(default_factory=list)

    def filename(self, standard: str, version: str, index: int) -> str:
        """Zero-padded index keeps sort order stable as sections are added."""
        return f"{standard.lower()}-{version}-{index:02d}-{slugify(self.title)}.md"

    def render(self, standard: str, version: str) -> str:
        lines = [f"# {standard} {version} — {self.title}"]
        amended = sorted(
            {p.id: p.amended_by for p in self.procedures if p.amended_by}.items()
        )
        if amended:
            by = amended[0][1]
            lines.append(f"_Locally amended for {by}: {', '.join(i for i, _ in amended)}._")
        lines.append("")
        for procedure in self.procedures:
            lines.append(procedure.render())
            lines.append("")
        return "\n".join(lines).rstrip() + "\n"


@dataclass
class Library:
    standard: str
    version: str
    sections: list[Section] = field(default_factory=list)
    jurisdiction: str = ""
    author: str = ""

    @property
    def procedures(self) -> list[Procedure]:
        return [p for s in self.sections for p in s.procedures]

    def index(self) -> dict[str, Procedure]:
        return {p.id: p for p in self.procedures}

    def files(self) -> dict[str, str]:
        rendered = {
            section.filename(self.standard, self.version, i): section.render(
                self.standard, self.version
            )
            for i, section in enumerate(self.sections, start=1)
        }
        return {name: rendered[name] for name in sorted(rendered)}

    def fingerprint(self) -> str:
        """Matches how the harness concatenates: sorted filenames, same wrapper."""
        joined = "\n\n".join(
            f"<<< {name} >>>\n{content}" for name, content in self.files().items()
        )
        return hashlib.sha256(joined.encode()).hexdigest()

    @property
    def approx_tokens(self) -> int:
        return sum(len(c) for c in self.files().values()) // 4


def parse(text: str, *, standard: str, version: str) -> tuple[Library, list[str]]:
    """Parse an authored procedure library.

    Conservative: anything that is not a recognised structural line becomes body
    text of the current procedure. Text appearing before any procedure is
    reported rather than silently attached to the wrong one.
    """
    library = Library(standard=standard, version=version)
    warnings: list[str] = []
    section: Section | None = None
    procedure: Procedure | None = None
    body: list[str] = []

    def flush() -> None:
        nonlocal procedure, body
        if procedure is not None:
            procedure.body = "\n".join(body).strip()
            body = []
            procedure = None

    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip()

        if TITLE_RE.match(line):           # document title — structural, ignored
            flush()
            continue

        if (match := SECTION_RE.match(line)) is not None:
            flush()
            section = Section(title=match.group(1))
            library.sections.append(section)
            continue

        if (match := PROCEDURE_RE.match(line)) is not None:
            flush()
            if section is None:
                section = Section(title="Procedures")
                library.sections.append(section)
            procedure = Procedure(
                id=match.group(1), title=match.group(2), maps_to="",
                body="", section=section.title,
            )
            section.procedures.append(procedure)
            continue

        if (match := MAPS_TO_RE.match(line)) is not None:
            if procedure is None:
                warnings.append(f"line {lineno}: maps_to outside any procedure")
            else:
                procedure.maps_to = match.group(1)
            continue

        if procedure is not None:
            body.append(line)
        elif line.strip() and not line.startswith(">"):
            warnings.append(f"line {lineno}: text outside any procedure: {line[:50]!r}")

    flush()
    library.sections = [s for s in library.sections if s.procedures]
    if not library.procedures:
        warnings.append("no procedures recognised — check the authored format")
    return library, warnings
