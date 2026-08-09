# Gate 2 feasibility harness

Audio and photos in, draft NFPA-cited report out, plus the four numbers
[Gate 2](../04-validation-sprint.md) turns on.

**Disposable by design.** No UI, no database, no auth, nothing meant to survive
into the product. It exists to answer one question — does the value hypothesis
hold at current model capability — and the honest outcomes are "yes, build it"
or "no, stop."

## Quick start

```sh
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

python selftest.py                              # offline, no key, no spend
python fixtures/make_fixtures.py                # synthetic inspection
python run.py --all fixtures/inspections --dry-run

export ANTHROPIC_API_KEY=sk-ant-...
python run.py --all fixtures/inspections
```

Against real inspections:

```sh
python run.py --all ~/gate2/inspections --library ~/gate2/library --out ~/gate2/out
```

`DEEPGRAM_API_KEY` is only needed when an inspection ships audio rather than a
`transcript.txt`. The first transcription is written back to `transcript.txt`, so
re-runs while iterating on later stages are free.

## Inspection directory layout

```
demo-001/
  meta.json                    building, date, jurisdiction, scope
  transcript.txt               narration — or audio/ and let the harness transcribe
  audio/*.wav|m4a              optional if transcript.txt exists
  photos/                      field photos — any format a phone produces
  price-book.json              optional; without it the proposal stage is skipped
  reference-deficiencies.json  ground truth — or reference-report.md to parse one
```

Check a real directory before spending anything:

```sh
python run.py --all ~/gate2/inspections --library ~/gate2/library --dry-run
```

It counts photos the way the paid run will and names anything it cannot read.

### The reference is not optional, and it has to be collected up front

**Without `reference-report.md` or `reference-deficiencies.json`, the gate cannot
score at all** — there is nothing to compare against, and the run produces reports
nobody can grade.

The reference is **the report the shop wrote for that same inspection**, in their
normal format. So the ask for recordings is really two asks, and the second is
the one that gets forgotten: *record five inspections* **and** *send the reports
you write for those five*. Asking afterwards is worse than asking up front — by
then they know you are checking, which changes how carefully the report gets
written. Say plainly that you want it exactly as they normally write it, sent
whether or not they are happy with it.

Prior-year reports for *other* buildings are not references — those are for
scoping the procedure library, a different job with a different lead time
([`../08-critical-path.md`](../08-critical-path.md)).

### Photos: send what the phone produced

Drop the camera roll in as-is. The harness handles what field photos actually
look like ([`harness/images.py`](harness/images.py)):

- **HEIC is converted.** iPhones shoot HEIC by default and the API does not
  accept it. Without conversion, a default-configured phone contributes *zero*
  usable photos and the gate reads as a capability failure.
- **EXIF rotation is applied**, because a sideways photo of a gauge is harder to
  read and nothing warns you.
- **Oversized photos are downscaled** to the long edge the photo model actually
  uses. A 12MP original is ~4000px; sending eight of those per call is tens of
  megabytes of upload for pixels that get discarded.
- **Unreadable files are named, never skipped silently** — a missing photo looks
  exactly like a model that failed to find the deficiency it evidenced.

## Pipeline

| Stage | Model | Output |
|---|---|---|
| 1. transcribe | Deepgram (or committed transcript) | `transcript.txt` |
| 2. classify photos | `claude-haiku-4-5`, effort low | `photo-findings.json` |
| 3. extract deficiencies | `claude-opus-5`, effort high, library cached | `deficiencies.json` |
| 4. write report | `claude-opus-5`, effort medium | `report.md` |
| 5. price proposal | `claude-opus-5`, effort medium | `proposal.json` |
| score | `claude-opus-5` — **measurement, excluded from COGS** | `score.json` |

### Why the stages are split this way

Photos report what is **visible**. Extraction decides **compliance**, grounded
only in the supplied procedure library. The report writes prose from **decided** findings
and adds nothing.

Collapsing these produces a vision model inventing code violations from a blurry
photo of a mechanical room — the one failure this product cannot ship. The split
also makes cost attributable per stage, so a cost regression points at a stage
rather than at "the pipeline."

## Three things this harness is careful about

**Misses and fabrications are counted separately.** They are different failures.
A miss is work the reviewer must catch; a fabrication is a false statement filed
under someone's licence. Averaging them into one accuracy score hides the one
that matters more, so fabrications carry their own budget in the gate.

**Scoring cost never reaches COGS.** The scorer runs on Opus 5 because a
mis-aligned deficiency corrupts the only metric the gate produces. Its spend is
tagged `measurement` and excluded from the per-report cost.

**Cache failure is made loud.** Per [`02-stack-and-costs.md`](../02-stack-and-costs.md),
a byte-unstable prompt prefix silently triples per-report cost — silently,
because nothing errors. So the corpus is fingerprinted and compared across runs,
`cache_read_input_tokens` is checked after every grounded call, and a corpus
below the model's cache floor (512 tokens on Opus 5, 4,096 on Haiku 4.5) is
called out rather than left to look like a cheap run.

Extraction runs two guards. It cross-checks every cited clause against the
library and warns on any it cannot find — a fabricated citation is worse than a
missing one, because a reviewer sees a gap but reads a plausible wrong clause as
correct. And it checks that requirement language was actually drawn from the
library: **the model has read NFPA in training**, and without that check it will
supply remembered standard wording wherever the library is silent — reproducing
from memory exactly the text we chose not to license.

## The procedure library

The harness is grounded in **our own authored procedure library**, not licensed
standards text. Each procedure says what a technician checks and what makes a
finding a deficiency, in our words, and carries a `maps_to` clause reference so a
reviewer can turn to their own licensed copy for the authoritative wording.

That is a deliberate strategic choice, not a workaround — a licensed corpus is a
commodity any competitor can buy, while an authored library compounds with every
inspection processed. See [`06-risks.md`](../06-risks.md) R1 for the reasoning,
the legal line, and what it costs.

`corpus.py` manages the library and applies jurisdiction amendments as
configuration rather than code:

```sh
python corpus.py ingest  --source drafts/itm-v2.md --standard NFPA25-72 \
                         --version v2 --author "J. Doe" --out ~/gate2/library-v2
python corpus.py overlay --base ~/gate2/library-v2 \
                         --amendments jurisdictions/travis-county.txt \
                         --jurisdiction travis-county --out ~/gate2/library-travis
python corpus.py validate ~/gate2/library-travis
python corpus.py coverage ~/gate2/library-travis --scope scope/nfpa25-annual.txt
```

**Check coverage before running the gate.** A library that grounds only part of
what an inspection touches fails Gate 2 as though the model were at fault — with
nothing to cite it records fewer findings, and accuracy reads as a capability
problem when it is a content gap.

Full documentation: [`corpus_tools/README.md`](corpus_tools/README.md) and
[`fixtures/library/README.md`](fixtures/library/README.md) — the latter carries
the authoring discipline, which is the control that keeps the library defensibly
ours.

## What the fixture does and does not prove

The synthetic inspection validates **wiring**: schemas conform, caching engages,
costs attribute, scoring aligns. It proves nothing about accuracy. The narration
is clean, the "photos" are captioned diagrams rather than photographs of a dark
riser room, and the reference list was written alongside the transcript rather
than independently by an inspector. Every one of those makes the task easier than
reality.

It does carry two deliberate traps worth watching even in a wiring run:

- **A photo-only deficiency** (obstructed FDC) never mentioned in the narration.
  If it is missed, the photo stage is contributing nothing.
- **An ambiguous remark** the inspector explicitly declined to call — it belongs
  in `uncertain_items`. Reporting it as a deficiency is a fabrication.

**Gate 2 passes on five real inspections or it does not pass.**

## Reading the verdict

```
Gate 2 thresholds
  [PASS] extraction accuracy          91%  (≥ 85%)
  [PASS] fabrications/report         0.20  (≤ 1.00)
  [PASS] COGS/report                $0.94  (≤ $2.00)
  [PASS] wall clock/report            84s  (≤ 300s)
```

Exit code is 0 on pass, 1 on fail, 2 on a setup error.

**A wide miss is a finding, not a tuning task.** Per the sprint doc: a throwaway
script landing at 60% extraction is telling you the value hypothesis does not
hold at current capability, not that the prompt needs work. Tuning a disposable
script is the most reliable way to convert a clear negative signal into an
ambiguous one over three weeks. A narrow miss — 80% against an 85% floor — is
worth one iteration, not five.

## Files

```
run.py                 CLI and orchestration
selftest.py            offline checks — schemas, cost math, gate boundaries
harness/
  config.py            model ids, pricing, thresholds, token budgets
  cost.py              cache-aware per-stage cost and timing
  schemas.py           Pydantic models + the JSON-Schema strictifier
  pipeline.py          the five production stages and their prompts
  score.py             semantic alignment, gate verdict
  llm.py               streaming call wrappers, library loading, cache guards
corpus.py              library ingest / jurisdiction overlay / validate
corpus_tools/          library model, overlay, validation
fixtures/
  make_fixtures.py     generates the synthetic inspection
  library/             authored procedure library
```
