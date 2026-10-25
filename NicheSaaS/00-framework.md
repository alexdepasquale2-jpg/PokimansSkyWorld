# The Selection Framework

How to pick a niche with evidence instead of intuition. Written once, reusable for any
future candidate — including the ones you find after this plan is spent.

## Sourcing: enumerate, don't brainstorm

Brainstorming produces ideas you find interesting. Enumeration produces ideas that already
have money attached. Work from registries where mandatory work leaves a paper trail:

**Trade and licensing bodies.** Contractors, engineers, adjusters, surveyors, clerks. Their
member directories are the buyer list, pre-built. If an occupation needs a licence, someone
is auditing its output.

**Regulations that name a deliverable.** Search statute and code text for the phrasing that
creates a document: *"shall submit an annual report to,"* *"a written assessment shall be
prepared,"* *"records shall be retained and made available."* Each hit is a document
somebody is paid to produce on a schedule, forever.

**Job postings for the human currently doing it.** A $65k/year "report writer" or
"compliance coordinator" posting is a priced problem statement with a named employer. Ten
such postings in one industry is a market.

**Software that visibly stopped in 2010.** Form-first, desktop-first, no mobile capture, a
screenshot gallery that looks like Windows XP. Age is not by itself an opening — some old
software is entrenched for good reason — but an old *interaction model* is. A form-first
incumbent cannot become capture-first without rewriting its core.

**Insurance and lender requirements.** Anything an underwriter or a lender demands before
they will write a policy or fund a loan is mandatory spend with a hard deadline, and the
deadline is somebody else's money.

## The scoring rubric

Score each criterion 1–5, multiply by the weight, total it. The weights matter more than
the precision of any individual score — this is a tool for surfacing which candidate is
structurally better, not for producing a decimal ranking.

| Criterion | Weight | The test |
|---|---|---|
| Mandatory / recurring | ×3 | Is there a law, lender, or insurer forcing this on a calendar? |
| Existing budget | ×3 | What do they pay humans today — per artifact, and per year? |
| Buyer reachability | ×2 | Can you name and reach fewer than 5,000 buyers by list, association, or conference? |
| Only-possible-now leverage | ×2 | Does removing recent model capability kill the product? If not, it's a form builder. |
| Competitive vacuum | ×2 | Are incumbents form-first, over eight years old, without voice or vision capture? |
| Moat accrual | ×2 | Does per-customer data make switching painful by month 12? |
| Small-team buildable | ×1 | Can 1–3 people ship a credible v1 in 10–12 weeks? |

Maximum score is 75. Anything below 50 is not worth a validation sprint.

### Notes on the two most-fudged criteria

**Buyer reachability** is scored on your ability to produce a *named list*, not on market
size. A market of 3,000 named fire-protection shops you can enumerate this afternoon beats
a market of 400,000 "small businesses" you cannot. Small and enumerable is the goal; large
and diffuse is a distribution problem you cannot afford to solve.

**Only-possible-now leverage** is the criterion most likely to be scored generously out of
enthusiasm. Apply it adversarially: describe the product to yourself using only technology
available in 2021. If the description still makes sense, score it 1 or 2 regardless of how
much you like the idea.

## Kill rules

Any single one disqualifies the candidate, whatever the total score says. These are not
weighted against anything — they are structural.

**Committee procurement with no pilot budget.** If the buyer cannot spend $1,000 without an
RFP, the sales cycle will outlast your runway. This kills otherwise excellent public-sector
niches for a small team, which is a real cost, not a reason to soften the rule.

**No human sign-off step in the workflow.** If the output is expected to be filed without
review, you are building a product whose failure mode is a regulatory violation attributed
to you. Every compliance artifact needs an attesting human, and if the workflow has no
natural place for one, the workflow is wrong for this kind of product.

**Mandatory certified integration with a closed ecosystem.** If the artifact is worthless
unless it round-trips through a dominant proprietary platform whose partner programme you
cannot join, the incumbent controls whether you exist.

**"Saves time" with no existing dollar.** If nobody currently pays anybody to do this work,
time saved is not budget freed. There is nothing to redirect toward you.

## Willingness-to-pay: compute it, never ask it

"Would you pay for this?" produces polite lies. The number you want already exists in the
buyer's cost structure:

```
artifact value = (hours per artifact × loaded labour rate) + rework/liability cost
price          = 10–20% of artifact value
```

Loaded labour rate means the billing rate, not the salary — for a fire-protection
technician, $95–150/hour, not the $32/hour that reaches their paycheque. Rework cost is
what a rejected filing costs: the re-inspection truck roll, the re-submission, and in some
niches a penalty.

Price at 10–20% of the value produced. Below 10% you have left money on the table and
signalled that the product is peripheral. Above 25% the buyer starts doing the arithmetic
on hiring instead, and you are competing with a headcount decision rather than sliding into
an existing line item.

**If the artifact is worth less than $50 of labour, the niche is too thin for a small
team.** You will need thousands of customers to matter, and you cannot acquire thousands of
customers with founder-led sales.

### Sanity check the price against the ACV you need

Work backwards. If you need $15k ACV to justify founder-led sales, and the customer produces
600 artifacts a year, the price is $25 per artifact. If they produce 40, the model has to be
seat-based or the niche cannot support this go-to-market motion. Do this arithmetic *before*
the validation sprint — it frequently kills a candidate faster than any interview does.

## What the framework deliberately does not score

**Founder passion.** It correlates with persistence and with talking yourself past kill
rules, and the second effect is larger.

**TAM.** Total addressable market is the wrong instrument at this scale. You need a
reachable list and a defensible wedge; the size of the theoretical market beyond that wedge
does not affect any decision you will make in the next eighteen months.

**Technical elegance.** The best niche is usually one where the engineering is
unremarkable and the domain knowledge is the barrier. If the interesting part is the
architecture, you have probably chosen a problem whose difficulty is in the wrong place.
