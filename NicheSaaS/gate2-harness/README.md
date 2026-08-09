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

Against real inspections with a licensed corpus:

```sh
python run.py --all ~/gate2/inspections --standards ~/gate2/nfpa-corpus --out ~/gate2/out
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
  photos/*.jpg                 field photos
  price-book.json              optional; without it the proposal stage is skipped
  reference-deficiencies.json  ground truth — or reference-report.md to parse one
```

## Pipeline

| Stage | Model | Output |
|---|---|---|
| 1. transcribe | Deepgram (or committed transcript) | `transcript.txt` |
| 2. classify photos | `claude-haiku-4-5`, effort low | `photo-findings.json` |
| 3. extract deficiencies | `claude-opus-5`, effort high, corpus cached | `deficiencies.json` |
| 4. write report | `claude-opus-5`, effort medium | `report.md` |
| 5. price proposal | `claude-opus-5`, effort medium | `proposal.json` |
| score | `claude-opus-5` — **measurement, excluded from COGS** | `score.json` |

### Why the stages are split this way

Photos report what is **visible**. Extraction decides **compliance**, grounded
only in the supplied corpus. The report writes prose from **decided** findings
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

Extraction also cross-checks every cited clause against the corpus text and warns
on any citation it cannot find. A fabricated citation is worse than a missing
one: a reviewer can see a gap, but a plausible-looking wrong clause reads as
correct.

## The standards corpus is not in this repo

NFPA 25 and 72 are copyrighted. `fixtures/standards/SYNTHETIC-placeholder.md`
holds invented clause numbers and paraphrased generic requirements so the harness
runs end to end — it is not NFPA text. See
[`fixtures/standards/README.md`](fixtures/standards/README.md).

Licensing the corpus for redistribution is a real cost line and a question to
settle **before** a paid pilot, not after. It belongs in the Gate 3 conversation.

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
  llm.py               streaming call wrappers, corpus loading, cache guards
  pipeline.py          the five production stages and their prompts
  score.py             semantic alignment, gate verdict
fixtures/
  make_fixtures.py     generates the synthetic inspection
  standards/           corpus — synthetic placeholder only
```
