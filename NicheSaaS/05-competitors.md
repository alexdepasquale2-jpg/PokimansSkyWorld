# Incumbent teardown

Desk research on the three incumbents named in
[`01-candidates.md`](01-candidates.md). It moves two numbers that the plan had
as assumptions.

> **Source bias warning.** Much of the published comparison content in this
> category is written *by* the vendors about each other — Inspect Point's
> "10 tools compared" page and ServiceTrade's "9 best tools" post are marketing,
> not analysis. Feature-gap claims sourced from a competitor are marked below
> and should be verified during Gate 1 interviews rather than believed.

## The headline finding

**Inspect Point is reported at up to $129 per user per month, annual
commitment, plus an upfront implementation fee.** Pricing is not published; it
is disclosed on a sales demo.

That lands squarely inside the $99–149/technician/month band in
[`02-stack-and-costs.md`](02-stack-and-costs.md), which has two consequences:

1. **The ACV target is validated.** A 12-technician shop at $129 is ~$18.6k —
   the top of the plan's $12–18k range. The market already pays this. The
   pricing model was a guess and it turns out to be the right guess.
2. **Price is not a wedge, and should not become one.** Entering below $129 to
   win on cost gives up the margin that funds founder-led sales, and signals
   that the product is a cheaper version of the incumbent rather than a
   different shape. The wedge has to be the capture model.

## Per incumbent

### Inspect Point

Purpose-built fire inspection platform — the closest direct competitor.

| | |
|---|---|
| Pricing | Silver / Gold / Platinum + Enterprise; up to ~$129/user/mo (third-party reported, not official) |
| Terms | Annual commitment, upfront implementation fee typical |
| Capterra | 3.8 / 5 across 40+ reviews |
| Value for money | 3.2 / 5 (aggregated) |
| Praised | Fire-specific inspection tools, offline mobile workflow |
| Criticised | Pricing opacity, **iOS-only**, support responsiveness |

**Two openings worth noting.**

*iOS-only* is a concrete, verifiable gap. The offline-first PWA in
[`02-stack-and-costs.md`](02-stack-and-costs.md) was chosen because mechanical
rooms have no signal — it happens to also run on the Android handsets a good
share of field technicians carry. An architectural decision made for one reason
turning out to cover a competitive gap is worth confirming in interviews rather
than assuming.

*Value-for-money at 3.2 against an overall 3.8* says buyers rate the product
higher than they rate the deal. That is an opening and a warning: a dissatisfied
base is easier to talk to, but entering at the same price against people who
already feel overcharged means the product has to be visibly better, not
marginally so. "Same price, slightly nicer" loses to inertia every time.

### BuildingReports

Compliance documentation with barcode and NFC asset scanning. Built for large
enterprises and government facilities.

Reported gaps *(source: a competitor's comparison page — verify)*: no deficiency
management, no proposal generation, no invoicing. Also reported: substantial
first-time data-entry burden, dated interface, enterprise pricing.

If the no-proposal-generation claim holds, it is directly relevant — the
deficiency-to-quote path is the ROI hook in
[`03-product-concept.md`](03-product-concept.md). Ask about it in interviews
rather than repeating the claim in a sales conversation.

### ServiceTrade

General field-service management for commercial contractors — HVAC, mechanical,
fire protection. 1,300+ contractors, eleven years building for commercial
service operations. Unpublished pricing, implementation fee, annual contract.

Reported gaps *(competitor-sourced — verify)*: not fire-specific, no pre-built
NFPA templates, no AHJ submission.

**This is the one to be careful about.** ServiceTrade connects scheduling,
dispatch, photo documentation, deficiency reporting, and follow-up quoting in
one system. A shop already running it has the workflow, minus the standards
grounding — which makes ServiceTrade a plausible *integration* partner and a
bad *displacement* target. The objection script in
[`gate3-pilot/03-objections.md`](gate3-pilot/03-objections.md) already takes
this line: keep it, this replaces the writeup, not the dispatch board.

## What this does and does not change

**Confirms:** the $99–149/seat band, the $12–18k ACV target, and that the
category buys annual contracts with implementation fees — so the onboarding fee
in the pricing structure is a category norm, not a novelty.

**Sharpens:** the competitive vacuum score. The scorecard has it at 4/5 on the
premise that incumbents are form-first with no voice or vision capture. Nothing
found contradicts that, and no incumbent surfaced with voice-first capture — but
this is desk research, and absence of evidence in vendor marketing is weak
evidence of absence. **Treat 4/5 as still-unverified.** Question 8 of the
interview guide ("what would make you leave?") is where it gets confirmed.

**Warns:** a 3.2/5 value-for-money score across an incumbent base means the next
vendor in the door starts with a sceptical audience. That is why the Gate 3
walkthrough leads with the misses — a category that has been oversold responds
badly to being oversold again.

---

Sources: [Inspect Point comparison](https://www.inspectpoint.com/best-fire-inspection-software/) (vendor) ·
[ServiceTrade comparison](https://servicetrade.com/resources/blog/best-fire-life-safety-software-2026/) (vendor) ·
[Inspect Point review](https://www.contractorsoftwarehub.com/inspect-point-review/) ·
[Capterra — Inspect Point](https://capterra.com/p/148287/Inspect-Point/) ·
[Software Advice](https://www.softwareadvice.com/fleet-management/inspect-point-profile/)
