# Corpus tooling

Authored procedure library → the corpus the harness reads, plus jurisdiction overlays and coverage.

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

## Coverage — the readiness measure

```sh
python corpus.py coverage ~/gate2/library-v2 --scope scope/nfpa25-annual.txt
```

**A thin library fails Gate 2 as though the model were at fault.** If a library
grounds 40% of the clauses an inspection touches, the model has nothing to cite
for the rest, records fewer findings, and extraction accuracy reads as a
capability problem when it is a content gap. `coverage` separates the two, and
exits non-zero below the threshold so it can gate a run.

Build the scope file from **the inspection forms your customers actually file**,
not from the standard's table of contents. Coverage against the whole standard
is the wrong denominator and will read as failure forever. Worked example:
`fixtures/library/SCOPE-example.txt`.

## Two invariants everything depends on

**Ids and references stay literal and greppable.** The extraction stage
substring-checks every cited reference against the library to catch fabricated
citations. Reformatting breaks that check silently, so `validate` confirms every
id and `maps_to` survives rendering.

**Filenames are generated and never hand-edited.** Sorted filename order *is*
the cached prompt prefix; a rename reshuffles the corpus and cold-starts every
cache entry. Chapter numbers are zero-padded so ordering stays stable as the
corpus grows.

## Provenance is not stored in procedure text

An amendment marker rendered inline ends up inside the model's
`requirement_basis` — putting "(amended: travis-county)" into a filed compliance
document. It also breaks the parse → render round trip, so the fingerprint drifts
and caching cold-starts.

Provenance therefore lives in the section header and in `manifest.json`, and the
round trip is asserted in `selftest.py`.

**Section membership is recorded in the manifest too**, for the same reason: each
rendered file's H1 is indistinguishable from an authored document title, so a
reload would collapse every section into one and the fingerprint would drift.

## What `validate` catches

| Check | Why it is silent otherwise |
|---|---|
| Duplicate procedure ids | Breaks the `procedure_id` recorded on every finding |
| Two procedures claiming one clause | Makes the citation ambiguous |
| Missing `maps_to` | A procedure that cannot be cited in a filing |
| Ids/refs not greppable after render | Disables the fabricated-citation check |
| Very short procedure bodies | Nothing for the model to ground a finding in |
| Unsorted or colliding filenames | Unstable cache prefix |
| Library below the model's cache floor | Caching never engages; ~3× cost, no error |
| No author recorded | Provenance you cannot produce later |
| Fingerprint ≠ manifest | Files edited by hand since ingest |

## Authored format

```markdown
## Water-based suppression

### P-25-08-2-2 · Gauge calibration interval
**maps_to:** SYN-25-08.2.2

Read the calibration date on the gauge tag. Replace or recalibrate at intervals
no longer than five years.

**Deficiency when:** the tag date is more than five years old, or no date can be
established.
**Severity:** major.
```

`##` opens a section, `### <id> · <title>` opens a procedure, `**maps_to:**`
carries the clause reference, and everything else is body. A rendered library
re-ingests cleanly, so `ingest → overlay → ingest` is safe.

**There is no importer for published standards text, deliberately.** The library
is authored, not converted. A tool that ingests a standard and emits "our"
procedures would produce a derivative work with extra steps — see
[`../fixtures/library/README.md`](../fixtures/library/README.md) for the
authoring discipline.
