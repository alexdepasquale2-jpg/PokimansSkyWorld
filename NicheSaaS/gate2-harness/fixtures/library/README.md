# Procedure library

`load_corpus()` concatenates every `*.md` file here **in sorted filename order**
and pins it as the cached prompt prefix. This README is skipped.

## What this is

**Independently authored inspection procedures that we own.** Each states what a
technician checks and what makes a finding a deficiency, in our own words, and
carries a `maps_to` reference to the clause of the published standard it relates
to.

It is not the standard, does not reproduce the standard's wording, and is not a
substitute for it. The inspecting contractor holds their own licensed copy.

## Why it is authored rather than licensed

Three reasons, in order of how much they matter:

**It is an asset we own.** A licensed corpus is a commodity — any competitor can
license the same text and be at parity on day one. An authored library improves
with every inspection we process, encodes what our customers actually get pulled
up on, and cannot be acquired by writing a cheque. It is the second moat
alongside multi-year customer history.

**It removes a dependency that could have ended the business.** No licence
negotiation, no per-seat fee eating the margin, no counterparty who can change
terms once we have customers.

**It is more honest about what the product does.** The product's value was never
"here is the standard" — the contractor already has the standard. It is "here is
what to check, and here is a draft finding written up." That is our work, and
saying so is more defensible than implying authority we do not hold.

## The legal line — read this before authoring

**Clause references are facts.** Citing `NFPA 25 § 13.2.5` is like citing a case
number. That is not the protected part.

**Expression is what is protected.** Copying the standard's sentences, or
paraphrasing them closely enough that ours is recognisably a rewrite of theirs,
is where the risk lives — and systematically shadowing an entire standard can be
a derivative work even when no sentence matches.

Authoring discipline that keeps this clean:

1. **Write from the practice, not from the page.** Procedures should read like a
   senior technician explaining what they check and why — because that is what
   they are. If a procedure reads like a rewritten clause, it probably is one.
2. **Never open the standard and rewrite alongside it.** Draft from field
   knowledge and inspection reports, then use the standard only to confirm the
   `maps_to` reference is right.
3. **Add what the standard does not have.** Severity calls, what to photograph
   and from where, how to phrase the finding, what "incomplete" looks like versus
   a pass. This is the part customers pay for and the part that is unambiguously
   ours.
4. **Record authorship.** `corpus.py ingest --author` writes it into the
   manifest. Provenance you can produce later is worth having.
5. **Audit the library against this discipline periodically.** The controls are
   worth exactly what the practice is; a procedure written by rewriting alongside
   the page defeats all of them, and nothing downstream can detect that.

## Format

One procedure per heading. `maps_to` on its own line so the reference stays
literal and greppable — the extraction stage substring-checks every cited
reference against the library, and that check is what catches fabricated
citations.

```markdown
### P-25-08-2-2 · Gauge calibration interval
**maps_to:** SYN-25-08.2.2

Read the calibration date on the gauge tag. Replace or recalibrate at intervals
no longer than five years.

**Deficiency when:** the tag date is more than five years old, or no date can be
established.
**Severity:** major.
```

## Stable caching

Two rules, both cost decisions:

1. **Never reorder or rename files casually.** Sorted filename order determines
   the prefix bytes; a rename cold-starts every cache entry.
2. **Version in the filename**, so a revision is a new file rather than an edit
   to an old one and you can diff what changed:
   `nfpa25-72-itm-v1.md`, `nfpa25-72-itm-v2.md`.

## Jurisdictions

Local amendments are an overlay, not a fork — see
[`../../corpus_tools/README.md`](../../corpus_tools/README.md). One amendments
file per jurisdiction, applied with `corpus.py overlay`. This is what makes
"adding a jurisdiction is configuration, not an engineering ticket" true.
