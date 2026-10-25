/* The voice bench — nine probes against a speech engine.
 *
 * Mobile speech engines are quietly broken in ways that matter to a reader,
 * and none of it is discoverable from feature detection: the API is present
 * and every method exists. You have to speak something and time it.
 *
 * So these probes measure. They take the engine by injection — `ctx.synth`,
 * `ctx.Utterance`, and the clock and timers as `ctx.now` / `ctx.setTimeout` —
 * which is what lets tools/selftest.js run this exact code against mock
 * engines on a virtual clock, including an engine that reproduces the Android
 * truncation bug. A bench that has never been shown a broken engine is not
 * evidence of anything.
 *
 * Probe order matters: `basic` establishes the speaking-rate baseline that
 * `cutoff` measures against, so the list is a sequence, not a set.
 */
(function (window) {
  'use strict';

  var SHORT = 'The quick brown fox jumps over the lazy dog.';
  var MEDIUM = 'Speech runs on a clock the page does not control, so the only honest way to test it is to speak and measure.';

  /* Roughly where Android Chrome cuts a long utterance off. */
  var ANDROID_CUTOFF_MS = 15000;
  var CUTOFF_LOW = 12000;
  var CUTOFF_HIGH = 18500;

  function longText(minChars) {
    var s = '';
    var i = 1;
    while (s.length < minChars) {
      s += 'This is sentence number ' + i + ' of a deliberately long passage, written to run past the point where a mobile speech engine gives up on a single utterance. ';
      i++;
    }
    return s.slice(0, minChars);
  }

  function sleep(ctx, ms) {
    return new Promise(function (resolve) { ctx.setTimeout(resolve, ms); });
  }

  /* Resolves true as soon as pred() holds, false if it never does in time. */
  function waitUntil(ctx, pred, ms) {
    return new Promise(function (resolve) {
      var deadline = ctx.now() + ms;
      (function tick() {
        if (pred()) { resolve(true); return; }
        if (ctx.now() >= deadline) { resolve(false); return; }
        ctx.setTimeout(tick, 100);
      })();
    });
  }

  /* A bare utterance whose lifecycle we watch by hand, for the probes that
   * have to interrupt it. Using trial() for those is a race: pause() ending
   * the utterance resolves the trial before the follow-up checks can run. */
  function watched(ctx, text, rate) {
    var w = { started: false, ended: false, error: null, startAt: 0, endAt: 0, u: null, threw: null };
    try {
      w.u = new ctx.Utterance(text);
    } catch (err) {
      w.threw = String((err && err.message) || err);
      return w;
    }
    if (ctx.voice) w.u.voice = ctx.voice;
    w.u.rate = rate || 1;
    w.u.volume = 1;
    w.u.onstart = function () { w.started = true; w.startAt = ctx.now(); };
    w.u.onend = function () { w.ended = true; w.endAt = ctx.now(); };
    w.u.onerror = function (e) {
      w.error = (e && (e.error || e.name)) || 'error';
      w.ended = true;
      w.endAt = ctx.now();
    };
    try {
      ctx.synth.cancel();
      ctx.synth.speak(w.u);
    } catch (err2) {
      w.threw = String((err2 && err2.message) || err2);
    }
    return w;
  }

  /* Speak once and report what happened. Never rejects. */
  function trial(ctx, opts) {
    return new Promise(function (resolve) {
      var res = {
        started: false, ended: false, error: null, why: '',
        startAt: 0, endAt: 0, t0: ctx.now(),
        boundaries: 0, lastCharIndex: -1
      };
      var done = false;
      var timer = null;

      function finish(why) {
        if (done) return;
        done = true;
        res.why = why;
        res.endAt = ctx.now();
        res.speakMs = res.started ? (res.endAt - res.startAt) : (res.endAt - res.t0);
        res.startMs = res.started ? (res.startAt - res.t0) : -1;
        if (timer !== null) ctx.clearTimeout(timer);
        resolve(res);
      }
      res.finish = finish;

      var u;
      try {
        u = new ctx.Utterance(opts.text);
      } catch (err) {
        res.error = String((err && err.message) || err);
        finish('throw');
        return;
      }

      if (ctx.voice) u.voice = ctx.voice;
      u.rate = opts.rate || 1;
      u.pitch = opts.pitch || 1;
      u.volume = opts.volume == null ? 1 : opts.volume;

      u.onstart = function () {
        res.started = true;
        res.startAt = ctx.now();
        if (opts.onStart) opts.onStart(res);
      };
      u.onboundary = function (e) {
        res.boundaries++;
        if (e && typeof e.charIndex === 'number' && e.charIndex >= 0) res.lastCharIndex = e.charIndex;
      };
      u.onend = function () { res.ended = true; finish('end'); };
      u.onerror = function (e) {
        res.error = (e && (e.error || e.name)) || 'error';
        finish('error');
      };

      timer = ctx.setTimeout(function () { finish('timeout'); }, opts.timeout || 10000);

      try {
        ctx.synth.cancel();
        ctx.synth.speak(u);
      } catch (err2) {
        res.error = String((err2 && err2.message) || err2);
        finish('throw');
      }
    });
  }

  /* getVoices() is empty on the first call in Chrome. The spec says listen for
   * voiceschanged; some engines never fire it, so poll as well. */
  function waitForVoices(ctx, ms) {
    return new Promise(function (resolve) {
      var done = false, poll = null, timer = null;

      function current() {
        try { return ctx.synth.getVoices() || []; } catch (e) { return []; }
      }
      function finish() {
        if (done) return;
        done = true;
        if (poll !== null) ctx.clearInterval(poll);
        if (timer !== null) ctx.clearTimeout(timer);
        try {
          if (ctx.synth.removeEventListener) ctx.synth.removeEventListener('voiceschanged', check);
        } catch (e) { /* engine without EventTarget */ }
        resolve(current());
      }
      function check() { if (current().length) finish(); }

      try {
        if (ctx.synth.addEventListener) ctx.synth.addEventListener('voiceschanged', check);
      } catch (e) { /* ditto */ }

      poll = ctx.setInterval(check, 150);
      timer = ctx.setTimeout(finish, ms || 4000);
      check();
    });
  }

  function ok(measured, note) { return { status: 'pass', measured: measured, note: note }; }
  function warn(measured, note) { return { status: 'warn', measured: measured, note: note }; }
  function bad(measured, note) { return { status: 'fail', measured: measured, note: note }; }
  function skip(measured, note) { return { status: 'skip', measured: measured, note: note }; }

  function secs(ms) { return (ms / 1000).toFixed(1) + 's'; }

  var PROBES = [
    {
      id: 'api',
      name: 'Speech API present',
      why: 'Everything else depends on it.',
      slow: false,
      run: function (ctx) {
        if (!ctx.synth || typeof ctx.synth.speak !== 'function') {
          return Promise.resolve(bad('absent', 'This browser exposes no speechSynthesis. The reader cannot work here.'));
        }
        if (typeof ctx.Utterance !== 'function') {
          return Promise.resolve(bad('no SpeechSynthesisUtterance', 'The constructor is missing, so nothing can be queued.'));
        }
        return Promise.resolve(ok('available', 'speechSynthesis and SpeechSynthesisUtterance both exist.'));
      }
    },

    {
      id: 'voices',
      name: 'Voice list loads',
      why: 'getVoices() is empty on the first call in Chrome.',
      slow: false,
      run: function (ctx) {
        var t0 = ctx.now();
        var immediate = [];
        try { immediate = ctx.synth.getVoices() || []; } catch (e) { immediate = []; }

        var after = immediate.length ? Promise.resolve(immediate) : waitForVoices(ctx, 4000);

        return after.then(function (voices) {
          var waited = ctx.now() - t0;
          ctx.state.voices = voices;

          if (!voices.length) {
            return bad('0 voices', 'The engine reports no voices at all. On Android this usually means no speech engine is installed or enabled in system settings.');
          }

          var local = 0;
          for (var i = 0; i < voices.length; i++) if (voices[i].localService) local++;
          var measured = voices.length + ' voices, ' + local + ' on-device';
          var how = immediate.length
            ? 'available on the first call'
            : 'arrived asynchronously after ' + secs(waited);

          if (!local) {
            return warn(measured, 'Every voice is a network voice — ' + how + '. Speech will fail offline and stall on a poor connection.');
          }
          return ok(measured, 'Voice list ' + how + '. ' + local + ' work offline.');
        });
      }
    },

    {
      id: 'basic',
      name: 'Speaks a short phrase',
      why: 'Establishes the speaking-rate baseline the cutoff probe measures against.',
      slow: false,
      run: function (ctx) {
        return trial(ctx, { text: SHORT, timeout: 12000 }).then(function (r) {
          if (r.why === 'timeout') {
            return bad('no response in 12s', 'The engine accepted the utterance and never reported starting or finishing. Speech is wedged.');
          }
          if (r.error) return bad('error: ' + r.error, 'The engine refused the utterance.');
          if (!r.started) return warn('ended without onstart, ' + secs(r.speakMs), 'The utterance completed but never fired onstart, so progress cannot be tracked precisely.');

          ctx.state.baseline = { chars: SHORT.length, ms: r.speakMs };
          return ok(secs(r.speakMs) + ' for ' + SHORT.length + ' chars, ' + r.startMs + 'ms to start',
            'Normal speech works. Roughly ' + Math.round(SHORT.length / (r.speakMs / 1000)) + ' characters per second at rate 1.');
        });
      }
    },

    {
      id: 'cutoff',
      name: 'Long utterance survives',
      why: 'Android Chrome truncates a single utterance at about fifteen seconds.',
      slow: true,
      run: function (ctx) {
        var base = ctx.state.baseline;
        if (!base) return Promise.resolve(skip('no baseline', 'The short-phrase probe did not produce a timing baseline, so there is nothing to compare against.'));

        var msPerChar = base.ms / base.chars;
        if (!(msPerChar > 0)) return Promise.resolve(skip('no usable baseline', 'The baseline measured zero speaking time, so nothing can be predicted from it.'));

        // Size the passage to land just past the cutoff — long enough to
        // provoke the bug, short enough that a healthy engine still finishes
        // inside a tolerable wait.
        var target = 24000;
        var chars = Math.min(6000, Math.max(600, Math.ceil(target / msPerChar)));
        var text = longText(chars);
        var predicted = Math.round(text.length * msPerChar);

        if (predicted < CUTOFF_HIGH) {
          return Promise.resolve(skip('longest passage predicts only ' + secs(predicted),
            'This engine speaks fast enough that even a long passage finishes before the cutoff would bite, so the bug cannot be provoked here.'));
        }

        var budget = Math.min(Math.round(predicted * 1.8), 75000);
        return trial(ctx, { text: text, timeout: budget }).then(function (r) {
          var m = secs(r.speakMs) + ' vs ~' + secs(predicted) + ' expected';

          if (r.why === 'timeout') {
            return warn(m, 'The utterance ran past its budget without ending. Not a truncation, but the engine is not reporting completion.');
          }
          if (r.error) return bad('error after ' + secs(r.speakMs), 'The engine errored partway through a long utterance: ' + r.error + '.');

          if (r.speakMs >= predicted * 0.75) {
            return ok(m, 'A long utterance ran to completion. Chunking is not strictly required here, though the reader still chunks for seeking and highlighting.');
          }
          if (r.speakMs >= CUTOFF_LOW && r.speakMs <= CUTOFF_HIGH) {
            return bad(m, 'Cut off at about ' + secs(ANDROID_CUTOFF_MS) + ' — the Android truncation bug. The reader works around it by speaking one sentence at a time, so reading is unaffected.');
          }
          return warn(m, 'The utterance ended well before it should have. Something is interrupting long speech on this device.');
        });
      }
    },

    {
      id: 'boundary',
      name: 'Word boundary events',
      why: 'Decides whether word-level highlighting and mid-sentence resume are possible.',
      slow: false,
      run: function (ctx) {
        return trial(ctx, { text: MEDIUM, timeout: 20000 }).then(function (r) {
          if (r.error || r.why === 'timeout') {
            return skip('inconclusive', 'The utterance did not complete cleanly, so boundary support could not be judged.');
          }
          if (!r.boundaries) {
            return warn('none fired', 'No onboundary events. Common on Android and iOS. The reader highlights whole sentences instead of words, and resumes from the start of a sentence rather than mid-word.');
          }
          if (r.lastCharIndex < 0) {
            return warn(r.boundaries + ' events, no charIndex', 'Boundary events fire but carry no usable position, so they cannot drive a highlight.');
          }
          return ok(r.boundaries + ' events, last charIndex ' + r.lastCharIndex,
            'Word-level highlighting is available, and pausing can resume from the exact word.');
        });
      }
    },

    {
      id: 'pauseresume',
      name: 'Pause and resume',
      why: 'pause() often behaves as stop on Android.',
      slow: true,
      run: function (ctx) {
        var w = watched(ctx, longText(600), 1);
        if (w.threw) return Promise.resolve(bad('threw', 'The engine refused the utterance: ' + w.threw + '.'));

        var pausedFlag = false;
        var stoppedWhilePaused = false;

        return sleep(ctx, 1400).then(function () {
          if (!w.started) return 'never-started';
          if (w.ended) return 'ended-early';

          try { ctx.synth.pause(); } catch (e) { /* judged by the flag below */ }

          return sleep(ctx, 700).then(function () {
            try { pausedFlag = !!ctx.synth.paused; } catch (e) { pausedFlag = false; }
            stoppedWhilePaused = w.ended;

            try { ctx.synth.resume(); } catch (e2) { /* judged below */ }

            if (stoppedWhilePaused) return 'stopped';
            if (!pausedFlag) return 'no-effect';

            return waitUntil(ctx, function () { return w.ended; }, 60000)
              .then(function (finished) { return finished ? 'resumed' : 'stalled'; });
          });
        }).then(function (verdict) {
          try { ctx.synth.cancel(); } catch (e) { /* nothing queued */ }

          if (verdict === 'never-started') return skip('never started', 'The utterance did not start, so pause could not be tested.');
          if (verdict === 'ended-early') return skip('finished too soon', 'The test utterance was over before pause could be tried.');

          if (verdict === 'stopped') {
            return bad('stopped while paused', 'pause() ended the utterance instead of holding it — the usual Android behaviour. The reader treats pause as stop-and-remember and re-speaks the sentence on resume.');
          }
          if (verdict === 'no-effect') {
            return bad('paused flag stayed false', 'pause() had no effect at all. The reader cancels and remembers the position instead.');
          }
          if (verdict === 'stalled') {
            return bad('never resumed', 'After pause() the utterance never finished, so resume() did not restart it.');
          }
          if (w.error) return bad('error: ' + w.error, 'The engine errored across a pause/resume cycle.');

          return ok('held and resumed, total ' + secs(w.endAt - w.startAt),
            'Native pause and resume work, so the reader pauses mid-sentence and continues from exactly there.');
        });
      }
    },

    {
      id: 'cancel',
      name: 'Cancel clears the queue',
      why: 'A wedged queue makes every later utterance silently do nothing.',
      slow: false,
      run: function (ctx) {
        var w = watched(ctx, longText(500), 1);
        if (w.threw) return Promise.resolve(bad('threw', 'The engine refused the utterance: ' + w.threw + '.'));

        var stillSpeaking = false;

        return sleep(ctx, 900).then(function () {
          try { ctx.synth.cancel(); } catch (e) { /* judged below */ }
          return sleep(ctx, 400);
        }).then(function () {
          try { stillSpeaking = !!ctx.synth.speaking; } catch (e) { stillSpeaking = false; }
          // The question that actually matters: can anything be spoken after?
          return trial(ctx, { text: SHORT, timeout: 12000 });
        }).then(function (r2) {
          if (stillSpeaking) {
            return bad('still speaking after cancel', 'cancel() did not stop the engine, so stopping the reader may not stop the voice.');
          }
          if (!r2.started || r2.error || r2.why === 'timeout') {
            return bad('queue wedged', 'Nothing could be spoken after a cancel. On this device the reader may need a page reload to recover.');
          }
          return ok('cleared, next utterance spoke', 'cancel() stops the engine cleanly and leaves it able to speak again.');
        });
      }
    },

    {
      id: 'rate',
      name: 'Rate is honoured',
      why: 'Some engines accept a rate and ignore it.',
      slow: true,
      run: function (ctx) {
        return trial(ctx, { text: MEDIUM, rate: 0.6, timeout: 40000 }).then(function (slow) {
          if (!slow.started || slow.error) return skip('inconclusive', 'The slow pass did not complete.');
          return trial(ctx, { text: MEDIUM, rate: 1.8, timeout: 30000 }).then(function (fast) {
            if (!fast.started || fast.error) return skip('inconclusive', 'The fast pass did not complete.');

            var ratio = fast.speakMs > 0 ? slow.speakMs / fast.speakMs : 0;
            var m = secs(slow.speakMs) + ' at 0.6× vs ' + secs(fast.speakMs) + ' at 1.8× (' + ratio.toFixed(2) + '×)';

            if (ratio >= 1.35) return ok(m, 'The rate slider does what it says.');
            if (ratio >= 1.1) return warn(m, 'Rate has some effect but far less than requested. Expect the slider to feel weak.');
            return bad(m, 'The engine ignores rate. The slider will appear to do nothing on this voice — try a different one.');
          });
        });
      }
    },

    {
      id: 'queue',
      name: 'Utterances queue in order',
      why: 'The reader relies on one utterance following another.',
      slow: false,
      run: function (ctx) {
        return new Promise(function (resolve) {
          var order = [];
          var done = false;
          var words = ['one', 'two', 'three'];
          var timer = null;

          function finish() {
            if (done) return;
            done = true;
            if (timer !== null) ctx.clearTimeout(timer);
            try { ctx.synth.cancel(); } catch (e) { /* nothing to clean */ }

            if (order.length < 3) {
              resolve(bad('only ' + order.length + ' of 3 finished', 'Queued utterances were dropped. The reader re-issues each sentence itself, so this is survivable, but the engine is unreliable.'));
              return;
            }
            if (order.join(',') !== 'one,two,three') {
              resolve(bad('finished as ' + order.join(', '), 'Utterances completed out of order, so sentences would be read out of sequence.'));
              return;
            }
            resolve(ok('one, two, three in order', 'The engine queues correctly.'));
          }

          try { ctx.synth.cancel(); } catch (e) { /* nothing to clean */ }

          for (var i = 0; i < words.length; i++) {
            (function (word) {
              var u = new ctx.Utterance(word);
              if (ctx.voice) u.voice = ctx.voice;
              u.onend = function () {
                order.push(word);
                if (order.length === 3) finish();
              };
              u.onerror = function () { finish(); };
              ctx.synth.speak(u);
            })(words[i]);
          }

          timer = ctx.setTimeout(finish, 20000);
        });
      }
    }
  ];

  /* What the reader needs to know about this device. */
  function capsFrom(results) {
    function statusOf(id) { return results[id] && results[id].status; }
    return {
      boundary: statusOf('boundary') === 'pass',
      nativePause: statusOf('pauseresume') === 'pass',
      truncates: statusOf('cutoff') === 'fail',
      at: Date.now()
    };
  }

  /* Run the probes in order. `opts.quick` skips the slow ones. */
  function runAll(ctx, opts) {
    opts = opts || {};
    ctx.state = ctx.state || {};

    var list = PROBES.filter(function (p) { return opts.quick ? !p.slow : true; });
    var results = {};
    var chain = Promise.resolve();

    list.forEach(function (probe, i) {
      chain = chain.then(function () {
        if (ctx.shouldAbort && ctx.shouldAbort()) {
          results[probe.id] = skip('aborted', 'The run was stopped before this probe.');
          return null;
        }
        if (opts.onProgress) opts.onProgress({ probe: probe, index: i, total: list.length, phase: 'start' });

        return probe.run(ctx).then(function (r) {
          results[probe.id] = r;
          if (opts.onProgress) opts.onProgress({ probe: probe, index: i, total: list.length, phase: 'done', result: r });
        }, function (err) {
          results[probe.id] = bad('threw', 'The probe itself failed: ' + String((err && err.message) || err));
          if (opts.onProgress) opts.onProgress({ probe: probe, index: i, total: list.length, phase: 'done', result: results[probe.id] });
        });
      });
    });

    return chain.then(function () {
      try { ctx.synth.cancel(); } catch (e) { /* engine already gone */ }
      return { results: results, caps: capsFrom(results), probes: list };
    });
  }

  window.TTS = window.TTS || {};
  window.TTS.probes = {
    PROBES: PROBES,
    runAll: runAll,
    capsFrom: capsFrom,
    waitForVoices: waitForVoices,
    sleep: sleep,
    waitUntil: waitUntil,
    longText: longText,
    ANDROID_CUTOFF_MS: ANDROID_CUTOFF_MS
  };
})(typeof window !== 'undefined' ? window : this);
