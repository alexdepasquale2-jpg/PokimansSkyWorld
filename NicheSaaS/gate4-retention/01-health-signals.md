# Health signals

Five weekly numbers per pilot. Together they predict the month-3 answer well
before anyone says it out loud.

Log them every Friday. Ten minutes.

## The five

### 1. Coverage — inspections sent ÷ inspections performed

**The single most predictive number.** Ask what their week's inspection count
was; compare to what arrived.

| | Reading |
|---|---|
| Approaching 1.0 | It has become the way they do inspections |
| Stuck near 0.3 | It is a side experiment on selected jobs |
| Falling | Something happened. Find out this week, not at renewal |

A pilot running at 30% coverage at month 2 does not renew, whatever they say in
the meeting. They have not changed how they work; they have added an optional
step, and optional steps get dropped.

### 2. Latency — hours from inspection to files arriving

Falling latency means the habit is forming: the technician is sending from the
van rather than the office remembering on Thursday.

Rising latency is the earliest churn signal you get, usually two to three weeks
before coverage drops.

### 3. Review edit rate — edits per report at sign-off

Two different failures, opposite directions:

- **Rising** — output quality is slipping, or their expectations sharpened. A
  product problem, and one you should fix.
- **Near zero** — read carefully. Either the drafts are genuinely good, or nobody
  is really reviewing. In a compliance product the second is dangerous, and it is
  worth asking directly: *"how carefully is your reviewer actually reading these?"*

Somewhere in the middle is healthy. A reviewer making a few edits is a reviewer
who is reading.

### 4. Reach — who is sending the files

Track the sender, not just the volume.

Still the owner at week 6 means it has not reached the field, and the pilot is
one person's enthusiasm. It converts only as long as that person stays
interested.

Two or more technicians sending, unprompted, is the strongest single indicator
that this becomes infrastructure rather than a tool someone tried.

### 5. Quote conversion — deficiencies becoming paid work

**The ROI hook, measured.** The whole pitch is that same-day quoting converts
better than next-week quoting ([`../03-product-concept.md`](../03-product-concept.md)).

Get their Gate 1 baseline from the capture sheet and compare monthly.

If this number has not moved by month 2, the ROI story did not materialise for
this customer, and renewal rests entirely on paperwork time saved — which per
[`../gate3-pilot/roi-calculator.html`](../gate3-pilot/roi-calculator.html) may
not be enough on its own if they are demand-constrained rather than
capacity-constrained.

**This is also the number to be most sceptical of.** It moves for reasons
unrelated to you — seasonality, a big account, one persuasive estimator. Don't
claim credit for a rise you cannot attribute.

## Weekly log

| Week | Coverage | Latency (h) | Edits/report | Senders | Quote conv. | Note |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |
| 8 | | | | | | |

## Reading the pattern

| Pattern | Likely outcome |
|---|---|
| Coverage rising, reach ≥2 senders, latency falling | Renews. Ask early and confidently |
| Coverage flat ~0.3–0.5, one sender | Does not renew. Find out why *now*, while it is still diagnosable |
| Coverage high, quote conversion flat | Renews on time saved alone. Fragile — check they are capacity-constrained |
| Edit rate near zero, coverage high | Verify someone is genuinely reviewing before treating this as success |
| Everything good, then a sharp drop | Something specific broke. One bad report can end a pilot; ask directly |

## The instrumentation this implies

Coverage, latency, senders and edit rate should come from the product, not from
asking. If the pilot is being run by hand, log them by hand — but if a v1 gets
built, these five are the first analytics worth having, ahead of anything a
dashboard would normally show.

Quote conversion has to be asked for. Their number, monthly, in a sentence.
