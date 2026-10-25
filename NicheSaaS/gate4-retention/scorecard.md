# Gate 4 scorecard

**Pass: ≥70% of pilots convert to paid annual contracts.**

The plan's loudest signal. Below 70%, the vital-purpose thesis is disproven and
the correct response is to re-examine the niche rather than the roadmap — see
[`README.md`](README.md).

## Pilots

| # | Firm | Started | Peak coverage | Reach | Quote conv. Δ | Asked | Outcome | Intervened? |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | renew / churn | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |

```
Converted to annual:  ____ / ____        PASS if >= 70%
Of those, at full price (no concession): ____
Accounts with an intervention:           ____
```

**Read the second and third lines before the first.** A 70% conversion where half
were rescued with a discount is not a 70% — it is a measurement you spent money
to destroy. Record concessions honestly; the number is only worth what its
integrity is.

The "intervened?" column should contain defect fixes only. Per
[`README.md`](README.md): fix defects, never buy loyalty.

## Signal quality

Before trusting a passing score, check the sample the same way Gate 1 does.

| Check | Target | Actual | OK |
|---|---|---|---|
| Pilots reaching a renewal decision | ≥4 | | |
| Distinct firms (not branches of one) | ≥4 | | |
| Owners among the signers | ≥2 | | |
| Ran a full 3 months | all | | |
| Median peak coverage | ≥0.7 | | |

**Median coverage under 0.5 invalidates a pass.** If pilots renewed while using
it for half their inspections, you have measured goodwill, not necessity — and
goodwill does not survive the second renewal.

## Churn patterns

From [`03-churn-postmortem.md`](03-churn-postmortem.md).

| Primary cause | Count |
|---|---|
| Never adopted | |
| Adopted then abandoned | |
| Review wasn't faster | |
| ROI didn't land | |
| Wrong buyer | |
| Priced wrong | |
| External | |

**Two or more sharing a cause is a finding regardless of whether the gate
passed.** A 75% conversion with both churns citing "review wasn't faster" says
the central claim is failing for a real segment, and that matters more than the
headline number.

## Verdict

```
[ ] PASS — >=70%, no concessions, sample clean. The thesis holds.
[ ] PASS WITH CAVEAT — threshold met, but: ______________________________
[ ] FAIL — below 70%. Re-examine the niche, not the roadmap.
[ ] INCONCLUSIVE — fewer than 4 pilots reached a decision. Recruit and re-run.
```

Date: ____________  Converted: ____ / ____

## If it fails

Resist the roadmap. The failure modes in order of likelihood:

1. **The work was skippable.** Non-discretionary in law, discretionary in
   practice — they file something, and something cheaper was good enough. This
   invalidates the niche as chosen, not the framework. Re-run
   [`../00-framework.md`](../00-framework.md) with this as a known trap.
2. **The product didn't do the thing.** Review was not faster. Fixable, but
   directly, not with adjacent features.
3. **Wrong buyer, twice.** A Gate 1 sampling failure that survived to month 6.
4. **Too few pilots to read.** Not a failure. Recruit more and re-run.

**Shipping features into a retention failure is how eighteen months disappear.**
The gate is asking whether anyone needs this. Answer that before improving it.
