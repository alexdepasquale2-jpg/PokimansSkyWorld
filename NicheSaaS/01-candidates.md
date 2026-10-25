# Three Candidates, Scored

All three pass the mandatory-spend filter and the only-possible-now test. The scores below
are a **starting hypothesis**, not a finding — several of them are exactly what the
validation sprint exists to confirm or destroy. Score them again with real interview data
before committing.

Rubric and weights: [`00-framework.md`](00-framework.md).

## Scorecard

| Criterion | Wt | C1 Fire/life-safety | C2 Due diligence | C3 Municipal records |
|---|---|---|---|---|
| Mandatory / recurring | ×3 | 5 → 15 | 5 → 15 | 5 → 15 |
| Existing budget | ×3 | 5 → 15 | 5 → 15 | 3 → 9 |
| Buyer reachability | ×2 | 5 → 10 | 4 → 8 | 3 → 6 |
| Only-possible-now | ×2 | 5 → 10 | 5 → 10 | 5 → 10 |
| Competitive vacuum | ×2 | 4 → 8 | 4 → 8 | 4 → 8 |
| Moat accrual | ×2 | 5 → 10 | 4 → 8 | 5 → 10 |
| Small-team buildable | ×1 | 4 → 4 | 3 → 3 | 3 → 3 |
| **Total (of 75)** | | **72** | **67** | **61** |

Kill-rule check: C1 clean. C2 clean. **C3 trips "committee procurement with no pilot
budget"** in most municipalities — which is why it is documented here as a contrast case
rather than a live option.

---

## Candidate 1 — Fire & life-safety inspection compliance (NFPA 25/72)

**Recommended lead.**

Fire-protection contractors inspect sprinkler systems, alarms, extinguishers, and backflow
preventers on quarterly and annual cycles. They must produce a standards-conformant report,
file it with the Authority Having Jurisdiction, and hand the deficiency list to the
building owner.

**Mandatory (5).** Codified in NFPA 25 and 72, adopted by reference into local fire code,
enforced by insurers independently of the AHJ. The calendar is fixed and legal. Nobody
decides whether to do this.

**Budget (5).** Technicians bill $95–150/hour. Report writeup runs one to three hours per
building and is very often done in the evening, unbilled, because it cannot be billed as
field time. That unbilled hour is the emotional centre of the sale.

**Reachability (5).** State sprinkler and alarm associations, AFSA and NFSA member
directories, regional trade shows. The typical shop is 5–40 technicians — small enough that
the owner takes the meeting, large enough that seat-based pricing reaches five figures.

**Only-possible-now (5).** The product *is* voice-first field capture graded against a
thousand-page standard. Remove long-context standards grounding and structured extraction
from speech and there is no product left, only a form.

**Vacuum (4).** Inspect Point, BuildingReports, ServiceTrade and similar are form-first and
dispatch-centric. They digitised the clipboard; none of them removed the translation step
where a human converts what they saw into schema fields. That is the opening.

**Moat (5).** Per-building device inventories plus multi-year deficiency history become the
customer's system of record within a year. By month 12 the reason they stay is that the
history lives here.

**Buildable (4).** Offline-first capture is genuinely fiddly, and the standards corpus
needs careful preparation. Twelve weeks is realistic, not comfortable.

**Risks and mitigations.** Two real ones. *Field connectivity* — mechanical rooms and
basements have no signal, so capture must work fully offline and sync later; this is a
first-class architectural constraint, not a later enhancement. *Technician resistance* —
field staff have been handed device workflows before and hated them. The mitigation is
voice-only capture with zero required typing: if the technician has to tap through a form,
you have rebuilt the incumbent and lost the only advantage you had.

---

## Candidate 2 — Due-diligence report production (PCA, Phase I ESA)

**Designated fallback.**

Engineering and environmental consultancies produce lender-required Property Condition
Assessments and ASTM E1527-21 Phase I Environmental Site Assessments for commercial
real-estate transactions.

**Mandatory (5).** Required by the lender or agency before a loan closes. The deal does not
fund without the report, which makes the deadline pressure extreme and the willingness to
pay for turnaround unusually high.

**Budget (5).** $2,000–4,000 per report, 15–25 hours of writeup. The best per-artifact
economics of the three by a wide margin.

**Reachability (4).** A few thousand firms, findable through professional bodies and lender
approved-vendor lists. Marked down from 5 because the sale is partner-led and consensual
across a firm rather than a single owner's decision.

**Only-possible-now (5).** Site photographs, inspector voice notes, and regulatory database
records converging into a 60–120 page templated report is the long-context, vision, and
structured-output combination in its purest form.

**Vacuum (4).** Currently Word templates plus offshore writeup teams. The offshore team is
the real competitor, and it is a competitor with a known price.

**Moat (4).** Firm-specific templates and boilerplate libraries. Real, but weaker than
C1 — a firm's templates are portable in a way that a decade of building history is not.

**Buildable (3).** Report length and structural complexity make v1 substantially bigger,
and the review UX has to be excellent rather than adequate.

**Risks.** Highest per-artifact stakes of the three: these reports are stamped by a licensed
professional and carry real liability, so a sloppy review interface is disqualifying rather
than merely annoying. Volume also tracks commercial real-estate lending, so the business has
a cyclical component C1 does not.

**Why it is the fallback and not the lead.** Better economics, worse fit. Slower sales
motion, larger liability surface, bigger v1. Switch to it if C1 discovery shows
fire-protection shops are more device-hostile than expected — that is the specific finding
that would flip the decision.

---

## Candidate 3 — Municipal records & public-records (FOIA/PRA) response

**Contrast case. Not currently actionable.**

Local government clerks must publish agendas and minutes on statutory deadlines, and
respond to public-records requests within statutory windows, with redaction.

**Mandatory (5).** Statutory, with penalties for non-compliance and, in many jurisdictions,
personal exposure for the clerk.

**Budget (3).** Real but fragmented and frequently grant-dependent. The money exists; it
does not exist *reliably* or on a schedule you can forecast.

**Reachability (3).** Roughly 90,000 local government units in the US. Enormous TAM, and
almost none of it addressable by a small team — procurement is RFP-driven, slow, and
relationship-mediated.

**Only-possible-now (5).** Diarised transcription, retrieval with citation across decades of
records, and reviewable redaction. Technically the most compelling of the three.

**Vacuum (4).** Incumbents are dated and widely disliked.

**Moat (5).** The product becomes the archive. Nobody migrates an archive.

**Buildable (3).** Redaction correctness is a hard problem with a bad failure mode.

**Why it is excluded.** It trips a kill rule outright: committee procurement with no pilot
budget. The technical fit and the moat are the best of the three, and none of that survives
a nine-month sales cycle against a modest budget. Revisit once C1 or C2 is generating cash
and can fund a slower motion — this is a deferral, not a rejection.

---

## The decision

Lead with **C1**. Hold **C2** as the fallback with a specific trigger: if Gate 1 interviews
show technicians will not adopt a device workflow regardless of how little typing it
requires, switch and re-run the sprint.

Do not run both simultaneously. Two half-validated candidates is the most common way a small
team spends six months learning nothing conclusive about either.
