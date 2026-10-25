# ⚠️ SIMULATED — Composite operator — 2026-08-09

> **This is not evidence and must not be counted toward the 8 of 12.**
>
> Answers were generated in a planning conversation, not collected from a
> buyer. It is here as (a) a worked example of how to fill
> [`interview-capture-template.md`](interview-capture-template.md) and (b) the
> scenario that drove several plan changes, recorded so the reasoning is
> traceable.
>
> A real Gate 1 needs twelve of these from twelve independent firms. Counting
> this one would produce exactly the manufactured-evidence failure that
> [`scorecard.md`](scorecard.md) exists to prevent.

## Who

| | |
|---|---|
| Firm | Composite — 12–20 technician shop, recurring ITM |
| Role | Owner / operations manager (composite) |
| Sourced via | **Simulated** |

## The numbers

| Metric | Value | Confidence |
|---|---|---|
| Writeup time, typical building | **1–2 hrs** (model at 1.5) | stated |
| When writeup happens | **During the working day** | stated |
| Is writeup billable | **No — unbilled** | stated |
| Deficiency → paid repair conversion | **20–40%** (model at 30%) | stated |
| Loaded technician bill rate | not captured | — |
| Inspections per week | not captured | — |
| **Backlog / turning work away** | **not asked — see below** | **gap** |

Derived artifact value at $128/hr: `1.5 × 128 ≈ $192` per report. At 10–20%,
that prices at **$19–38 per report** — inside the $20–30 band in
[`../02-stack-and-costs.md`](../02-stack-and-costs.md), but at the lower end of
it. The plan's 2–4 hour assumption was optimistic.

## Gate 1 scoring

| Check | |
|---|---|
| Named writeup time in top 3 | yes |
| Stated a dollar figure | no — rate and volume not captured |
| **Counts toward the 8 of 12** | **NO — simulated, and no dollar figure** |

## Flip-trigger check

| | |
|---|---|
| Would techs narrate rather than tap | **Resistant — they've been burned before** |
| Reads as device-hostile | **Partly** |

**Does not trip the flip trigger.** The trigger requires "won't use a device,
period," at ≥6 of 12. "Resistant, been burned" is scar tissue from a failed
rollout, not refusal — a different and more tractable problem. But it is the
single most consequential answer in this sheet.

## Surprises — the section that earns its place

### 1. "During the day, unbilled" is a different problem from evening writeup

The plan assumed the pain was unpaid evenings — a morale and retention problem.
Daytime unbilled writeup is an **opportunity cost**: every 1.5 hours is a slot
that could have held another inspection.

That inverts the value calculation. Evening hours saved don't reduce payroll for
a salaried technician, which is why the calculator discounted them by half.
Daytime hours freed can become billable capacity — worth *more* than the
discounted figure, not less.

**But only if the shop is capacity-constrained.** Freed capacity is worth real
revenue if there is a backlog to fill it with, and worth approximately nothing
if the phone isn't ringing. Same hours, same product, value differing by an
order of magnitude depending on a fact nobody asked about.

### 2. The interview guide is missing its most important economic question

Nine questions and none of them establishes whether the shop is
capacity-constrained or demand-constrained. Without it the writeup-time answer
cannot be converted into money at all — which means the guide as written could
not reliably produce the dollar figure the gate's pass condition requires.

Fixed: see the new question 4b in
[`03-interview-guide.md`](03-interview-guide.md).

### 3. "Been burned before" reshapes the pitch and the pilot

A shop with a failed rollout behind it is not evaluating a tool, it is
evaluating a *repeat of a bad experience*. Three consequences:

- The pitch cannot be "a new tool for your techs." It has to be "your techs do
  less than they do today" — voice-only capture is genuinely that, but it has to
  be led with.
- The failed rollout is worth interviewing on its own. What was it, what
  specifically broke, who championed it, how did it die? That story is the
  objection you will face at every shop in the region, and probably names an
  incumbent.
- **The pilot should start with one technician, not the shop.** A whole-shop
  rollout to a burned team is the highest-risk possible start.

Fixed: single-technician staging added to
[`../gate3-pilot/01-pilot-offer.md`](../gate3-pilot/01-pilot-offer.md), and a
prior-rollout probe added to the interview guide.

## What this scenario did not test

Everything the gate actually turns on: whether an independent buyer volunteers
this pain unprompted, whether they can put a dollar on it, and whether they will
pay. Those require the real thing.
