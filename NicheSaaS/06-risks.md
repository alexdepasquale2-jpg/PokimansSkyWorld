# Risk register

Risks the four gates do not test. The gates measure demand, feasibility,
pricing, and retention — a business can clear all four and still be killed by
something on this list.

> Nothing here is legal advice. R1 in particular needs a lawyer before a paid
> pilot, not after.

## R1 — Standards licensing · **highest, and unresolved**

The product's core feature is citing NFPA 25 and 72 clauses, and quoting the
governing sentence, inside a document delivered commercially to a paying
customer. **NFPA standards are copyrighted.** This has surfaced three times
across these documents as "settle before a paid pilot," and it is still open.

**Why the obvious escape hatch does not apply.** NFPA, ASTM and ASHRAE sued
Public.Resource.Org over posting standards incorporated by reference into law.
A district court initially upheld copyright; an appeals court later held that
Public Resource's posting was **fair use** — resting explicitly on the use being
**nonprofit and educational**, serving a different purpose from the standards
bodies' own.

That reasoning does not obviously extend to a commercial product embedding the
same text in a paid deliverable. Its use is neither nonprofit nor educational,
and it is arguably a substitute for the standards body's own licensed offering —
the two fair-use factors that carried the ruling both point the other way here.
**Do not treat the Public.Resource.Org outcome as cover.** The Pro Codes Act,
which would alter this landscape, has been before Congress and is not settled
law.

**The plausible path** is a commercial licence. NFPA LiNK is the digital
delivery product, and an Enterprise tier exists that has been integrated into
third-party content management systems — there is precedent for NFPA licensing
content into someone else's software. That precedent is the thing to pull on.

**Do this, in order, before Gate 3:**

1. Contact NFPA licensing directly. Describe the actual use: clause references
   and short quotations, inside customer-specific reports, delivered
   commercially. Get the terms and the per-seat or per-report cost in writing.
2. Have a lawyer read the answer against the product as designed.
3. Model the licence cost into
   [`02-stack-and-costs.md`](02-stack-and-costs.md). At ~$0.85 COGS per report
   there is room, but a per-seat standards licence at incumbent-like rates
   changes the picture materially.

**Fallback if licensing proves impossible or prohibitive:** cite clause
*references* without quoting text, and let the customer's own licensed
subscription supply the language. Weaker product — the quoted sentence is what
makes review fast — but it survives. Design the corpus loader so this is a
configuration change, not a rewrite. It already is: the harness reads a
user-supplied corpus directory.

**Kill condition:** licensing is refused *and* reference-only output fails to
satisfy Gate 3 buyers.

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

**Before a paid pilot:** lawyer review of that clause, and a conversation with
an insurance broker about E&O / tech E&O cover for a vendor in this position.
Get the premium into the cost model — it is a fixed cost the plan currently
omits entirely.

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
| R1 | Standards licensing | **Kill** | Yes | Contact NFPA licensing this week |
| R3 | Professional liability | High | Yes | Lawyer + broker before Gate 3 |
| R4 | Fabricated citations | High | Mitigated | Carry harness controls into product |
| R2 | AHJ acceptance | Medium | Yes, cheaply | Interview two AHJs in Gate 1 |
| R5 | Technician adoption | Medium | Gate 1 tests it | Flip trigger already in scorecard |
| R6 | Revision cycle | Medium | Ongoing | Budget as recurring cost |
| R7 | Cohort concentration | Medium | Partly | Keep recruiting past two |
| R8 | Cyclicality | Low (C1) | n/a | Only if switching to C2 |

**R1 is the one to act on this week.** It is the only kill-condition risk, it is
resolvable by a phone call and a lawyer, and every other asset in this repo
assumes an answer nobody has yet asked for.

---

Sources: [ANSI — 2017 district court ruling](https://www.ansi.org/news/standards-news/all-news/2017/02/us-district-court-rules-in-favor-of-copyright-protection-for-standards-incorporated-by-reference-int-13) ·
[EFF — appeals court on Public.Resource.Org](https://www.eff.org/press/releases/appeals-court-upholds-publicresourceorgs-right-post-public-laws-and-regulations) ·
[CRS — copyright in standards incorporated by reference / Pro Codes Act](https://www.congress.gov/crs-product/R47656) ·
[NFPA LiNK](https://www.nfpa.org/for-professionals/codes-and-standards/nfpa-link) ·
[NFPA LiNK Enterprise](https://www.nfpa.org/for-professionals/for-business/link-enterprise)
