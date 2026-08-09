# The Validation Sprint

Three weeks. Roughly $50 of spend. Four gates, each with an explicit stop condition.

**No production code until Gates 1–3 pass.** If Gate 1 fails the right response is to switch
candidates, so any week spent building beforehand is a week spent building the wrong thing.

---

## Gate 1 — Demand

**Week 1–2. Cost: ~$0.**

Twelve recorded discovery interviews with the target buyer — owners and operations managers
at fire-protection shops of 5–40 technicians. Recruit through state association member
lists, LinkedIn, and by asking each interviewee for one introduction.

**The recruiting assets are built: [`gate1-recruiting/`](gate1-recruiting/).** Named
associations, chapters and events; outreach sequences per channel; the expanded interview
guide; a per-interview capture template; and the scorecard that produces the verdict.

Two things there that this section does not say and should: sample **at least four owners
and four operations managers**, because the most common cause of a Gate 3 failure is
interviewing the person who feels the pain while a different person controls the spend —
and ask every interviewee whether they would share real inspection files, because Gate 2
needs five of them and this is where they come from.

**Do not describe the product.** The moment you do, the interview becomes a politeness
exercise and the data is worthless. You are mapping their workflow, not testing your idea.

### Interview script

Open with: *"I'm researching how inspection reporting actually works day to day. I'm not
selling anything — I'd just like to understand your process."*

1. Walk me through your last inspection, start to finish. Where did it start, where did it
   end?
2. Who writes the report? When — during the day, or after?
3. How long does writeup take for a typical building? For a bad one?
4. Is that time billable?
5. What happens when a jurisdiction rejects a filing? How often? What does it cost you?
6. How do deficiencies get quoted? Who does it, and how long after the inspection?
7. What fraction of deficiencies turn into paid repair work?
8. What are you using now? What made you pick it? What would make you leave?
9. If you could delete one part of this process entirely, which part?

Question 7 is the one to press hardest on. It is the number that sizes the ROI hook, and
most operators have never calculated it — the act of asking often generates the interest
that later becomes the pilot.

### Pass condition

At least **8 of 12** independently name writeup time or deficiency-to-quote conversion as a
top-three pain **and can state a dollar figure**. The dollar figure is the load-bearing
part. "It's a huge pain" is not a finding; "it's about two hours a building and we do
fifteen a week" is.

### Fail condition

Fewer than 8. Switch to Candidate 2 (due-diligence report production) and re-run this gate
with the equivalent script.

**Specific flip trigger:** if interviews reveal that technicians will not adopt *any* device
workflow regardless of how little typing it requires, switch regardless of the pain scores —
the capture premise is dead and the rest of the product depends on it.

---

## Gate 2 — Technical feasibility

**Week 3. Cost: ~$50 of model spend.**

Build a **throwaway script**. No UI, no database, no auth, nothing that survives. A
directory of audio and photos in, five draft reports out.

**The harness is built: [`gate2-harness/`](gate2-harness/).** It runs the five stages,
scores against a human-written reference, and prints the verdict below. Point it at real
inspections and the procedure library:

```sh
cd gate2-harness
pip install -r requirements.txt
python selftest.py                  # offline, no key, no spend
python run.py --all ~/gate2/inspections --library ~/gate2/library
```

Grounding is our own authored procedure library, not licensed standards text — see
[`06-risks.md`](06-risks.md) R1.

It ships a synthetic fixture so the plumbing can be checked before real files arrive.
That fixture proves wiring only — clean narration, captioned diagrams instead of
photographs, and a reference written alongside the transcript rather than independently.
**This gate passes on real inspections or it does not pass.**

Obtain five real inspections' worth of audio and photos from a Gate 1 interviewee — this is
also a useful commitment test on that relationship. If nobody will share files with you after
a good interview, that is itself a finding about how the paid-pilot conversation will go.

### The prerequisite nobody has scheduled: library coverage

Gate 2 grounds every finding in the authored procedure library. **A thin library fails this
gate as though the model were at fault** — with nothing to cite, it records fewer findings,
and extraction accuracy reads as a capability problem when it is a content gap.

The shipped library is 24 procedures. A library covering what an annual NFPA 25 + 72
inspection actually touches is realistically **several hundred**, and it has to be written by
someone who knows the trade, under the authoring discipline in
[`gate2-harness/fixtures/library/README.md`](gate2-harness/fixtures/library/README.md).

That is **weeks of subject-matter time on the critical path**, and it was not in any earlier
version of this plan. Check it before running the gate:

```sh
python corpus.py coverage ~/gate2/library --scope scope/nfpa25-annual.txt
```

Build the scope file from the inspection forms your customers actually file, not from the
standard's contents page — coverage against the whole standard is the wrong denominator.

**This cannot be generated from a language model.** Asking one to write the library produces
paraphrased standard text from training data, which is precisely the derivative work the
authored-library strategy exists to avoid. It has to come from field practice: an
experienced inspector, your customers' filed reports, and the AHJ rejections they have
actually received.

### Measure

| Metric | Target |
|---|---|
| Deficiencies correctly extracted and cited | ≥85% vs. the human-written report |
| COGS per report | <$2 |
| Wall-clock time per report | <5 min |

Compare against the human-written report for the same inspection. Count misses (deficiency
present, not extracted) and fabrications (extracted, not present) separately — they are
different problems with different fixes, and fabrications are far more dangerous in a
compliance product.

### Pass condition

All three targets met.

### Fail condition

Any target missed by a wide margin. **Stop and reassess — do not optimise.** A throwaway
script that lands at 60% extraction is not telling you to tune the prompt; it is telling you
the value hypothesis does not hold at current capability. Tuning a disposable script is the
most common way to spend three weeks converting a clear negative signal into an ambiguous
one.

Missing a target narrowly (say, 80% extraction) is worth one iteration, not five.

---

## Gate 3 — Willingness to pay

**Week 3–4.**

Take the five generated reports back to the interviewee they came from. Show them side by
side with the human-written versions. Then ask for a paid pilot: **$500–1,500 per month**.

**The pilot assets are built: [`gate3-pilot/`](gate3-pilot/).** Offer structure, the
walkthrough script, honest answers to the predictable objections, a plain-language term
sheet, and an offline ROI calculator you fill in from their own capture sheet.

The walkthrough deliberately **leads with the misses**. A compliance buyer who later finds
an error you glossed over stops trusting the whole demo — their licence signs the filing.
One who watches you point at your own errors first concludes you understand the stakes,
and that is the conversation that produces a cheque.

### Pass condition

At least **2 signed paid pilots with payment collected**. Not a verbal yes, not a signed
letter of intent, not "send me an invoice next quarter." Money received.

The distinction is the whole point of the gate. Verbal enthusiasm in this market is
abundant and free; it correlates poorly with anything. A collected payment is the first
honest signal you will get.

### Fail condition

Fewer than 2. The pain is real but not priced. Two likely causes, and they have different
fixes:

- **Wrong buyer inside the organisation.** You interviewed the operations manager who feels
  the pain; the owner controls spend and does not. Re-run with owners.
- **Wrong artifact.** The report is not where the money is; the quote conversion might be.
  Re-frame around the deficiency-to-proposal path and retest.

---

## Gate 4 — Retention

**Month 6 onwards.**

Design partners still using the product in month 3 without being prompted, and renewing at
full price when the discount expires.

**The retention assets are built: [`gate4-retention/`](gate4-retention/).** Five weekly
health signals that predict the answer weeks early, the month-2 renewal script, a churn
post-mortem, and the scorecard.

They are deliberately built to **detect the truth rather than maximise conversion** — no
save offers, because a discount that rescues a renewal converts the logo and destroys the
measurement, and at this stage the measurement is worth more. Fix defects; never buy
loyalty.

### Pass condition

**≥70% of pilots convert to paid annual contracts.**

### Fail condition

Below 70%. This is the loudest signal in the entire plan, and it overrides everything
upstream. A product built on mandatory, calendar-driven spend should retain far better than
SaaS norms. If it doesn't, the vital-purpose thesis was wrong regardless of how well the
demo landed or how enthusiastic the pilots were — the buyer found the work skippable, or
found a cheaper route to compliance.

Treat sub-70% conversion as a reason to re-examine the premise, not the roadmap. Shipping
features into a retention problem of this kind is how eighteen months disappear.

---

## Scorecard

Fill this in as the sprint runs. Dates and evidence, not impressions.

| Gate | Target | Actual | Date | Pass? | Evidence / notes |
|---|---|---|---|---|---|
| 1 — Demand | ≥8/12 name pain + dollar figure | | | | |
| 1 — Flip trigger | Device-workflow adoption viable? | | | | |
| 2 — Extraction accuracy | ≥85% | | | | |
| 2 — Fabrication rate | ~0 | | | | |
| 2 — COGS/report | <$2 | | | | |
| 2 — Wall-clock/report | <5 min | | | | |
| 3 — Paid pilots | ≥2, payment collected | | | | |
| 4 — Pilot→annual | ≥70% | | | | |

Only after Gates 1–3 pass does anything in [`02-stack-and-costs.md`](02-stack-and-costs.md)
get built.
