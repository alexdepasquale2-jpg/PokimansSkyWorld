# Part B — Product Concept and Features

## The concept in one line

**Not a form. A capture-and-attest system.**

The technician narrates and photographs. The system produces a standards-cited,
jurisdiction-conformant report plus a priced repair proposal. A qualified human reviews a
diff and signs.

## What the old product asked of people

Every incumbent in this space digitised the clipboard. They took a paper form, put it on a
tablet, and called it modernisation. The thing they left untouched is the expensive part:
**a human standing in a mechanical room, translating what they can see into a database
schema, by hand, on a phone.**

That translation step is why technicians do their paperwork at home. It is why reports come
back from the AHJ rejected on formatting. It is why deficiencies discovered on Tuesday get
quoted the following week, if at all. Every feature below removes a piece of that
translation work, and each is listed with the specific capability that makes it possible
now and did not before.

## The features

### 1. Voice-first capture

The technician talks:

> *"Riser two, main drain test, static sixty-eight residual forty-one. Gauge on the east
> side is fogged and past cal date."*

The system extracts device identity, test values, and deficiency classification into a
validated schema. No fields, no dropdowns, no typing.

**Enabled by:** accurate low-cost ASR combined with strict structured output — the model
emits a schema-validated record, not prose that something else has to parse.

**Previously:** several hundred tappable form fields. The reason field staff deferred
paperwork to the evening was never laziness; it was that the form was slower than the work.

**Design constraint:** if the technician has to tap through anything to complete a capture,
you have rebuilt the incumbent and forfeited the only advantage you had. Voice-only is not a
preference, it is the product.

### 2. Photo-as-evidence grading

Ordinary phone photos are classified — device type, tag legibility, obstruction, corrosion,
missing signage — and each is attached to the specific deficiency it evidences.

**Enabled by:** vision that works on unconstrained real-world images: bad light, odd angles,
a thumb in the corner.

**Previously:** a bespoke OCR or computer-vision pipeline per document type. Economically
impossible at this market's size — nobody was going to build and maintain that for three
thousand sprinkler contractors.

### 3. Procedure-grounded findings with clause references

Every deficiency is grounded in a procedure from our own authored library, and
carries the clause reference that procedure maps to — plus any local amendment.
The whole library sits in the prompt, cached.

**Enabled by:** a 1M-token context window with prompt caching, which makes cache
reads roughly a tenth the cost of fresh input. The entire procedure library plus
jurisdiction amendments can be present on every request without the cost being
absurd.

**Previously:** a hand-maintained rules engine rewritten every code cycle. This
is precisely why incumbents lag jurisdictions by years — encoding requirements as
rules scales with the standard, and the standard keeps changing.

**The library is ours, not licensed.** It states what to check and what makes a
finding a deficiency, in our own words, and cites the clause so a reviewer can
turn to their own copy of the standard for the authoritative text. See
[`06-risks.md`](06-risks.md) R1 for why this is the stronger position and what it
costs.

**The honest tradeoff:** a reviewer does not get the standard's sentence quoted
back at them, which was the fastest possible way to verify a finding. Our
procedure text has to be precise enough that checking it against their own copy
is quick. This is the single thing most likely to weaken the review-speed claim,
and it is what to watch at Gate 3.

### 4. One capture, N required outputs

The same inspection emits the AHJ's required form, the insurer's format, and the building
owner's PDF. Adding a jurisdiction becomes a configuration change rather than an engineering
ticket.

**Enabled by:** long-context template conformance plus structured output — the target format
is data given to the model, not code compiled into the product.

**Previously:** one hard-coded exporter per format, each one a small permanent maintenance
liability. This is the structural reason incumbents cover few jurisdictions well.

**Strategic consequence:** jurisdiction coverage becomes a sales weapon rather than a
roadmap item. "We support your county" stops requiring a sprint.

### 5. Deficiency → priced repair proposal

Findings convert into a quote — parts, labour, urgency — ready to send before the technician
leaves the site.

**Enabled by:** reliable extraction into a pricing schema, grounded in the customer's own
price book.

**This is the ROI hook.** You are not selling relief from paperwork; you are selling the
revenue the paperwork was blocking. A deficiency found on Tuesday and quoted the following
week frequently never converts. Quoted before the van leaves the lot, it often does. **Lead
every demo here**, not with the report — the report is how you earn the right to generate
the quote.

### 6. Cross-cycle continuity

*"This device failed last year, and the year before."* Portfolio-level trend detection
across all of a customer's buildings.

**Enabled by:** per-record reasoning cheap enough to run across years of history rather than
just the current inspection.

**Previously:** the data existed, as PDFs nobody could query. Every inspection started from
zero because the prior one was an artifact rather than a record.

**This is one of two moats.** By month 12 the multi-year history is the reason they cannot
leave — not the UI, not the price. Nobody migrates three years of device history to save
fifteen percent.

The other is the procedure library itself. A competitor can license the same standard and be
at parity on day one; they cannot buy a library that has been sharpened by every inspection
we have processed and every AHJ rejection our customers have hit. Licensed content is a
commodity. Authored content compounds.

### 7. Review-and-attest, never auto-file

The reviewer sees a diff: what was said, what was extracted, what changed, and what the
system is unsure about. Low-confidence extractions are surfaced, not hidden. Sign-off is
explicit and audited.

**Non-negotiable.** A compliance product that files unreviewed output is a liability rather
than a feature, and the first time it is wrong the failure is attributed to you. The
attestation trail is also a genuine selling point to the buyer's insurer — "every filing
carries a named reviewer and a timestamped record of what they approved" is a sentence that
sells.

**Design note:** the review interface is not a secondary screen. On a product whose entire
premise is machine-generated compliance artifacts, the review UX is the trust surface, and
it deserves the same care as capture.

## What v1 does not include

No scheduling or dispatch. No accounting or invoicing. No CRM. No native mobile app. No
customer-facing portal. No expansion to adjacent trades.

Each of these is a real product that somebody else already sells competently. Building any
one turns a twelve-week v1 into an eighteen-month one, and none of them is the reason a
customer would switch. **Integrate later; do not absorb.**

The discipline here is worth stating explicitly because it will be tested: design partners
*will* ask for scheduling, because their existing tool has it and they are mentally
comparing feature lists. The correct answer is that this product replaces the writeup, not
the dispatch board, and that it will export cleanly to whatever they use for dispatch.
