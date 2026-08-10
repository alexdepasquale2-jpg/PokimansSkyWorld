# Churn post-mortem

Within a week of any pilot declining to renew. Thirty minutes with them if they
will give it, plus your own honest reconstruction.

**Three churns with the same cause are worth more than three renewals.** The
renewals confirm what you already believed; the churns tell you something you can
act on. Treat this as the most valuable half hour in the sprint rather than an
unpleasant obligation.

## Ask them

Frame it as help, because it is:

> "You've decided not to continue, which is fine and I'm not going to try to
> change your mind. Would you give me twenty minutes to understand it properly?
> It's genuinely more useful to me than the renewal would have been."

1. When did you first think this might not continue?
2. What were you hoping it would do that it didn't?
3. Was reviewing a draft actually faster than writing from scratch? *(the core
   hypothesis — press here)*
4. What did your technicians say about it, in their words?
5. Did the deficiency-to-quote side change anything about how fast work went out?
6. If it had been free, would you have kept using it? *(separates "not worth the
   money" from "not worth the effort" — completely different findings)*
7. What are you going back to?

Question 6 is the discriminator. **Would-use-if-free** means the value is real
and the price or the pain is wrong — fixable. **Wouldn't-use-if-free** means the
product did not earn its place in the workflow at any price, which is a much
deeper finding.

## Classify it

Exactly one primary cause. Resist "a bit of everything" — the point is to see
patterns across churns, and a hedged classification cannot be counted.

| Cause | Means | Fix |
|---|---|---|
| **Never adopted** — coverage stayed low | It stayed optional; the field never took it up | Product/onboarding. Revisit the single-technician start |
| **Adopted then abandoned** | Something specific broke trust | Find the incident. Usually one bad report |
| **Review wasn't faster** | The core hypothesis failed for them | Product. This is the one that threatens the concept |
| **ROI didn't land** | Time saved wasn't real, or quotes didn't move | Check capacity-constrained vs demand-constrained |
| **Wrong buyer** | Champion liked it; signer never saw the value | Sales. Get the signer into the pilot earlier |
| **Priced wrong** | Value real, number wrong | Pricing. Only credible if Q6 was "yes, if free" |
| **External** | Lost the contract, sold the business, key person left | Nothing. Don't over-learn from these |

## Then reconstruct honestly

Their account and your data will not fully agree. Write both.

| | |
|---|---|
| Peak coverage, and when | |
| Coverage in the final month | |
| First week a signal turned | |
| Did anyone flag a problem at the time? | |
| Did you intervene? What happened? | |
| **What you would have done differently, in hindsight** | |

That last row is the one to be hard on. "Nothing, they were the wrong customer"
is occasionally true and usually a way of not looking.

## The pattern table

Fill one row per churn. This is what the gate actually reads.

| # | Firm | Primary cause | Use if free? | Peak coverage | Their words, one line |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

### What patterns mean

**Two or more "review wasn't faster"** — the central product claim is not holding.
This is the finding most worth having and the one most tempting to explain away.
It may connect to losing verbatim clause quotes in the authored-library pivot
([`../06-risks.md`](../06-risks.md) R1), which is a known and specific tradeoff to
re-examine rather than a mystery.

**Two or more "never adopted"** — the capture premise is weaker than Gate 1
suggested. Check against the device-hostility flip trigger in
[`../gate1-recruiting/scorecard.md`](../gate1-recruiting/scorecard.md).

**Two or more "ROI didn't land"** — the value model is wrong, most likely the
capacity-constrained assumption in the calculator. Recheck against real customers
rather than the defaults.

**Two or more "wrong buyer"** — a Gate 1 sampling failure surfacing late. Owners
and operations managers were meant to be sampled separately for exactly this
reason.

**Mixed causes with no pattern** — the least useful outcome, and the one to be
most careful with. Either the sample is too small to read, or the honest reading
is that the product is not necessary to anyone in particular. Do not manufacture
a pattern to avoid that conclusion.

## Stay in touch

Ask if you can check back in six months. A churned pilot who parted on good terms
is a strong later prospect, and their "what would have to be different" is a
concrete re-entry condition rather than a guess.
