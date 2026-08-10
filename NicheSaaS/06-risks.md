# Risk register

Risks the four gates do not test. The gates measure demand, feasibility,
pricing, and retention — a business can clear all four and still be killed by
something on this list.

> This file records exposure and the controls in place against it. What to do
> about any of it is the owner's call.

## R1 — Content authorship · **reshaped, not eliminated**

> **Status: the plan no longer seeks an NFPA licence.** The product ships an
> independently authored procedure library that cites clause references and
> describes what to check in our own words. The customer's own licensed copy of
> the standard remains the authoritative text.
>
> This removes the licensing risk and replaces it with a smaller one: proving the
> library is genuinely ours.

### Why this is the better position, not just the cheaper one

**The library is an asset we own.** A licensed corpus is a commodity — a
competitor writes the same cheque and is at parity on day one. An authored
library improves with every inspection processed, encodes what customers actually
get pulled up on by their AHJ, and cannot be bought. It is a second moat
alongside multi-year customer history, and it is the one that accrues fastest.

**It removes a counterparty who could have ended the business.** No negotiation,
no per-seat fee eating the margin, nobody able to change terms once we have
customers depending on us.

**It is more honest about the product.** The value was never "here is the
standard" — the contractor already owns the standard. It is "here is what to
check, and here is a draft finding written up." That is our work.

### The line that matters

**Clause references are facts.** Citing `NFPA 25 § 13.2.5` is like citing a case
number; that is not the protected part.

**Expression is protected.** Copying the standard's sentences — or paraphrasing
closely enough that ours is recognisably a rewrite — is where risk lives. And
systematically shadowing an entire standard clause-for-clause can be a derivative
work even when no single sentence matches. Volume and structure matter, not just
wording.

### Controls, in place

| Control | Where |
|---|---|
| Authoring discipline — write from practice, never rewrite alongside the page | [`gate2-harness/fixtures/library/README.md`](gate2-harness/fixtures/library/README.md) |
| Extraction prompt forbids reproducing or paraphrasing published wording | `harness/pipeline.py` → `EXTRACT_ROLE` |
| Runtime guard flags requirement language not drawn from the library | `harness/pipeline.py` → `_grounded_in`, tested in `selftest.py` |
| Authorship provenance recorded per library version | `corpus.py ingest --author` → manifest |

The runtime guard matters more than it looks. **The model has read NFPA in
training.** Without an explicit check it will supply remembered standard wording
wherever the library is silent — reproducing, from memory, exactly the material
we chose not to license. That check is the technical enforcement of the whole
strategy.

### What this costs

**Someone has to write and maintain the library.** Across two standards, multiple
editions, and per-jurisdiction amendments. This is the recurring cost that
replaces the licence fee, and it is not small — but it is *labour we control*
rather than a fee someone else sets, and it is labour that compounds into the
asset.

**One real product degradation.** Reviewers lose the verbatim clause quote, which
was the thing that made review fast. Our procedure text has to be precise enough
that a reviewer can check it against their own copy without hunting. Watch this
specifically at Gate 3 — "is reviewing faster than writing" is already the
question the walkthrough turns on, and this change makes it harder to answer yes.

### Still to do

1. **Keep the authoring discipline actually enforced.** The controls above are
   only worth what the practice is — a library written by rewriting alongside the
   page defeats all of them, and no amount of process documentation fixes that
   after the fact.
2. **Decide the AHJ-facing position.** Some jurisdictions may expect the filed
   report to quote the standard. If so, the customer's licensed copy supplies it —
   confirm during the AHJ interviews in R2.

**Kill condition:** authored-library output fails to satisfy Gate 3 buyers *and*
licensing turns out to be unobtainable. Both would have to be true.

## R2 — AHJ acceptance

The product assumes an AHJ accepts the same format, signed by the same person,
regardless of how the document was produced. That is very likely right — the
attestation is what the AHJ relies on — but it is an assumption, and one
jurisdiction refusing loudly could stall a region.

**Test it cheaply:** the AFAA membership includes municipal fire officials and
sub-code officials ([`gate1-recruiting/01-target-list.md`](gate1-recruiting/01-target-list.md)).
Interview two AHJs during Gate 1. Ask what makes them reject a filing and
whether document provenance has ever been a factor. Costs nothing and de-risks
the objection permanently.

## R3 — Professional liability

Reports feed filings that carry a licensed person's attestation. The review
clause in [`gate3-pilot/pilot-agreement.md`](gate3-pilot/pilot-agreement.md) is
the primary control, and it is load-bearing rather than boilerplate.

**Before a paid pilot:** get an E&O / tech E&O quote for a vendor in this
position. Insurance is the control that actually absorbs this risk if the review
clause is ever tested. It now carries a placeholder of ~$200/month in
[`02-stack-and-costs.md`](02-stack-and-costs.md) A3 and
[`07-financials.md`](07-financials.md).

**The quote is not really about the premium.** A product whose output enters
life-safety filings will not be underwritten like ordinary B2B software, and the
outcome that matters is binary: declination, or a cover carrying an exclusion
that removes precisely the scenario it was bought for. Either lands on the
business model rather than the budget, which is why the quote belongs before a
paid pilot and not after one.

**Never offer indemnity.** It cannot be backed at this stage, and offering it
signals to a compliance buyer that the risk has not been thought about.

## R4 — Fabricated citations

A confidently wrong clause reference is worse than a missing one: a reviewer
sees a gap, but reads a plausible wrong citation as correct. This is the
failure mode most likely to lose a customer permanently and the one most likely
to attract liability.

Already mitigated in the harness — every cited clause is substring-checked
against the corpus and flagged if absent, and fabrications are counted
separately from misses with their own gate budget. **Carry both controls into
the product.** They are not scaffolding for the test; they are the product's
safety property.

## R5 — Technician adoption

The capture premise. Already handled as the Gate 1 flip trigger, with a
dedicated section in the capture template and a threshold in the scorecard
(≥6 of 12 device-hostile → switch to Candidate 2).

Incumbent evidence is mildly encouraging: Inspect Point is praised for its
offline mobile workflow, which means field technicians in this trade *do* use
mobile tools. The question is narrower than "will they adopt a device" — it is
"will they narrate instead of tap."

## R6 — Standards revision cycle

NFPA 25 and 72 revise on multi-year cycles, and jurisdictions adopt editions at
different times. The corpus is therefore not one document but a matrix of
edition × jurisdiction, and getting it wrong produces citations that are correct
for the wrong edition.

Long-context grounding is what makes this tractable at all — it is a corpus swap
rather than a rules-engine rewrite, which is exactly why incumbents lag. But it
is ongoing operational work, and it is the work the onboarding fee funds. Budget
it as a recurring cost, not a one-off.

## R7 — Single-customer concentration in the pilot cohort

Two paid pilots clears Gate 3. Two customers is also a cohort where one churn
halves the business and destroys the reference base.

Not a reason to lower the bar — it is a reason to keep recruiting through Gates
3 and 4 rather than stopping at two.

## R8 — CRE-style cyclicality (Candidate 2 only)

Noted for completeness. Due-diligence report volume tracks commercial
real-estate lending. Candidate 1 does not carry this risk — inspection cycles
are statutory and run through downturns, which is the whole point of the
non-discretionary-spend filter.

## Ranked

| # | Risk | Severity | Resolvable now? | Owner action |
|---|---|---|---|---|
| R1 | Content authorship | Medium | Controls in place | Hold the authoring discipline; audit the library against it |
| R3 | Professional liability | High | Yes | Costed as a placeholder; real E&O quote before Gate 3 |
| R4 | Fabricated citations | High | Mitigated | Carry harness controls into product |
| R2 | AHJ acceptance | Medium | Yes, cheaply | Interview two AHJs in Gate 1 |
| R5 | Technician adoption | Medium | Gate 1 tests it | Flip trigger already in scorecard |
| R6 | Revision cycle | Medium | Ongoing | Budget as recurring cost |
| R7 | Cohort concentration | Medium | Partly | Keep recruiting past two |
| R8 | Cyclicality | Low (C1) | n/a | Only if switching to C2 |

**R3 is now the one to act on.** With the licensing dependency gone, professional
liability is the highest live risk, and the E&O premium needs to enter the cost
model where it is currently absent entirely. The review-and-sign-off clause is
the control that keeps you out of the liability chain; insurance is what absorbs
it if that clause is ever tested.

---

Sources: [ANSI — 2017 district court ruling](https://www.ansi.org/news/standards-news/all-news/2017/02/us-district-court-rules-in-favor-of-copyright-protection-for-standards-incorporated-by-reference-int-13) ·
[EFF — appeals court on Public.Resource.Org](https://www.eff.org/press/releases/appeals-court-upholds-publicresourceorgs-right-post-public-laws-and-regulations) ·
[CRS — copyright in standards incorporated by reference / Pro Codes Act](https://www.congress.gov/crs-product/R47656) ·
[NFPA LiNK](https://www.nfpa.org/for-professionals/codes-and-standards/nfpa-link) ·
[NFPA LiNK Enterprise](https://www.nfpa.org/for-professionals/for-business/link-enterprise)
