# Attest — the product prototype

A clickable version of the two claims in [`../03-product-concept.md`](../03-product-concept.md)
that no document and no harness output can settle: that a technician will actually
capture this way, and that a reviewer will trust what comes back.

```sh
cd prototype
python bridge.py            # demo drafts, no keys, no spend
# open http://localhost:8000
```

`python bridge.py --live` runs the real Gate 2 pipeline instead (needs
`ANTHROPIC_API_KEY`, plus `DEEPGRAM_API_KEY` to transcribe the recordings).

## Read this before showing it to anyone

**This is built out of sequence.** [`../README.md`](../README.md) says no product
code until Gates 1–3 pass, for a reason that has not stopped being true: if Gate 1
sends you to Candidate 2, all of this is thrown away.

It was built anyway, so the honest framing is that it is a **prop, not a product** —
something to put in front of an interviewee to sharpen the conversation, not
evidence that anything works. Two specific cautions:

- **Do not demo it in a Gate 1 interview.** The moment you show a product, the
  interview becomes a politeness exercise and the data is worthless
  ([`../04-validation-sprint.md`](../04-validation-sprint.md)). If it has a place,
  it is *after* the interview, when you are asking for recordings.
- **The demo drafts are fixture data, not model output.** They are the Gate 2
  fixture's reference list, replayed. They demonstrate the review flow and say
  nothing whatsoever about extraction accuracy.

## What it actually demonstrates

### 1. Capture completes with the radio off

Not a claim — the load-bearing constraint from
[`../02-stack-and-costs.md`](../02-stack-and-costs.md), and the thing that decides
whether the capture premise survives contact with a mechanical room.

Everything writes to IndexedDB before anything touches the network. Audio and
photos live on the device until the server confirms receipt. Going offline
mid-inspection changes nothing about capture; the queue simply stops draining and
says so. Verified end to end in Chromium: recorded a clip, added photos, went
offline, finished the inspection, force-navigated to another screen — the app
reloaded from the service worker cache with the capture intact and queued — then
came back online and the draft arrived unprompted.

There is no spinner anywhere on the capture path. That is deliberate: a spinner is
a request the technician has to wait for, and in a basement they will wait forever.

### 2. Nothing gets filed without a person attesting to it

Feature 7, and the one marked non-negotiable. The review screen shows, per finding:

| Shown | Why it is on screen |
|---|---|
| Severity, and **low confidence** where the model was unsure | Uncertainty is surfaced, never hidden |
| Source — transcript, photo, or both | The reviewer can tell what evidenced it |
| The procedure it was grounded in, its clause, and the requirement **in our own words** | The authored-library position ([`../06-risks.md`](../06-risks.md) R1) |
| The evidence photos themselves | Verifiable without leaving the screen |
| **"No procedure in the library covers this"** where nothing applied | A gap in the library must not look like a clean finding |

Each finding must be **accepted, edited, or rejected**. Signing is blocked until
every one has a decision, the attestation is ticked, and a name and licence number
are entered. The signature line says the quiet part out loud: *the system did not
decide this*.

Below the findings sits the **not filed** block — things the technician said that
were too ambiguous to record. They are shown precisely because they are the
system's failures: if one of them is real, the report is missing it.

### 3. The reviewer's edits are the telemetry

After signing, the screen reports what the reviewer changed — *"Reviewer changed 2
of 7 findings"* — with the original text struck through. That number is the review
edit rate from [`../gate4-retention/01-health-signals.md`](../gate4-retention/01-health-signals.md),
and the copy deliberately flags the dangerous reading: **no edits at all is not
obviously good.** It may mean the drafts were clean; it may mean nobody is really
reading. In a compliance product the second is the one that ends you.

## Why this stack

Static files, no framework, no build step, no database. Same reasoning as the
Gate 2 harness: **it is disposable by design.** If the gates pass,
[`../02-stack-and-costs.md`](../02-stack-and-costs.md) describes what gets built
properly — Next.js, Postgres, R2, a job queue — and none of this survives. Anything
invested in making this prototype production-shaped is invested in the wrong thing.

The one architectural decision carried over deliberately is offline-first, because
that one cannot be retrofitted: it shapes the data model, the media pipeline, and
the UX, and adding it later means rewriting the capture path.

```
prototype/
  index.html            app shell
  app.css               sized for a gloved hand in a dim room
  app.js                storage, capture, review, sync
  sw.js                 service worker — caches the shell, never the data
  manifest.webmanifest  installable to a home screen
  bridge.py             static server + POST /api/draft
```

`bridge.py` is thin on purpose. In `--live` it hands the capture to
[`../gate2-harness`](../gate2-harness) — transcription, photo grading,
library-grounded extraction, reproduction guard — rather than growing a second
copy of that logic to drift from.

## Known limits

- **Single device, no accounts.** The technician and reviewer are the same browser.
  Real separation needs the auth and sync that only matter after Gate 3.
- **The draft endpoint is synchronous.** A real capture takes minutes to process;
  this blocks the request. The plan's answer is a job queue
  ([`../02-stack-and-costs.md`](../02-stack-and-costs.md) A1), not a longer timeout.
- **Audio records as WebM.** Fine in Chrome and Android; Safari support varies by
  version, and iOS is the platform that matters most here. Worth checking on a real
  iPhone before the prototype is shown to anyone in the field.
- **No AHJ export.** Feature 4 — one capture, N required outputs — is not built.
  It needs real filed reports to have formats to conform to.
- **Photos are stored as captured.** The HEIC and downscaling handling lives in the
  harness ([`../gate2-harness/harness/images.py`](../gate2-harness/harness/images.py)),
  which runs server-side on upload.
