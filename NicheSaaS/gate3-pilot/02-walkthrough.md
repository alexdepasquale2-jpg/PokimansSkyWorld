# The walkthrough

Thirty minutes, in person or screen-share. They gave you five inspections; you
are handing back five drafts and asking for money.

Bring: the five reports printed **and** on screen, their human-written versions,
the Gate 2 score output, their Gate 1 capture sheet, the ROI calculator, and a
payment link.

## 1. Frame — 60 seconds

> "You gave me five of your inspections. I ran them through what I've built and
> I want to show you what came out — including where it got things wrong, which
> is the part I'm most interested in your reaction to."

Naming the errors in the first sentence is deliberate. It sets you up as someone
evaluating a system rather than defending one, and everything after lands
differently.

## 2. Their report, their building — 5 minutes

Open the one that came out **best**. Beside it, the human-written version.

> "This is Building C, the one your guy did on the fourth. Left is what he
> wrote. Right is what came out of the audio and photos."

Then stop talking. Let them read.

Watch what they check first — it is almost never what you expect, and it is the
most useful signal in the meeting. Write it down.

## 3. Lead with the misses — 8 minutes

Take the worst of the five. Walk through every miss and every fabrication from
the Gate 2 score output.

> "It missed this one entirely — your guy caught the flow switch, the system
> didn't. And here it flagged something your guy explicitly said he wasn't
> calling, which is worse, because a reviewer might not catch it."

Then the honest position:

> "That's why nothing files automatically. A qualified person reviews and signs,
> every time. What I'm trying to work out is whether reviewing a draft is
> meaningfully faster than writing from scratch — and you're better placed to
> answer that than I am."

This question is the actual product hypothesis. Their answer, either way, is the
most valuable thing you get out of the meeting.

## 4. The quote — 5 minutes

Now the ROI hook. Show the deficiency-to-quote output from their real
inspection, priced from their real price book.

> "This came out of the same inspection. Parts, labour, urgency — from your
> price book. In principle your tech has this before leaving the site."

Then the question from Gate 1, asked again with their own number in front of
them:

> "You told me about [X]% of deficiencies turn into paid work. What happens to
> that number when the quote goes out the same day instead of next week?"

Let them answer. Their number, from their mouth, is worth more than any figure
you supply — and it's the input the calculator is most sensitive to.

## 5. Their arithmetic — 5 minutes

Open [`roi-calculator.html`](roi-calculator.html) and fill it in **from their
Gate 1 capture sheet**, live, while they watch.

Show them the conservative row first — value with **zero** conversion lift,
paperwork time only. If the pilot pays for itself on paperwork alone, the
conversion upside is a bonus rather than a load-bearing assumption, and they can
see you are not resting the case on the number that flatters you most.

## 6. The ask — 2 minutes

One sentence. Then stop.

> "I'd like to run this on your real inspections for three months at $[N] a
> month. You send files, I send back drafts within a day, and you tell me what's
> wrong with them. Can we start?"

**Then be quiet.** The silence is uncomfortable and it is doing the work. Do not
fill it with features, discounts, or reassurance. The first person to talk after
a price is named concedes something.

## 7. Handling the answer

**Yes** → payment link, on the spot. Diary the first file drop for within 48
hours; a pilot that doesn't start inside a week usually doesn't start.

**Yes, but…** → the objection is real and specific. See
[`03-objections.md`](03-objections.md). Resolve it in the room if you can.

**No** → the most valuable answer, if you ask the follow-up:

> "That's fair. Can I ask what would have to be different?"

Write the answer down verbatim. Three "no"s with the same reason is a product
finding worth more than one yes.

## After every meeting

Log within the hour:

| | |
|---|---|
| What they checked first in the report | |
| Their reaction to the misses | |
| Their reaction to the fabrication | |
| Is reviewing faster than writing? (their words) | |
| Conversion lift they estimated | |
| Outcome | paid / verbal / no |
| If no: what would have to be different | |

"Is reviewing faster than writing" is the line to watch across all five. If
several say no, the product concept in
[`../03-product-concept.md`](../03-product-concept.md) needs rethinking before
anything gets built — and that is a finding the sprint was designed to surface,
not a failure of the meeting.
