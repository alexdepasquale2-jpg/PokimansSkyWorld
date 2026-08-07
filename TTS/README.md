# Aloud

A text-to-speech reader for the phone, and a bench that measures what your
device's speech engine actually does.

One self-contained HTML file. No dependencies, no build step to *use* it, no
network. Once the page has loaded it works with the radio off, because the
voices are the ones already installed on the device and the text never leaves
it.

```
TTS/
  index.html          the page
  style.css           interface skin
  js/
    split.js          text -> speakable chunks, with source offsets
    probes.js         the nine bench probes, against an injected engine
    engine.js         playback — chunk queue, seeking, pause, wake lock
    reader.js         the Read tab
    bench.js          the Voices tab
    app.js            settings, storage, tabs, bootstrap
  tools/
    selftest.js       headless harness — splitter fixtures, probes vs mocks
    pagecheck.mjs     loads the built page in Chromium and drives it
    build.mjs         inline everything into one file
  dist/
    aloud.html        single-file build, openable from disk
    artifact.html     the same page as a body fragment, for a hosted artifact
```

## Running it

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000     # then http://localhost:8000/TTS/
```

`dist/aloud.html` is the whole thing inlined into one file — mail it to
yourself, drop it in cloud storage, or add it to the home screen and it behaves
like an app. Rebuild both outputs with:

```sh
node tools/build.mjs
```

Text, position and settings are kept in `localStorage`, so closing the tab does
not lose your place.

## Why there is a bench

The reader is easy. The reason this is two tools is that mobile speech engines
are broken in ways you cannot detect by asking them: `speechSynthesis` is always
present, every method exists, and every one of them returns without complaint.
You have to speak something and time it.

Six failures matter enough to design around:

1. **Android Chrome truncates a single utterance at about fifteen seconds.**
   Nothing errors. The voice simply stops.
2. **`getVoices()` returns an empty array on the first call**, and the
   `voiceschanged` event that is supposed to fix that does not fire on every
   engine.
3. **`pause()` is unreliable.** On some Android builds it does nothing at all;
   on others it ends the utterance instead of holding it.
4. **`onboundary` does not fire** on many Android engines or on iOS, so
   word-level position is not something you can count on.
5. **iOS requires the first `speak()` to come from a user gesture.**
6. **Backgrounding the tab or letting the screen sleep kills speech**, and the
   queue can wedge such that every later utterance silently does nothing.

### What the reader does about them

Nothing is ever spoken as one long utterance. Text is split into sentences —
and any sentence past the length limit is split again at a clause break — and
fed through one at a time. That is the truncation workaround, and it is also
what gives the reader a unit to seek to and a unit to highlight, so it costs
nothing.

Beyond that: `cancel()` before every `speak()` to clear a wedged queue; a
generation token on every callback, because a cancelled utterance still fires
`onend` in Chrome and that stale event would otherwise skip a sentence; a
watchdog that re-issues an utterance Chrome accepted and never started; a screen
wake lock while playing; and a resume on `visibilitychange` for the speech
Android killed in the background.

Pause is the one place the bench changes behaviour rather than just reporting
it. Where the probes prove native pause works, pausing holds the sentence where
it is. Where they do not, pausing cancels and remembers the position, and resume
re-speaks from there — from the exact word if boundary events exist, from the
start of the sentence if they do not. The interface says which of those is in
force rather than pretending the distinction is not there.

### The probes

Nine, in order, because `basic` establishes the speaking-rate baseline that
`cutoff` measures against.

| Probe | What it measures |
|---|---|
| Speech API present | `speechSynthesis` and `SpeechSynthesisUtterance` exist |
| Voice list loads | count, on-device vs network, and whether it arrived asynchronously |
| Speaks a short phrase | start latency, and characters per second at rate 1 |
| Long utterance survives | actual vs predicted duration — catches the fifteen-second cut |
| Word boundary events | whether `onboundary` fires with a usable `charIndex` |
| Pause and resume | whether `pause()` holds, does nothing, or stops |
| Cancel clears the queue | and whether anything can still be spoken afterwards |
| Rate is honoured | 0.6× against 1.8×, because some engines accept a rate and ignore it |
| Utterances queue in order | three short ones, finishing one, two, three |

The full run takes about a minute and speaks aloud the whole time; the quick run
skips the three slow ones. **Copy report** puts a plain-text version, including
the user-agent string, on the clipboard.

## The reading pane

The pane renders one span per chunk, and the chunks partition the source
exactly — joining their slices reproduces what you pasted, whitespace and all.
So the text on screen is your text, not a reconstruction of it, and tapping any
sentence seeks to it.

Sentence splitting knows that `Dr. Chen`, `3.14`, `J. R. R. Tolkien`, `e.g.` and
`No. 5` do not end sentences, and that `The answer is no.` does. An ellipsis
trailing into a lowercase word is a pause inside a sentence rather than the end
of one, so `Wait… no.` is one breath. A blank line always ends a chunk; a single
newline does not, because plain text is often hard-wrapped and splitting every
wrapped line would turn prose into a stutter.

## Testing

```sh
node tools/selftest.js            # 61 assertions, no browser, no dependencies
node tools/selftest.js --verbose  # list every assertion, not just failures
node tools/build.mjs
node tools/pagecheck.mjs          # load and drive the built page in Chromium
```

`selftest.js` checks the two pure halves. The splitter runs against fixtures —
the abbreviations and decimals that must not end a sentence, the blank lines
that must, the run-on that has to be chopped under the utterance limit, and the
invariant that the chunks still add up to exactly the input.

The bench is checked by running **the real probes** against mock engines on a
virtual clock. One mock reproduces the Android truncation, one makes `pause()` a
no-op, one makes it a stop, one never finishes an utterance, one ignores rate,
one has no voices, one delivers its voice list late. The tests assert that each
mock earns the verdict it deserves — that the bench genuinely *detects* these
bugs rather than merely claiming to. The virtual clock means a minute of
simulated speech costs no wall time, so the whole suite runs in about a second.

`pagecheck.mjs` drives the Chromium binary directly — no Playwright, no
`node_modules` — loads `dist/aloud.html`, fails on any console error, then
appends a script that operates the interface and reports back: typed text
reaching the pane as three chunks, the pane matching the source exactly,
tap-to-seek, the tab switch, the settings sheet, and clearing.

**What none of this proves.** Headless Chromium reports zero voices, so the
harness verifies segmentation, probe logic, wiring and a clean boot — never that
anything is audible. Actual speech can only be confirmed on a real device, which
is what the bench is for once you have the page open on one.

## Controls

| | |
|---|---|
| tap a sentence | start reading there |
| `space` | play / pause |
| `←` `→` | previous / next sentence |
| `esc` | stop |

Mid-sentence, "previous" means the start of the current sentence — the same
thing a person means when they say it.
