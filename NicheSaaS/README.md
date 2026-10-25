# Niche SaaS — Plan

A plan for building a niche SaaS that returns real ROI and fulfils a vital, recurring
purpose. Two halves, as requested: the tech stack and go-to-market cost model, and the
product concept whose features are only buildable because of recent model capability.

Constraints this plan was written under: a small team (1–3 people plus contractors), a
modest budget, and an open choice of stack.

```
NicheSaaS/
  README.md              this file — the thesis and the recommendation
  00-framework.md        how to pick a niche: sourcing, rubric, kill rules, pricing method
  01-candidates.md       three candidates scored against the rubric
  02-stack-and-costs.md  Part A — stack, unit economics, infrastructure, sales/marketing budget
  03-product-concept.md  Part B — the product, feature by feature, each tied to what makes it newly possible
  04-validation-sprint.md  the four gates that run before any code is written
  05-competitors.md      incumbent teardown — pricing, gaps, what it changes
  06-risks.md            what the gates don't test, ranked. Read R1 first
  07-financials.md       the money joined up — cash at risk, break-even, what the return actually is
  08-critical-path.md    the real schedule — dependencies, lead times, and what to do while waiting
  gate1-recruiting/      target list, outreach sequences, interview guide, scorecard
  gate2-harness/         runnable Gate 2 feasibility pipeline (disposable by design)
  gate3-pilot/           pilot offer, walkthrough, objections, term sheet, ROI calculator
  gate4-retention/       health signals, renewal script, churn post-mortem, scorecard
  prototype/             clickable capture-and-attest app — built out of sequence, read its README
```

## The thesis

Three filters decide everything downstream. A niche that fails any one of them produces a
product that demos well and churns.

**1. Non-discretionary spend.** Target work that is legally, contractually, or financially
*mandatory* — compliance filings, licensed inspections, lender-required reports, statutory
records. Mandatory spend survives budget cuts, renews on a legal calendar rather than a
renewal conversation, and already has a dollar figure attached: what the buyer pays humans
to do it today. Discretionary productivity tools compete with doing nothing. Mandatory ones
compete with a line item.

**2. The only-possible-now test.** The product must depend on a capability that did not
exist two to three years ago at a viable cost. Four things changed:

- **Long context plus prompt caching.** The entire governing standard, the local
  amendments, and the prior year's records can sit in the prompt. This used to require a
  hand-built rules engine that had to be rewritten every code cycle — which is precisely
  why the incumbents in most compliance niches lag jurisdictions by years.
- **Reliable structured output.** Free-form speech and ordinary photos become validated
  records that write into a system of record. The alternative was a form with several
  hundred fields, which is why field staff did their paperwork at home instead.
- **Cheap accurate vision on unconstrained photos.** Field evidence can be graded without
  a bespoke computer-vision pipeline per document type.
- **Cost collapse.** Roughly a dollar of model spend produces a document a human bills
  $150–400 to write. Per-artifact economics finally clear a services-priced margin.

If you can remove all four and the product still stands, it is a form builder, and form
builders in these niches already exist.

**3. Compounding moat.** Every artifact processed must make the next one better and make
leaving harder: per-customer templates, per-jurisdiction quirks, multi-year asset history.
A thin wrapper with no accruing asset gets cloned in a quarter.

## The recommendation

Lead with **fire and life-safety inspection compliance** (NFPA 25/72) — see
[`01-candidates.md`](01-candidates.md) for the scoring and the two alternatives.

Due-diligence report production (Property Condition Assessments, Phase I ESA) has better
per-artifact economics and is the designated fallback, but its sales motion is slower and
its professional-liability surface larger. That combination makes it the wrong *first*
product for a small team, not a worse business.

## The content decision that shapes everything downstream

The product does not ship licensed standards text. It ships an **independently authored
procedure library** — what to check and what makes a finding a deficiency, in our words —
with each procedure citing the clause it maps to. Clause references are facts; the
customer's own copy of the standard stays authoritative.

That removes a dependency that could have ended the business, and turns the library into an
asset a competitor cannot buy. It costs authoring labour, and that authoring is now the item
sitting on Gate 2's critical path. Reasoning and controls: [`06-risks.md`](06-risks.md) R1.

## The single most important sequencing decision

**No product code until the validation sprint passes.** Four gates
([`04-validation-sprint.md`](04-validation-sprint.md)). If the first gate fails, the correct
response is to switch candidates — so any week spent building the product beforehand is a
week spent building the wrong thing.

Three weeks of work, but **nine to ten weeks of calendar** — the difference is waiting on
other people, and [`08-critical-path.md`](08-critical-path.md) sequences it so the waits run
in parallel instead of end to end. It also answers the question that period actually poses:
what to do with the slack, given that the obvious answer is forbidden.

The sprint costs roughly **$4,150** — $50 of model spend and about $4,100 of procedure
library and tooling, worked through in [`07-financials.md`](07-financials.md). That is the
whole cost of finding out whether this business exists, against the ~$235,000 of cash and
founder time the full plan asks for. Most plans cannot be falsified that cheaply, and that
asymmetry is the reason to run this one in gate order.

All four gates are equipped, and none of it is product code.
[`gate1-recruiting/`](gate1-recruiting/), [`gate3-pilot/`](gate3-pilot/) and
[`gate4-retention/`](gate4-retention/) are paper — how to find the buyers, interview them,
ask for money, and read whether they stay. [`gate2-harness/`](gate2-harness/) is a runnable
feasibility pipeline, deliberately disposable: no UI, no database, nothing that survives
contact with the answer.

There is also a [`prototype/`](prototype/) — a working capture-and-attest app, built
**out of sequence and against the rule above**. It demonstrates the two things no document
can settle: that capture completes with the radio off, and that a reviewer is forced to
attest rather than rubber-stamp. Treat it as a prop, not evidence, and read its README
before showing it to anyone — in particular, do not demo it during a Gate 1 interview.

What is *not* built, and cannot be from a keyboard: twelve interviews, and a real procedure
library written by someone who knows the trade.
