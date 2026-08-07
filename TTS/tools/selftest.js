/* Headless self-test — no dependencies, no browser.
 *
 *   node tools/selftest.js            everything
 *   node tools/selftest.js --verbose  list every assertion, not just failures
 *
 * Two halves.
 *
 * The splitter is pure, so it is checked against fixtures directly: the
 * abbreviations and decimals that must not end a sentence, the blank lines
 * that must, the run-on that has to be chopped under the utterance limit, and
 * the invariant that the chunks still add up to exactly the input.
 *
 * The bench is checked by running the real probes — the same code the page
 * runs — against mock engines on a virtual clock. One of those mocks
 * reproduces the Android truncation bug, one makes pause() a no-op, one makes
 * pause() a stop, one never finishes an utterance, one ignores rate. A bench
 * that has only ever seen a working engine proves nothing, and the virtual
 * clock means a minute of simulated speech costs no wall time at all.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const VERBOSE = process.argv.includes('--verbose');
const ROOT = path.join(__dirname, '..');

// --- load the real modules ---------------------------------------------------

const sandbox = {
  window: {}, console, Math, Date, JSON, Promise, Object, Array, String, Number,
  Error, RegExp, parseInt, parseFloat, isNaN, navigator: { userAgent: 'selftest' }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const file of ['split.js', 'probes.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', file), 'utf8'), sandbox, { filename: file });
}

const SPLIT = sandbox.window.TTS.split;
const PROBES = sandbox.window.TTS.probes;

// --- assertions --------------------------------------------------------------

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    if (VERBOSE) console.log('  ok   ' + name);
  } else {
    failures.push(name + (detail ? '\n         ' + detail : ''));
    console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
  }
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, a === e ? '' : 'expected ' + e + '\n         got      ' + a);
}

function section(title) {
  console.log('\n' + title);
  console.log('-'.repeat(title.length));
}

// --- the splitter ------------------------------------------------------------

section('Segmentation');

function speech(text, opts) {
  return SPLIT.segment(text, opts).map(c => c.speech);
}

eq('three plain sentences',
  speech('One. Two! Three?'), ['One.', 'Two!', 'Three?']);

eq('an abbreviation does not end a sentence',
  speech('Dr. Chen arrived late. He apologised.'),
  ['Dr. Chen arrived late.', 'He apologised.']);

eq('a decimal does not end a sentence',
  speech('It cost 3.14 dollars. Really.'), ['It cost 3.14 dollars.', 'Really.']);

eq('initials do not end a sentence',
  speech('J. R. R. Tolkien wrote it. Twice.'), ['J. R. R. Tolkien wrote it.', 'Twice.']);

eq('a dotted abbreviation does not end a sentence',
  speech('See e.g. the manual. Then stop.'), ['See e.g. the manual.', 'Then stop.']);

eq('an ellipsis trailing into lowercase does not end a sentence',
  speech('Wait… no. Yes.'), ['Wait… no.', 'Yes.']);

eq('an ellipsis before a capital does end one',
  speech('He hesitated… Then he spoke.'), ['He hesitated…', 'Then he spoke.']);

eq('three dots behave like an ellipsis too',
  speech('Well... maybe. Fine.'), ['Well... maybe.', 'Fine.']);

eq('a closing quote stays with its sentence',
  speech('"Stop." He left.'), ['"Stop."', 'He left.']);

eq('multiple terminators stay together',
  speech('Really?! I had no idea.'), ['Really?!', 'I had no idea.']);

eq('a blank line ends a chunk',
  speech('First para.\n\nSecond para.'), ['First para.', 'Second para.']);

eq('a single newline does not — hard-wrapped text stays whole',
  speech('one two\nthree four. Next.'), ['one two\nthree four.', 'Next.']);

eq('whitespace only yields nothing', speech('   \n\n  '), []);
eq('empty string yields nothing', speech(''), []);
eq('a non-string yields nothing', speech(null), []);

eq('text with no terminator is still one chunk',
  speech('a heading with no full stop'), ['a heading with no full stop']);

eq('"no." ends a sentence when no number follows',
  speech('The answer is no. We tried.'), ['The answer is no.', 'We tried.']);

eq('"No." before a number does not',
  speech('See No. 5 below. Then stop.'), ['See No. 5 below.', 'Then stop.']);

// Chopping a run-on.
{
  const runOn = ('the quick brown fox jumps over the lazy dog and keeps on running, '
    + 'never pausing for breath or punctuation of any kind, ').repeat(30);
  const chunks = SPLIT.segment(runOn, { maxChars: 180 });

  check('a run-on is chopped into several chunks', chunks.length > 10, 'got ' + chunks.length);
  check('no chunk exceeds the utterance limit',
    chunks.every(c => c.end - c.start <= 180),
    'longest was ' + Math.max(...chunks.map(c => c.end - c.start)));
  check('chopping prefers a clause break',
    chunks.filter(c => /,\s*$/.test(c.text)).length > 5,
    'only ' + chunks.filter(c => /,\s*$/.test(c.text)).length + ' chunks ended on a comma');
}

// A single unbroken token longer than the limit must still be cut, not dropped.
{
  const wall = 'x'.repeat(500);
  const chunks = SPLIT.segment(wall, { maxChars: 180 });
  check('an unbreakable run is still cut', chunks.length === 3, 'got ' + chunks.length);
  check('the unbreakable run survives intact',
    chunks.map(c => c.text).join('') === wall);
}

// The invariant that keeps the reading pane honest.
{
  const cases = [
    'One. Two! Three?',
    '  leading space. and more.\n\n\nthen a gap.  ',
    'Dr. Chen arrived at 3.14. "Quite." He left.\n\nEnd.',
    ('a long clause that keeps going and going, ').repeat(40),
    'no terminator at all',
    'tabs\tand\r\ncrlf. Yes.\r\n\r\nNext.'
  ];
  let allExact = true;
  let allOrdered = true;
  for (const input of cases) {
    const chunks = SPLIT.segment(input, { maxChars: 120 });
    if (!chunks.length) continue;
    if (chunks.map(c => input.slice(c.start, c.end)).join('') !== input) allExact = false;
    if (chunks[0].start !== 0 || chunks[chunks.length - 1].end !== input.length) allOrdered = false;
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i].start !== chunks[i - 1].end) allOrdered = false;
      if (chunks[i].index !== i) allOrdered = false;
    }
  }
  check('chunks reproduce the source exactly', allExact);
  check('chunks partition the source with no gap or overlap', allOrdered);
}

// --- a virtual clock ---------------------------------------------------------

function makeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map();

  return {
    now: () => t,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: t + Math.max(0, ms || 0), fn, every: 0 });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, ms) {
      const id = ++seq;
      const period = Math.max(1, ms || 1);
      timers.set(id, { at: t + period, fn, every: period });
      return id;
    },
    clearInterval(id) { timers.delete(id); },
    pending: () => timers.size,
    advance() {
      let bestId = null;
      let best = null;
      for (const [id, timer] of timers) {
        if (!best || timer.at < best.at || (timer.at === best.at && id < bestId)) { best = timer; bestId = id; }
      }
      if (!best) return false;
      if (best.at > t) t = best.at;
      if (best.every) best.at = t + best.every;
      else timers.delete(bestId);
      best.fn();
      return true;
    }
  };
}

/* Run a promise to completion, driving the virtual clock forward whenever it
 * has nothing left to do. */
async function drain(clock, promise) {
  let settled = false;
  let value;
  let error;
  let threw = false;

  promise.then(v => { settled = true; value = v; }, e => { settled = true; threw = true; error = e; });

  let guard = 0;
  while (!settled) {
    await new Promise(r => setImmediate(r));   // flush microtasks
    if (settled) break;
    if (!clock.advance()) {
      await new Promise(r => setImmediate(r));
      if (!settled) throw new Error('probe stalled: nothing settled and no timers pending');
    }
    if (++guard > 2000000) throw new Error('runaway clock');
  }
  if (threw) throw error;
  return value;
}

// --- a mock speech engine ----------------------------------------------------

const VOICE = { name: 'Test Voice', lang: 'en-GB', localService: true, default: true, voiceURI: 'test:1' };

function makeSynth(clock, options) {
  const o = Object.assign({
    voices: [VOICE],
    voicesAfterMs: 0,      // >0: getVoices() is empty until then
    msPerChar: 60,
    startDelay: 80,
    cutoffMs: 0,           // >0: every utterance is truncated at this length
    supportsPause: true,   // false: pause() does nothing at all
    pauseStops: false,     // true: pause() ends the utterance
    boundaries: true,
    honorRate: true,
    hang: false            // true: an utterance starts and never ends
  }, options || {});

  let ready = !o.voicesAfterMs;
  const listeners = {};
  const queue = [];
  let active = null;

  if (o.voicesAfterMs) {
    clock.setTimeout(() => {
      ready = true;
      (listeners.voiceschanged || []).forEach(fn => fn({}));
    }, o.voicesAfterMs);
  }

  function clearActiveTimers() {
    if (!active) return;
    active.ids.forEach(id => clock.clearTimeout(id));
    active.ids = [];
  }

  function scheduleRest() {
    const a = active;
    if (!a) return;
    a.tickFrom = clock.now();

    if (o.boundaries) {
      for (let ms = 350; ms < a.remaining; ms += 350) {
        const charIndex = Math.min(a.u.text.length - 1, Math.floor(a.u.text.length * (ms / a.remaining)));
        a.ids.push(clock.setTimeout(() => {
          if (a.u.onboundary) a.u.onboundary({ charIndex, charLength: 5, name: 'word' });
        }, ms));
      }
    }

    if (o.hang) return;

    a.ids.push(clock.setTimeout(() => {
      const u = a.u;
      clearActiveTimers();
      active = null;
      synth.speaking = queue.length > 0;
      synth.paused = false;
      if (u.onend) u.onend({});
      startNext();
    }, a.remaining));
  }

  function startNext() {
    if (active || !queue.length) return;
    const u = queue.shift();
    const rate = o.honorRate ? (u.rate || 1) : 1;
    const full = Math.round(u.text.length * o.msPerChar / rate);
    const remaining = (o.cutoffMs && full > o.cutoffMs) ? o.cutoffMs : full;

    active = { u, ids: [], remaining, tickFrom: clock.now() };
    synth.speaking = true;
    synth.pending = queue.length > 0;

    active.ids.push(clock.setTimeout(() => {
      if (!active) return;
      if (active.u.onstart) active.u.onstart({});
      scheduleRest();
    }, o.startDelay));
  }

  const synth = {
    speaking: false,
    pending: false,
    paused: false,

    getVoices() { return ready ? o.voices.slice() : []; },

    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    removeEventListener(name, fn) {
      const a = listeners[name] || [];
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },

    speak(u) { queue.push(u); startNext(); },

    cancel() {
      clearActiveTimers();
      active = null;
      queue.length = 0;
      synth.speaking = false;
      synth.pending = false;
      synth.paused = false;
    },

    pause() {
      if (!active) return;
      if (o.pauseStops) {
        const u = active.u;
        clearActiveTimers();
        active = null;
        synth.speaking = false;
        if (u.onend) u.onend({});
        return;
      }
      if (!o.supportsPause) return;          // the Android no-op
      const elapsed = clock.now() - active.tickFrom;
      active.remaining = Math.max(0, active.remaining - elapsed);
      clearActiveTimers();
      synth.paused = true;
    },

    resume() {
      if (!active || !synth.paused) return;
      synth.paused = false;
      scheduleRest();
    }
  };

  return synth;
}

function makeUtteranceClass() {
  return function Utterance(text) {
    this.text = String(text);
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
    this.onboundary = null;
  };
}

/* Run a named subset of the real probes against a mock engine. */
async function runProbes(ids, options) {
  const clock = makeClock();
  const synth = makeSynth(clock, options);

  const ctx = {
    synth,
    Utterance: makeUtteranceClass(),
    voice: null,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    shouldAbort: () => false,
    state: {}
  };

  const results = {};
  for (const id of ids) {
    const probe = PROBES.PROBES.filter(p => p.id === id)[0];
    if (!probe) throw new Error('no such probe: ' + id);
    results[id] = await drain(clock, Promise.resolve().then(() => probe.run(ctx)));
  }
  return { results, clock, ctx };
}

function statusOf(results, id) { return results[id] ? results[id].status : '(missing)'; }

// --- the bench, against engines that work ------------------------------------

(async function main() {
  section('Bench — a healthy engine');
  {
    const ids = ['api', 'voices', 'basic', 'cutoff', 'boundary', 'pauseresume', 'cancel', 'rate', 'queue'];
    const { results } = await runProbes(ids, {});
    for (const id of ids) {
      check('probe "' + id + '" passes', statusOf(results, id) === 'pass',
        'got ' + statusOf(results, id) + ' — ' + (results[id] && results[id].measured));
    }
    check('the healthy engine reports usable capabilities',
      PROBES.capsFrom(results).boundary === true
      && PROBES.capsFrom(results).nativePause === true
      && PROBES.capsFrom(results).truncates === false);
  }

  section('Bench — voices that arrive late');
  {
    const { results } = await runProbes(['voices'], { voicesAfterMs: 1200 });
    check('a delayed voice list is still found', statusOf(results, 'voices') === 'pass',
      'got ' + statusOf(results, 'voices'));
    check('the delay is reported', /asynchronously/.test(results.voices.note),
      results.voices.note);
  }

  section('Bench — no voices at all');
  {
    const { results } = await runProbes(['voices'], { voices: [] });
    check('an empty voice list fails', statusOf(results, 'voices') === 'fail',
      'got ' + statusOf(results, 'voices'));
  }

  section('Bench — network-only voices');
  {
    const netVoice = Object.assign({}, VOICE, { localService: false });
    const { results } = await runProbes(['voices'], { voices: [netVoice] });
    check('network-only voices warn', statusOf(results, 'voices') === 'warn',
      'got ' + statusOf(results, 'voices'));
    check('the warning mentions working offline', /offline/.test(results.voices.note),
      results.voices.note);
  }

  // --- the bug the whole reader is built around ------------------------------

  section('Bench — the Android truncation bug');
  {
    const { results } = await runProbes(['basic', 'cutoff'], { cutoffMs: 15000 });
    check('a truncating engine is caught', statusOf(results, 'cutoff') === 'fail',
      'got ' + statusOf(results, 'cutoff') + ' — ' + results.cutoff.measured);
    check('the report names the cause', /truncation/.test(results.cutoff.note),
      results.cutoff.note);
    check('the short phrase still passes on the same engine',
      statusOf(results, 'basic') === 'pass');
    check('caps record the truncation', PROBES.capsFrom(results).truncates === true);
  }

  section('Bench — an engine that ends long speech early for another reason');
  {
    // Cut far below the fifteen-second signature: still wrong, but not that bug.
    const { results } = await runProbes(['basic', 'cutoff'], { cutoffMs: 4000 });
    check('an early ending warns rather than misattributing the cause',
      statusOf(results, 'cutoff') === 'warn',
      'got ' + statusOf(results, 'cutoff') + ' — ' + results.cutoff.measured);
  }

  section('Bench — pause() that does nothing');
  {
    const { results } = await runProbes(['pauseresume'], { supportsPause: false });
    check('a no-op pause is caught', statusOf(results, 'pauseresume') === 'fail',
      'got ' + statusOf(results, 'pauseresume') + ' — ' + results.pauseresume.measured);
    check('the report says pause had no effect', /no effect/.test(results.pauseresume.note),
      results.pauseresume.note);
    check('caps withhold native pause', PROBES.capsFrom(results).nativePause === false);
  }

  section('Bench — pause() that stops instead');
  {
    const { results } = await runProbes(['pauseresume'], { pauseStops: true });
    check('a stopping pause is caught', statusOf(results, 'pauseresume') === 'fail',
      'got ' + statusOf(results, 'pauseresume') + ' — ' + results.pauseresume.measured);
    check('the report distinguishes it from a no-op',
      /instead of holding it/.test(results.pauseresume.note), results.pauseresume.note);
  }

  section('Bench — no word boundary events');
  {
    const { results } = await runProbes(['boundary'], { boundaries: false });
    check('missing boundary events warn', statusOf(results, 'boundary') === 'warn',
      'got ' + statusOf(results, 'boundary'));
    check('the report explains the fallback',
      /whole sentences/.test(results.boundary.note), results.boundary.note);
    check('caps withhold word highlighting', PROBES.capsFrom(results).boundary === false);
  }

  section('Bench — an engine that ignores rate');
  {
    const { results } = await runProbes(['rate'], { honorRate: false });
    check('an ignored rate is caught', statusOf(results, 'rate') === 'fail',
      'got ' + statusOf(results, 'rate') + ' — ' + results.rate.measured);
  }

  section('Bench — an engine that never finishes');
  {
    const { results } = await runProbes(['basic'], { hang: true });
    check('a wedged engine fails instead of hanging', statusOf(results, 'basic') === 'fail',
      'got ' + statusOf(results, 'basic') + ' — ' + results.basic.measured);
    check('the report says speech is wedged', /wedged/.test(results.basic.note),
      results.basic.note);
  }

  section('Bench — a missing API');
  {
    const clock = makeClock();
    const ctx = {
      synth: null, Utterance: null, now: clock.now,
      setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
      setInterval: clock.setInterval, clearInterval: clock.clearInterval,
      state: {}
    };
    const probe = PROBES.PROBES.filter(p => p.id === 'api')[0];
    const result = await drain(clock, Promise.resolve().then(() => probe.run(ctx)));
    check('a browser without speechSynthesis fails cleanly', result.status === 'fail', result.measured);
  }

  section('Bench — the runner');
  {
    const clock = makeClock();
    const synth = makeSynth(clock, {});
    const ctx = {
      synth, Utterance: makeUtteranceClass(), now: clock.now,
      setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
      setInterval: clock.setInterval, clearInterval: clock.clearInterval,
      shouldAbort: () => false, state: {}
    };
    const out = await drain(clock, PROBES.runAll(ctx, { quick: true }));
    const ran = Object.keys(out.results);

    check('a quick run skips the slow probes',
      ran.indexOf('cutoff') < 0 && ran.indexOf('pauseresume') < 0 && ran.indexOf('rate') < 0,
      'ran ' + ran.join(', '));
    check('a quick run still covers the fast probes', ran.length === 6, 'ran ' + ran.join(', '));
    check('every quick probe passed on a healthy engine',
      ran.every(id => out.results[id].status === 'pass'));
  }

  section('Bench — aborting');
  {
    const clock = makeClock();
    const synth = makeSynth(clock, {});
    let calls = 0;
    const ctx = {
      synth, Utterance: makeUtteranceClass(), now: clock.now,
      setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
      setInterval: clock.setInterval, clearInterval: clock.clearInterval,
      shouldAbort: () => (++calls > 2), state: {}
    };
    const out = await drain(clock, PROBES.runAll(ctx, { quick: true }));
    const skipped = Object.keys(out.results).filter(id => out.results[id].status === 'skip');
    check('an abort stops the remaining probes', skipped.length >= 2, 'skipped ' + skipped.join(', '));
  }

  // --- done ------------------------------------------------------------------

  console.log('\n' + '='.repeat(52));
  if (failures.length) {
    console.log(passed + ' passed, ' + failures.length + ' failed   <<< ATTENTION');
    failures.forEach(f => console.log('  · ' + f));
    process.exit(1);
  }
  console.log(passed + ' passed, 0 failed');
})().catch(err => {
  console.error('\nself-test crashed:\n' + (err && err.stack || err));
  process.exit(1);
});
