# Kiln

An HTML5 social app for eleven-to-fourteen-year-olds, built as the inverse of
the apps they actually use. No likes, no counts, no followers, no streaks, no
notifications, no recommendation model, no strangers, and a feed that ends
every day and says so.

The brief was an app that empowers Gen Alpha rather than preying on their
biology and psychology. Taking that seriously meant something harder than
removing the bad parts, because an app with the hooks removed is just a worse
app — nothing pulls you back, and nothing replaces what the pull was doing.
So Kiln is built on three legs, and it needs all three:

**Give them a tool, not a format.** The app opens on a blank canvas and a
question, not on other people's work. There are three real instruments — a
drawing tool, a writing box, and a step sequencer that makes sound out of
oscillators — and the only progress the app keeps is what your hands can do
with them. Getting better at something is the one durable reason to come back
that does not require manipulating anyone.

**Make the social part small and unrankable.** Eight people, no public, no
profiles, and no number attached to any human being anywhere in the app. A
response is a specific sentence about the work, seen only by the maker.

**Teach the mechanism.** The Watchtower tab is ten techniques — variable
reward, infinite scroll, streaks, public metrics, vague notifications,
autoplay, filter drift, engagement ranking, guilt-trip exits, quiet data
collection — each with a working demo that performs the technique on the
reader, and each followed by what Kiln does in its place. This is the part
that transfers. A child who has watched a streak counter take a hostage in a
sandbox will recognise the shape of it in an app that will never explain
itself.

No build step, no dependencies, no network. Open `index.html`.

```
Kiln/
  index.html          the page
  style.css           interface skin
  js/
    core.js           seeded RNG, the day, DOM helpers, localStorage
    content.js        prompts, crafts, praise, the circle, the ten techniques
    state.js          state shape, save migration, the day rollover
    charter.js        self-set limits, and why loosening one waits a day
    art.js            the stroke format, its renderer, and the peers' hands
    audio.js          four synthesised voices; nothing here can autoplay
    draw.js           the drawing tool
    write.js          the writing tool
    beat.js           the step sequencer
    card.js           how a made thing is shown, wherever it is shown
    peers.js          the simulated circle and their fixed dispositions
    make.js           the Studio
    feed.js           the Circle: a finite batch with visible ordering rules
    shelf.js          the Shelf: your work, and the craft ladders
    watchtower.js     the ten techniques and their live demos
    audit.js          settings, ranking rules, and the whole save file
    receipt.js        the attention receipt and the goodbye
    ui.js             tabs, modals, onboarding
    main.js           boot
  tools/
    build.mjs         inline everything into dist/kiln.html
    check.mjs         headless tests of the behavioural promises
```

## The decisions that carry the design

### The feed ends

The batch is everyone in your circle who made something that day. It is
assembled once, the order is written down, and it does not change again until
tomorrow — not when you reload, not when you come back in the evening. There
is no refresh gesture, because there is nothing to refresh; no "new posts"
pill; and nothing loads when you reach the bottom.

That single property does most of the work. Infinite scroll and pull-to-
refresh are not conveniences that happen to be sticky, they are a variable-
ratio reward schedule and a deleted stopping cue. You cannot pull a lever
that has no handle, and reaching the end of Kiln is a normal thing that
happens every day.

### There is no number attached to a person

Not a like count, not a follower count, not a view count, not a count of
responses — not shown to the reader, not shown to the maker, not stored. The
moment a count is visible to anyone but you, everything upstream of it bends
toward it, and everyone can rank everyone continuously without deciding to.
Adolescent brains are unusually sensitive to peer feedback, and a public like
count is that sensitivity with a dial on it, handed to strangers.

What a maker gets instead is a sentence about the work — "the ending", "I can
see the work in it", "nobody else did this" — from someone they know, seen by
nobody else. The vocabulary is deliberately specific, because "nice!" is noise
and "the turn at the end" is information you can build on.

`tools/check.mjs` greps the view layer for like/follower/view-count fields, so
this stays true.

### The shelf only goes up

There is no streak anywhere, and nothing decays. Come back after two months
and the app says so plainly: you were away, nothing was lost, here is your
work.

A streak is not a record of effort, it is a hostage. Its only real feature is
that it can be destroyed, and since losing hurts about twice as much as the
equivalent gain feels good, the longer you hold one the more leverage the app
has over you. Removing it does not make the app less motivating — it makes the
motivation yours, because what is left is the actual pile of things you made.

### Responses are a fact about people, not a lottery

The circle is simulated, which is a limitation turned into the most honest
feature in the app. How often a peer responds to your work is fixed: Nour
responds to everything, Basil to one piece in seven, forever, regardless of
what you make or how often you post. This is written down in the Audit tab in
those words, and it is tested.

If response rate were random, every post would be a lever pull and you would
learn — correctly — that posting more pays. Because it is a fixed property of
other people, you learn the true thing instead: how much someone responds is
about them, and the only thing you control is the work.

Responses also arrive the day *after* you share. Never in the same session.
There is nothing to sit and wait for.

### Limits you set, with one day of friction on the way out

You choose the session length and whether the circle stays shut until you
have made something. Then:

> Tightening a limit takes effect now. Loosening one takes effect tomorrow.

That asymmetry is the only thing that makes a self-set limit worth setting,
because a limit you can lift the second you want to lift it is not a limit.
The app never refuses you — it makes the decision yours-tomorrow instead of
yours-right-now, which is the difference between the sailor lashed to the mast
and the sailor who meant to be. The whole deal is stated during onboarding
before the first choice is made, because a commitment device you did not know
you were agreeing to is a dark pattern facing the other way.

Reaching your session length is not a lockout. A lockout teaches a fourteen-
year-old to defeat it and nothing else. Kiln tells you the time once, shows
you the tally, and gets out of the way; if you carry on it is recorded as a
choice you made, not a failure.

### Leaving is one tap and the app says goodbye

"Done for today" goes straight to an honest receipt: time here, things made,
things looked at. No "are you sure", no "your friends will miss you", nothing
waiting to be missed. Every attention-funded app measures this far more
precisely than Kiln does and shows it to advertisers instead of to you.

### The ordering rules are printed, with switches on them

Four rules in plain English in the Audit tab, each with a toggle, and every
card in the feed will tell you which one put it where it is. There is no
model, no engagement prediction, and nothing that learns what keeps you here.
Turn all four off and the circle arrives in the order it was made.

### Nothing leaves the device

No account, no email, no password, no analytics, no cookies, and no network
requests of any kind. The Audit tab shows you the entire save file, its size
in bytes, a copy button, and an erase button.

This is the one claim a README cannot keep, so `tools/build.mjs` enforces it:
if `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, a
dynamic import, a remote image, a CSS `@import`, or any absolute http(s) URL
appears in the bundle, the build fails and writes nothing. Turn the network
off and the whole app still works.

## The prompt

Everyone in the circle gets the same prompt each day, walked from a table by
date rather than rolled, so it is a fact about the day and not a surprise.

A shared constraint turns a feed from a competition into a comparison of
minds. It also removes the "what do I post" pressure that pushes children
toward the only subject always available to them, which is themselves. Not one
of the forty-eight prompts asks for a face, a body, a bedroom, or a
possession, and every one of them is answerable by someone who owns nothing.
There is no camera anywhere in this app.

## Practice, checked from the work

Each craft has four deliberate-practice constraints — three colours only, one
unbroken line, under forty words, no adjectives, four silent steps in a row.
They are read off the finished piece rather than announced as goals, so you
find out you did the hard thing after you did it, and nobody makes a
deliberately bad piece to farm a checkbox. Nobody but you is ever told.

## Building and testing

```
node tools/check.mjs      # headless tests: determinism, the charter, no decay
node tools/build.mjs      # -> dist/kiln.html, one self-contained file
```

`check.mjs` runs the non-DOM modules in a `vm` context and asserts the
behavioural promises directly: that the same day always yields the same batch,
that a piece always draws the same responses, that nothing responds on the day
you post, that work kept to yourself is never seen, that tightening applies
immediately and loosening waits exactly one day, that four hundred days away
costs nothing, and that no level or praise line contains a number. A design
promise with no test behind it is a slogan.

## The demo clock

Kiln is built around what happens across days, which is awkward to show in one
sitting. The Audit tab has a labelled demo control that moves the app's clock
forward so you can watch a day roll over, see responses arrive the following
morning, and see the "you were away" message. It is stored, visible, and
reversible, and it is the only thing in the app that touches time.
