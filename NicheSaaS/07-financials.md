# The money model

[`02-stack-and-costs.md`](02-stack-and-costs.md) prices the pieces — cost per report, monthly
infrastructure, a marketing budget by phase. None of it is joined up, and the original
question was about **return on investment**. This document joins it up and answers three
things:

1. How much cash is at risk before the first honest signal?
2. How many customers does this need to stop losing money?
3. When does it return the founder's time, which is the largest investment in it by far?

Every number here is a planning estimate, not a forecast. The point is the **shape** — which
variable moves the answer, and which ones are noise.

## The two lines missing from every earlier document

**Founder labour.** The plan has costed servers and trade shows and never once costed the
person. At a loaded market rate of roughly $12,500/month, eighteen months of founder time is
**~$225,000** — an order of magnitude more than all the cash line items combined. Any ROI
statement that ignores it is measuring the wrong thing.

**Professional liability cover.** [`06-risks.md`](06-risks.md) R3 has called this the top live
risk and said the premium must enter the cost model. It never did. Placeholder below, with
the caveat that matters more than the number.

### On the E&O placeholder

Small technology companies at low revenue typically pay somewhere in the region of
**$1,500–5,000/year** for a combined tech E&O and cyber package at $1M/$1M limits. Modelled
here at **$200/month**.

**Treat that as a placeholder, not an estimate.** A product whose output goes into
life-safety compliance filings does not get underwritten like a marketing analytics tool, and
the risk is not that the premium comes back at $6,000 instead of $2,400. The risk is
**declination, or a cover with an exclusion that removes exactly the scenario you bought it
for.** That is a binary that lands on the business model, not a line item that lands on the
budget.

Get the quote before Gate 3, per R3 — the reason is to find out which of those two worlds you
are in while it is still cheap to be in neither.

## The cash at risk before the first honest signal

The first honest signal is a collected payment at Gate 3. Everything before it is
speculative spend.

Every earlier draft of [`04-validation-sprint.md`](04-validation-sprint.md) put the sprint at
"roughly $50." That was true of model spend and false of the sprint, because Gate 2 cannot
run without a procedure library, and a full library is **$4,000–8,000** of subject-matter
time. The corrected figure below is now carried in that document.

### Scoping the library to the gate cuts this by two-thirds

Gate 2 runs on five inspections. It does not need a library covering the whole standard — it
needs the procedures those five inspections actually touch, which is perhaps 40–80 of them
rather than several hundred.

| | Full initial library | Gate-2-scoped library |
|---|---|---|
| Procedures | several hundred | 40–80, chosen from the five inspections |
| Cost | $4,000–8,000 | **$1,500–2,500** |
| Timeline | weeks | days |
| Buys you | a shippable product | a truthful answer to Gate 2 |

Author the scoped version first and commission the rest **after** somebody has paid. This is
the single largest improvement available to the plan's risk profile, and it costs nothing but
sequencing.

The catch, stated so nobody trips on it later: a Gate-2-scoped library will score badly
against a full scope file, because it is meant to. Run `corpus.py coverage` against a scope
built from the five sample inspections, and do not confuse that number with product
readiness.

### So the real number

| Item | Cash |
|---|---|
| Infrastructure and outbound tooling, months 1–3 | ~$2,100 |
| Gate-2-scoped procedure library | ~$2,000 |
| Gate 2 model spend | ~$50 |
| **Total before the first collected payment** | **~$4,150** |

Roughly four thousand dollars and about eight weeks of one person's attention buys a
truthful answer to whether this business exists. **That asymmetry is the actual reason to
run the plan this way** — not thrift, but that the cost of being wrong stays small until
someone else's money says you are not.

## Year one, quarter by quarter

Base case. Founder unpaid and building; contractors for the library and content. Mid-points
of the ranges in [`02-stack-and-costs.md`](02-stack-and-costs.md) A3 and A4.

| Quarter | Cash out | Cash in | Net | Cumulative |
|---|---|---|---|---|
| Q1 — discovery, Gates 1–3 | $4,150 | $0 | −$4,150 | **−$4,150** |
| Q2 — design partners | $11,350 | $7,000 | −$4,350 | **−$8,500** |
| Q3 — first annuals | $16,500 | $14,500 | −$2,000 | **−$10,500** |
| Q4 — early sales | $16,500 | $19,000 | +$2,500 | **−$8,000** |

Q2 out = $6,750 GTM + $600 E&O + $4,000 library completion. Q3 and Q4 out = $13,500 GTM +
$600 E&O + $2,400 library maintenance. In: pilots at ~$1,000/month from month 4, first two
annuals converting month 9, roughly one new customer per month thereafter, onboarding fees
at $2,000 each.

**Peak cash requirement: about $11,000.** Month 12 exits at roughly **$75k ARR** with five
customers, and approximately cash-flow neutral on out-of-pocket spend.

That is the whole year-one story, and it should be read plainly: **this does not pay a
founder in year one.** It is not a cash-hungry business — $11k of peak deficit is
extraordinary for a B2B SaaS — but the payment for the largest input is deferred entirely to
year two.

### The fork this model assumes away

The table above assumes the founder writes the software. If v1 is contracted out instead, add
**$15,000–40,000** in Q2–Q3 and roughly quadruple the peak cash requirement. Both are
defensible; they are different businesses to finance, and the plan should not pretend the
choice hasn't been made. Everything here assumes founder-built.

## Break-even

Run-rate at early scale, monthly: GTM $4,500 + infrastructure $1,800 + library maintenance
$800 + E&O $200 = **$7,300/month**, or ~$87,600/year.

At $15k ACV and >95% gross margin, each customer contributes ~$14,250/year.

| Break-even against | Customers |
|---|---|
| Cash costs only | **~6–7** |
| Cash costs plus a $120k founder salary | **~15** |

Six customers to stop losing money. Fifteen to be a job that pays properly. Those two numbers
are worth more than any projection in this document, because they are the ones that convert
directly into a sales target you can hold yourself to on a Friday afternoon.

At one close per month from month 9, fifteen customers arrives around **month 23**.

## What actually moves the answer

| Variable | Base | Downside | Effect |
|---|---|---|---|
| **Close rate** | 1/month | 0.5/month | Month 23 → **month 38**. Binding constraint |
| ACV | $15k | $8k | Break-even 15 → **28 customers** |
| Library cost | $6k total | $15k | Peak cash $11k → $20k. Survivable |
| Churn | 8%/yr | 25%/yr | Barely visible in year one |
| Model pricing | $0.85/report | 3× | $2.55/report. Still noise against $15k ACV |

Two of these deserve comment.

**Close rate is the business.** Nothing else on the list changes the answer as much, and
almost the entire GTM budget exists to move it. When something has to be cut, cut against
this test: does it plausibly increase closes per month? Content does, slowly. A second
regional booth might. A better dashboard does not.

**Churn barely registers in year one, and that is not a reason to relax about it.** At these
volumes the sales rate binds long before retention does — 25% annual churn against one close
per month still grows. Churn matters here for a completely different reason: per
[`04-validation-sprint.md`](04-validation-sprint.md) Gate 4, it is the *falsification test*
for the entire non-discretionary-spend thesis. High churn does not cap growth in year one; it
tells you the premise was wrong and the year-three model is fiction. Read it as evidence,
never as a growth input.

The model-pricing row is included to close off a distraction. Even a tripling of inference
cost is immaterial. Do not spend engineering time optimising tokens; it is the best-understood
cost in the business and the least important.

## So what is the return?

Investment, honestly stated: **~$11,000 of cash and ~18 months of founder time**, the latter
worth ~$225,000 at market rate. Call it $235,000 all in.

Against that, at fifteen customers the business runs at ~$225k ARR, high-margin and
low-churn. Small vertical B2B SaaS with defensible retention transacts in the region of 3–5×
ARR, which puts that at roughly **$675k–1.1M** — before counting the salary it pays from
month 23 onward.

So the return clears, comfortably, **in year two or three — not year one**, and it depends
almost entirely on holding roughly one close per month once selling starts. Anyone who needs
income inside twelve months should not run this plan; that is a fact about the plan's shape,
not a fixable defect in it.

The genuinely attractive property is not the multiple. It is that **~$4,150 buys the answer**
to whether the other $230,000 is worth committing. Most business plans cannot be falsified
for four thousand dollars.

## The five numbers to keep on one page

Everything above collapses to these. Review monthly; nothing else needs a dashboard in year
one.

| # | Number | Why |
|---|---|---|
| 1 | Cumulative cash spent | Against ~$4,150 pre-signal and ~$11,000 peak |
| 2 | Closes per month | The binding constraint on everything |
| 3 | Realised ACV | Break-even scales inversely with it |
| 4 | Cost per report, per customer | Not for margin — as an early-warning signal on a pathological account |
| 5 | Pilot → annual conversion | The thesis test, per Gate 4 |

## Where this model is weakest

Stated so it is not mistaken for precision.

- **Close rate is assumed, not evidenced.** One per month for a founder selling into a trade
  association market is plausible and unvalidated. It is also the variable everything hinges
  on, which is an uncomfortable combination. Gate 3 produces the first real data point.
- **ACV comes from a seat-count assumption**, not from anyone's signature. A 12-technician
  shop at $99–149/seat is arithmetic, not pricing research.
- **The E&O line may be a category error**, not a number error — see above.
- **Support cost is not modelled at all.** A2 says support, not tokens, is the real cost
  driver, and then nobody costs it. At five customers it hides inside founder time. At thirty
  it is a hire, and that hire lands before the $120k salary does.

The last one is the most likely place this model is wrong, and it is wrong in the direction
of optimism. Revisit it the moment there are ten customers.
