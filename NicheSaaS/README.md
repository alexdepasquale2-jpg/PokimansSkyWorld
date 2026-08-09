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
  04-validation-sprint.md  the three-week gate that runs before any code is written
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

## The single most important sequencing decision

**No code until the validation sprint passes.** Three weeks, roughly $50 of spend, four
gates ([`04-validation-sprint.md`](04-validation-sprint.md)). If the first gate fails, the
correct response is to switch candidates — so any week spent building beforehand is a week
spent building the wrong thing. The throwaway feasibility script in Gate 2 is deliberately
disposable: no UI, no database, nothing that survives contact with the answer.
