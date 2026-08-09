# Corpus tooling

Authored procedure library → the clause-addressable corpus the harness reads.

Driven by `../corpus.py`. Nothing here touches the API or costs money.

```sh
# 1. Base library version
python corpus.py ingest --source drafts/itm-v2.md \
                        --standard NFPA25 --edition 2023 \
                        --out ~/gate2/library-v2

# 2. Jurisdiction overlay
python corpus.py overlay --base ~/gate2/library-v2 \
                         --amendments jurisdictions/travis-county.txt \
                         --jurisdiction travis-county \
                         --out ~/gate2/library-travis-county

# 3. Check before use
python corpus.py validate ~/gate2/library-travis-county

# 4. Run the harness against it
python run.py --all ~/gate2/inspections --library ~/gate2/library-travis-county
```

**The library belongs in version control.** It is authored content we own — the
asset, not a liability. What must never land in the repo is customer inspection
data, or licensed standards text if you ever convert a purchased copy for
reference.

## The library is a matrix, not a document

A base library version mapped to a standard edition, plus the amendments the
local AHJ actually enforces. `NFPA25 2023` and `NFPA25 2023 + Travis County` are
different libraries producing different correct answers, and citing the wrong one
yields a reference that is technically grounded and practically useless — the
failure incumbents are known for.

This is why the plan claims adding a jurisdiction is a configuration change:
`overlay` is that change. One amendments file per jurisdiction, no code.

## Amendment format

```
# Travis County amendments to NFPA 25 (2023)

## replace 13.2.5
Control valves shall be inspected monthly rather than quarterly.

## add 13.2.9
A local Knox-box key shall be verified at each annual inspection.

## delete 5.2.1
```

`replace` and `add` take body text; `delete` takes none. Anything malformed is a
hard error rather than a silent skip — an amendment that quietly fails to apply
produces a citation that is wrong for the jurisdiction, which is worse than one
that is missing.

`replace` on a clause that does not exist, or `add` on one that does, both fail
loudly. They are usually a sign the base edition is wrong.

## Two invariants everything depends on

**Clause references stay literal and greppable.** The extraction stage
substring-checks every cited clause against the corpus to catch fabricated
citations. Reformatting a reference breaks that check silently, so refs are
copied through verbatim and `validate` confirms each one survives rendering.

**Filenames are generated and never hand-edited.** Sorted filename order *is*
the cached prompt prefix; a rename reshuffles the corpus and cold-starts every
cache entry. Chapter numbers are zero-padded so ordering stays stable as the
corpus grows.

## Provenance is not stored in clause text

An amendment marker rendered inline (`**13.2.5** _(amended: x)_ Control valves…`)
ends up inside the model's `requirement_basis` — putting "(amended: travis-county)"
into the quoted sentence of a filed compliance document. It also breaks the
parse → render round trip, so the fingerprint drifts and caching cold-starts.

Provenance therefore lives in the chapter header and in `manifest.json`, and the
round trip is asserted in `selftest.py`.

## What `validate` catches

| Check | Why it is silent otherwise |
|---|---|
| Duplicate clause refs | Makes the fabricated-citation check ambiguous |
| Refs not greppable after render | Disables that check entirely |
| Very short clause bodies | Citations with nothing useful to quote |
| Unsorted or colliding filenames | Unstable cache prefix |
| Corpus below the model's cache floor | Caching never engages; ~3× cost, no error |
| Chapter gaps | Usually a parse failure, not a real gap |
| Fingerprint ≠ manifest | Files edited by hand since ingest |

## Source formats

`ingest` reads plain text with NFPA-style numbering (`13.2.5 Control valves
shall…`), one clause per line, continuation lines indented or wrapped. Markdown
headings and italic metadata lines are treated as structure, so an
already-rendered corpus re-ingests cleanly.

**PDF is not handled.** Extracting clause structure from a standards PDF is its
own problem — two-column layouts, running headers, and tables all produce
plausible-looking garbage. Convert to text first, eyeball the result, then
ingest. `validate`'s chapter-gap check is the fastest way to spot an extraction
that quietly dropped a section.
