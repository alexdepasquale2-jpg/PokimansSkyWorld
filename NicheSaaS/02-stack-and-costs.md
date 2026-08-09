# Part A — Tech Stack, Unit Economics, and Go-To-Market Cost

Everything here is scoped to Candidate 1 (fire and life-safety inspection compliance). The
stack transfers to Candidate 2 essentially unchanged; the go-to-market does not.

## A1. The stack

| Layer | Choice | Why this one |
|---|---|---|
| App | Next.js (App Router) + TypeScript | One codebase for marketing site, dashboard, and API. Smallest surface a small team can maintain. |
| Field capture | Offline-first PWA — camera, `MediaRecorder`, IndexedDB queue. Capacitor wrapper only when app-store presence is actually demanded | Mechanical rooms have no signal. Native-first on day one is a scope trap that buys nothing v1 needs. |
| Database | Postgres (Neon or Supabase) | The domain is relational: buildings → devices → inspections → deficiencies. Add `pgvector` for retrieval; do not add a separate vector database. |
| Object storage | Cloudflare R2 (or S3) | Photos and audio dominate storage. R2's zero egress matters the first time a customer exports a multi-gigabyte evidence pack for their insurer. |
| Background jobs | Inngest, or a plain Postgres-backed queue and worker | Report generation is minutes long and multi-step. It must never run inside a request handler. |
| AI | Claude API — `claude-opus-5` for report generation and standards reasoning, `claude-haiku-4-5` for photo classification and extraction. Batch API (50% off) for non-interactive passes. Prompt caching for the standards corpus. Structured outputs (`output_config.format`) on every extraction | See A2. Schema-validated extraction is what makes the output a record rather than prose. |
| Speech-to-text | Deepgram or AssemblyAI, roughly $0.004–0.008/min — **verify current rates at signup** | Purpose-built ASR beats a general model on both cost and noisy-jobsite accuracy. |
| Auth | Clerk now; WorkOS when the first enterprise demands SSO | Don't hand-roll auth. Don't buy SSO before someone asks. |
| Payments | Stripe | Seat-based with usage overage. |
| Observability | Sentry, plus a first-party per-customer token/cost dashboard | Per-artifact model cost must be visible from week one or margin drifts invisibly for months. |

**Deliberately omitted:** Kubernetes, microservices, a separate native mobile app,
self-hosted models, and any LangChain-style orchestration framework. Direct SDK calls plus a
job queue is the entire architecture. Each omission is a thing that would consume a
disproportionate share of a three-person team's attention while producing nothing a customer
would notice.

### The two architectural decisions that actually matter

**Offline-first is a constraint, not a feature.** Capture must complete fully with the radio
off and sync opportunistically. This shapes the data model (client-generated IDs,
conflict-tolerant merge), the media pipeline (local encode, queued upload), and the UX (no
spinner ever blocks the technician). Retrofitting it later means rewriting the capture path.

**Prompt-prefix stability is a margin decision.** The standards corpus must be byte-identical
across requests or cache reads stop hitting and the per-report cost roughly triples. Any
interpolated timestamp, request ID, or non-deterministically-serialised JSON in the prefix
silently kills caching — silently, because nothing errors. Assert on
`usage.cache_read_input_tokens` in CI against a golden request, and alert if it drops to
zero in production.

## A2. Unit economics — one inspection report

Model pricing per million tokens: Opus 5 $5 in / $25 out; Haiku 4.5 $1 in / $5 out. Cache
reads ~0.1×. Batch API 50% off.

| Step | Estimate | Cost |
|---|---|---|
| Transcribe 45 min of technician narration | 45 min @ ~$0.005/min | $0.23 |
| Classify and grade 60 site photos (Haiku 4.5, batched) | ~120k input tokens, small output | ~$0.10 |
| Generate report (Opus 5) — transcript, photo findings, standard excerpts, prior-year report | ~60k input, mostly cache reads; ~12k output | ~$0.35 |
| Deficiency → priced repair proposal (Opus 5, short) | ~8k in, ~2k out | ~$0.10 |
| Storage and compute, amortised | — | ~$0.05 |
| Standards licence | **negotiated — insert the real figure** | **$0.00–5.00** |
| **Total COGS per report** | | **~$0.85 + licence** |

**The licence line is the one that can move this.** Everything above it is model
and storage spend that scales predictably; the standards licence is a negotiated
term, and its *shape* matters more than its price:

| Licence shape | At $25/report | Verdict |
|---|---|---|
| $2 / report | ~89% gross margin | Comfortable |
| $5 / report | ~77% gross margin | Workable |
| Flat annual fee | Amortises to near zero at volume | Best case — push for this |
| $50 / seat / month | ~39% of a $129 seat, before any other cost | Breaks the CAC ceiling |

Negotiate for per-report or flat-annual. See [`06-risks.md`](06-risks.md) R1 for
the four permissions the licence has to grant, which are separate from its price
and easier to get wrong.

**Price:** $20–30 per report, or seat-based at $99–149 per technician per month with an
included report volume. A 12-technician shop lands at roughly **$14–21k ACV**.

Gross margin on variable cost exceeds 95%. This is worth stating plainly: **model spend is
not the cost driver of this business — support is.** Budget accordingly, and do not optimise
token spend at the expense of output quality, because a report that needs heavy correction
costs a support hour worth 60× the tokens it saved.

**Cost guardrails.** Cap tokens per artifact and alert on outliers rather than failing
closed. Route every non-interactive pass through the Batch API. Track cost per report per
customer — a single customer with pathological inputs (200 photos, three hours of audio) will
show up here long before it shows up in aggregate margin.

## A3. Fixed infrastructure

| Phase | Monthly | Composition |
|---|---|---|
| Build (pre-customer) | **$150–300** | Vercel Pro $20, Neon $19–69, R2 ~$10, Inngest ~$20, Clerk ~$25, Sentry $26, domains and email ~$30 |
| Pilot (5–10 design partners) | **$400–800** | Storage and job volume grow; add a staging environment |
| Early scale (~30 customers) | **$1,200–2,500** | Plus model spend, which is revenue-linked rather than fixed |

Figures are current list prices at time of writing; verify at signup. None of these are
large enough to optimise before there is revenue.

## A4. Sales and marketing

The motion is **founder-led sales into a trade-association-shaped market**. Not self-serve,
not paid-ads-led. These buyers are found at regional trade shows and through peer referral,
and they buy from a person who understands their trade.

### Channels, ranked by expected CAC

**1. Design-partner referrals.** Cheapest and highest-converting by a wide margin. This
market talks to itself constantly — shops in adjacent territories are not competitors and
share tooling recommendations freely. Make referral an explicit ask at every renewal
conversation, not a passive hope.

**2. Regional trade shows and state association meetings.** $1,500–3,000 per regional event
including travel. National booths run $6,000–12,000. Do two or three regionals before
considering a national — regionals have better conversation-to-attendee ratios and the
travel budget goes further.

**3. Targeted outbound.** A list of a few thousand named shops. Tooling runs $99–500/month
(Apollo, Clay) plus $150–300/month for sending infrastructure — domains and warmed inboxes.
Personalised and low-volume, from a real person. High-volume sequencing burns the list, and
in a market this small the list is finite and irreplaceable.

**4. Problem-shaped content.** "How to cut NFPA 25 report writeup from three hours to twenty
minutes," published where the trade actually reads. A contractor or part-time writer runs
$1,500–3,000/month. It compounds slowly, which is exactly why it starts early.

**5. Paid advertising.** Near-zero priority. The audience is too small to target
efficiently. Spend at most $300–500/month, and treat it as message testing rather than
acquisition.

### 12-month budget

| Phase | Months | Spend/mo | Focus |
|---|---|---|---|
| Discovery + build | 1–3 | $500–900 | Infrastructure, one regional event *as an attendee* (not exhibitor), outbound tooling for recruiting interviews |
| Design partners | 4–6 | $1,500–3,000 | 8–12 pilots at steep discount, first regional booth, content begins |
| Early sales | 7–12 | $3,000–6,000 | Two regional booths, outbound at volume, part-time SDR or contractor, content cadence |

Attending the first show without a booth is deliberate. It costs a fraction as much, and
walking the floor asking questions produces better discovery than standing behind a table
waiting to be approached.

### Targets

| Metric | Target |
|---|---|
| ACV | $12–18k |
| CAC ceiling | $4,000–6,000 (≈ one third of first-year ACV) |
| Payback | <12 months, ideally <9 |
| Logo churn | <8%/year |

**The churn number is the most important line in this document.** A product built on
mandatory, calendar-driven spend should churn far below SaaS norms. If it doesn't, the
vital-purpose thesis was wrong — the buyer found the work skippable, or found a cheaper way
to be compliant, and no amount of feature work fixes that. Treat churn above 15% as a signal
to re-examine the premise rather than the roadmap.

### Pricing structure

Annual contract, billed monthly per seat, with usage overage above an included report
volume, plus a one-time onboarding fee of $1,500–3,000 covering template and jurisdiction
configuration.

The onboarding fee is not a revenue line. It does two jobs: it filters out buyers who are
not serious enough to survive implementation, and it funds the configuration work that
becomes the switching cost. A customer who has paid to have their jurisdictions and
templates encoded has bought a reason to stay.
