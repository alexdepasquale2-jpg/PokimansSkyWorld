# The critical path

[`04-validation-sprint.md`](04-validation-sprint.md) calls itself a three-week sprint. That is
roughly right about **working time** and wrong about **calendar time**, which is what
determines when you get an answer.

Realistically it is **nine to ten weeks** from a standing start to a collected payment. The
difference is not work. It is waiting — on other people's replies, other people's inspection
schedules, a contractor's availability, and an underwriter. Nothing in this document makes
the work faster. It makes the waiting start earlier, which is the only lever there is.

## The chain nobody drew

Gate 2 needs two inputs, and the plan has been treating both as though they were sitting on a
shelf.

```
recruiting ──> interviews ──> five recorded inspections ──┐
                    │                                     ├──> Gate 2 ──> Gate 3
                    └──> prior-year filed reports ──> scoped library ──┘
```

Two consequences fall out of that diagram, and both were invisible while the inputs were
described as "obtain five real inspections."

**You cannot commission the library before Gate 1 produces something.** The scoped library
([`07-financials.md`](07-financials.md)) is scoped from real inspections — that is what makes
it cheap. So library authoring cannot start on day one, and it sits between Gate 1 and Gate 2
rather than beside them.

**The audio does not exist.** Nobody records themselves narrating an inspection today; that is
the entire premise of the product. So the five inspections are not files someone emails you —
they are five inspections somebody has to **perform, in the future, while recording**. That is
bounded by their schedule, not yours, and it is the longest single wait on the path.

## The compression that matters

Split the file ask in two. They have very different availability:

| Artifact | Exists today? | Used for | Lead time |
|---|---|---|---|
| **Prior-year filed reports** | Yes, in a filing cabinet or a PDF folder | Scoping the library; the AHJ's real format | Days |
| **Five recorded inspections** | **No** | Gate 2's actual input | 2–4 weeks |

Prior-year reports are retrospective. They can be requested in the first interview and arrive
the same week, and **they are sufficient to scope and commission the library** — they show
exactly which procedures a real annual inspection touches, in the customer's own filing
format, which is a better scope source than the standard's contents page anyway.

That single split moves library authoring off the fresh-capture wait and runs the two in
parallel. It takes roughly three weeks out of the calendar and costs nothing.

It also improves the library. Scoping from filed reports means scoping from **what the AHJ
actually accepted**, which is the real denominator — see the scope-file warning in
[`04-validation-sprint.md`](04-validation-sprint.md).

## The capture problem

Worth its own section, because getting this wrong invalidates Gate 2 while appearing to pass
it.

You are asking someone to do a thing they have never done: talk through an inspection out
loud. How you ask determines what you measure.

**Do not give them a script or a field list.** If you do, they narrate *to the form* — and you
have built a speaking version of the interface the product exists to replace. The harness will
score beautifully against input the real product will never receive.

Ask for this instead:

> "Talk through it the way you'd explain it to another tech walking the building with you.
> Don't tidy it up for me — trailing off, going back to correct yourself, swearing at a
> seized valve, all of that is fine. Genuinely, the messier the better; I need to know it
> works on a normal day, not a good one."

Then accept what arrives. Background noise, half-sentences, radio chatter and a tech who
forgets what they were saying are the product's actual input, and Gate 2 exists to find out
whether that is workable. The fixture already carries this warning about *itself* — clean
narration is the reason the shipped fixture proves wiring only. **Do not recreate the
fixture's weakness in the real sample.**

One more thing worth doing: record one inspection yourself, shadowing a tech, and put it in
the five. It costs a day and it is the only way you will develop an instinct for what the
capture flow is actually up against.

## The other long-lead items

| Item | Lead time | Earliest start | Blocks |
|---|---|---|---|
| Interview recruiting | 1–3 weeks to a booked call | Day 1 | Everything |
| Prior-year filed reports | Days | First interview | Library scoping |
| Five recorded inspections | **2–4 weeks** | After a good interview | Gate 2 |
| Scoped library authoring | 1–3 weeks calendar | Once ~4 reports are in | Gate 2 |
| E&O quote | **2–4 weeks** | Any time | Gate 3 |

The E&O quote is the one most likely to be left too late, because it is administrative and
feels detachable from the real work. It is not: per [`06-risks.md`](06-risks.md) R3 the
outcome may be declination rather than a premium, and finding that out **after** a paid pilot
is a genuinely bad sequence. Start it in week 3. It is a form and a phone call, and it runs
entirely in the background.

## The trade calendar is fixed, sparse, and currently unhelpful

The events in [`gate1-recruiting/01-target-list.md`](gate1-recruiting/01-target-list.md) do
not move for you, and there are very few of them. As of August 2026:

| Event | When | Distance |
|---|---|---|
| NFSA Annual Seminar | Even years, late April — **Apr 2026 has passed** | ~20 months to the next |
| **AFSA45 Convention**, San Antonio | 27–30 Sep 2026 | **~7 weeks** |
| NFPA Conference & Expo | 14–16 Jun 2027 | ~10 months |

**There is exactly one major event inside the next ten months, and it is seven weeks away.**
Starting the sprint now puts AFSA45 in roughly week 7 — mid-sprint, with interviews done and
Gate 2 either running or just finished. That is close to the best possible timing: you arrive
with real questions and real findings rather than a pitch, and it is the single densest
concentration of your buyer available anywhere.

Go as an attendee, per [`02-stack-and-costs.md`](02-stack-and-costs.md) A4. The point is not
lead capture. It is that a week of hallway conversations at that density can substitute for
weeks of recruiting — and it may be where the five recorded inspections actually come from.

Missing it costs roughly ten months of waiting for the next comparable room. That is the
strongest argument in this document for starting now rather than after one more round of
planning.

## Week by week

Working from a start this month. `██` is active, `··` is waiting on someone else.

| Workstream | W0 | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Recruiting | ██ | ██ | ██ | ██ | ·· | | | | | |
| Interviews (12) | | ██ | ██ | ██ | ██ | | | | | |
| Prior-year reports | | ██ | ██ | ·· | | | | | | |
| Scope file | | | ██ | ██ | | | | | | |
| Library authoring | | | | ██ | ██ | ██ | | | | |
| Five recorded inspections | | | ·· | ·· | ·· | ·· | ·· | | | |
| E&O quote | | | | ██ | ·· | ·· | ·· | | | |
| **AFSA45** | | | | | | | | ██ | | |
| Gate 2 run | | | | | | | | ██ | ██ | |
| Gate 3 | | | | | | | | | ██ | ██ |

Gate 2 lands the same week as AFSA45, which is awkward but the right way round: the
convention is a fixed date and the gate is not. Run the harness before you travel if the
inputs are in; otherwise run it on the plane.

## Where this slips

Honest failure modes, in order of likelihood.

**Nobody records the inspections.** By far the most likely slip. Somebody agrees warmly in an
interview and then it never happens, because it is genuinely a favour and they are busy. Ask
three shops, not one — you need five inspections, not five from one firm, and redundancy here
costs nothing. Per [`04-validation-sprint.md`](04-validation-sprint.md), a warm interview that
produces no files is itself a Gate 3 signal, so this is not wasted even when it fails.

**Recruiting is slower than a week.** Common, and it delays every downstream item one for one.
The fix is volume at the top, not follow-up pressure at the bottom.

**The library contractor is unavailable.** Someone who has actually done this work is not
sitting waiting for your email. Line them up during weeks 1–2, before you need them, so the
commission is a start date rather than a search.

**You get five inspections from one firm.** Then Gate 2 measures one shop's practice and
one AHJ's format, and reads as a stronger result than it is. Note it on the scorecard if it
happens; it is a caveat, not a failure.

## What not to do with the waiting

Weeks 4–7 have real slack in them. This is the most dangerous period in the plan, because the
obvious way to fill slack is to start building the product — and
[`README.md`](README.md) says not to, for reasons that do not weaken just because you are
bored.

The rule holds: **no product code until Gates 1–3 pass.** If Gate 1 fails, the correct
response is switching candidates, and everything built in the meantime is thrown away.

Legitimate uses of the slack, roughly in value order:

1. **More interviews.** Twelve is the pass threshold, not a cap. Sixteen interviews is a
   materially better dataset and the marginal cost is only your time.
2. **More prior-year reports, from more jurisdictions.** They improve the library scope and
   they are the cheapest possible read on how much AHJ formats actually vary — which is a
   direct input to feature 4 in [`03-product-concept.md`](03-product-concept.md).
3. **AFSA45 preparation.** Named people, booked coffees. A convention with a schedule is worth
   several times one walked cold.
4. **The E&O conversation**, properly, with more than one broker.
5. **Deepen the competitor teardown** in [`05-competitors.md`](05-competitors.md) — trials,
   pricing pages, and what actual users say in the association forums.

Every item on that list produces evidence. None of it produces code that a failed gate would
throw away, and that is the test for whether something belongs in the slack.
