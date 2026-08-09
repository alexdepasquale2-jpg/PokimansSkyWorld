"""Corpus data model and clause parsing.

A corpus is not one document. It is an **edition × jurisdiction matrix**: a base
standard at a given edition, plus the local amendments the AHJ actually enforces.
Getting that wrong produces citations that are correct for the wrong edition —
technically grounded, practically useless, and exactly the failure incumbents are
known for.

Two invariants everything downstream depends on:

1. **Clause references are literal, greppable strings.** The extraction stage
   substring-checks every cited clause against the corpus text to catch
   fabricated citations. Reformatting a reference breaks that check silently.
2. **File order is deterministic.** Sorted filename order is the cached prompt
   prefix. A rename reshuffles the corpus and cold-starts every cache entry, so
   filenames are generated, zero-padded, and never hand-edited.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

# NFPA-style numbering: "13.2.5", "5.1.1.2", optionally with a trailing letter
# ("A.13.2.5" annex material is captured too, with the prefix preserved).
CLAUSE_RE = re.compile(
    r"^\s{0,3}((?:[A-Z]\.)?\d+(?:\.\d+)+)\s+(?=\S)(.*)$"
)
CHAPTER_RE = re.compile(
    r"^\s{0,3}(?:Chapter\s+)?(\d+)\s+([A-Z][^.]{2,80})\s*$"
)
# Structural lines in an already-rendered corpus. Without these, concatenating
# chapter files makes each chapter's heading continue the previous chapter's
# last clause — silently corrupting the final clause of every chapter.
MD_HEADING_RE = re.compile(r"^#{1,6}\s+(.*)$")
RENDERED_CHAPTER_RE = re.compile(r"^#\s+.*?Chapter\s+(\d+):\s*(.+?)\s*$")
ITALIC_META_RE = re.compile(r"^_[^_].*_\s*$")


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return re.sub(r"-{2,}", "-", slug)[:48] or "untitled"


@dataclass
class Clause:
    ref: str            # "13.2.5" — the literal string that must stay greppable
    text: str
    chapter: int
    source_line: int
    amended_by: str = "" # jurisdiction id, when an overlay replaced this clause

    @property
    def qualified_ref(self) -> str:
        return self.ref


@dataclass
class Chapter:
    number: int
    title: str
    clauses: list[Clause] = field(default_factory=list)

    def filename(self, standard: str, edition: str) -> str:
        """Zero-padded so sort order stays stable as the corpus grows."""
        return f"{standard.lower()}-{edition}-ch{self.number:02d}-{slugify(self.title)}.md"

    def render(self, standard: str, edition: str) -> str:
        """Render the chapter.

        Amendment provenance goes in the header, never inline with a clause.
        A marker inside the clause line ends up inside the model's
        `requirement_basis` — putting "(amended: travis-county)" into the quoted
        sentence of a filed compliance document — and it also breaks the
        parse → render round trip, so the corpus fingerprint drifts.
        """
        lines = [f"# {standard} {edition} — Chapter {self.number}: {self.title}"]
        amended = sorted(
            {c.ref: c.amended_by for c in self.clauses if c.amended_by}.items()
        )
        if amended:
            by = amended[0][1]
            refs = ", ".join(ref for ref, _ in amended)
            lines.append(f"_Locally amended for {by}: {refs}._")
        lines.append("")
        for clause in self.clauses:
            lines.append(f"**{clause.ref}** {clause.text}")
            lines.append("")
        return "\n".join(lines).rstrip() + "\n"


@dataclass
class Corpus:
    standard: str
    edition: str
    chapters: list[Chapter] = field(default_factory=list)
    jurisdiction: str = ""

    @property
    def clauses(self) -> list[Clause]:
        return [c for ch in self.chapters for c in ch.clauses]

    def clause_index(self) -> dict[str, Clause]:
        return {c.ref: c for c in self.clauses}

    def files(self) -> dict[str, str]:
        """filename -> content, in the order load_corpus() will concatenate them."""
        rendered = {
            ch.filename(self.standard, self.edition): ch.render(self.standard, self.edition)
            for ch in self.chapters
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


def parse(text: str, *, standard: str, edition: str) -> tuple[Corpus, list[str]]:
    """Parse a plain-text standard into chapters and clauses.

    Deliberately conservative: a line that does not look like a clause is
    appended to the previous clause rather than guessed at. Over-eager parsing
    of legal text invents clause boundaries, and a wrong boundary produces a
    citation whose quoted sentence is not the one the reference points at.
    """
    corpus = Corpus(standard=standard, edition=edition)
    warnings: list[str] = []
    current_chapter: Chapter | None = None
    current_clause: Clause | None = None

    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip()
        if not line.strip():
            continue

        # Structural lines terminate the current clause; they never continue it.
        if ITALIC_META_RE.match(line):
            continue
        if (heading := MD_HEADING_RE.match(line)) is not None:
            current_clause = None
            if (rendered := RENDERED_CHAPTER_RE.match(line)) is not None:
                current_chapter = _find_or_add_chapter(corpus, int(rendered.group(1)))
                current_chapter.title = rendered.group(2).strip()
            elif (inline := CHAPTER_RE.match(heading.group(1))) is not None:
                current_chapter = _find_or_add_chapter(corpus, int(inline.group(1)))
                current_chapter.title = inline.group(2).strip()
            continue

        chapter_match = CHAPTER_RE.match(line)
        clause_match = CLAUSE_RE.match(line)

        # A chapter heading and a clause can look alike; the clause pattern
        # requires a dot, so it wins when both match.
        if chapter_match and not clause_match:
            number = int(chapter_match.group(1))
            current_chapter = Chapter(number=number, title=chapter_match.group(2).strip())
            corpus.chapters.append(current_chapter)
            current_clause = None
            continue

        if clause_match:
            ref, body = clause_match.group(1), clause_match.group(2).strip()
            chapter_number = _chapter_of(ref)
            if current_chapter is None or current_chapter.number != chapter_number:
                current_chapter = _find_or_add_chapter(corpus, chapter_number)
            current_clause = Clause(
                ref=ref, text=body, chapter=chapter_number, source_line=lineno
            )
            current_chapter.clauses.append(current_clause)
            continue

        if current_clause is not None:
            current_clause.text += " " + line.strip()
        else:
            warnings.append(f"line {lineno}: text before any clause, dropped: {line[:60]!r}")

    if not corpus.chapters:
        warnings.append("no chapters or clauses recognised — check the source format")
    return corpus, warnings


def _chapter_of(ref: str) -> int:
    head = ref.split(".")[0]
    if head.isalpha():                       # annex "A.13.2.5" -> chapter 13
        head = ref.split(".")[1]
    return int(head)


def _find_or_add_chapter(corpus: Corpus, number: int) -> Chapter:
    for chapter in corpus.chapters:
        if chapter.number == number:
            return chapter
    chapter = Chapter(number=number, title=f"Chapter {number}")
    corpus.chapters.append(chapter)
    return chapter
