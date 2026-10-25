/* The Voices tab — the roster, and the bench that measures it.
 *
 * The roster answers "which voice should I use", and the one fact that matters
 * most there is whether a voice is on-device, because a network voice fails
 * with the network off and stalls on a bad connection.
 *
 * The bench answers "can I trust this engine". It runs the probes in
 * js/probes.js against the live speechSynthesis and writes what it learns into
 * the capability flags the reader reads back.
 */
(function (window) {
  'use strict';

  var D = document;
  function $(id) { return D.getElementById(id); }

  var VERDICT = { pass: 'pass', warn: 'warn', fail: 'fail', skip: 'skip' };

  function init(app) {
    var list = $('voice-list');
    var filter = $('voice-filter');
    var report = $('report');
    var summary = $('bench-summary');
    var btnQuick = $('btn-quick');
    var btnFull = $('btn-full');
    var btnAbort = $('btn-abort');
    var btnCopy = $('btn-copy');

    var running = false;
    var aborted = false;
    var lastRun = null;

    // --- roster ------------------------------------------------------------

    function renderVoices() {
      var voices = app.voices;
      var q = (filter.value || '').trim().toLowerCase();
      list.textContent = '';

      if (!voices.length) {
        var li = D.createElement('li');
        li.className = 'voice';
        li.textContent = 'No voices reported yet. On Android this usually means no speech engine is enabled in system settings.';
        list.appendChild(li);
        return;
      }

      var shown = 0;
      for (var i = 0; i < voices.length; i++) {
        var v = voices[i];
        if (q && (v.name + ' ' + v.lang).toLowerCase().indexOf(q) < 0) continue;
        shown++;
        list.appendChild(voiceRow(v));
      }

      if (!shown) {
        var none = D.createElement('li');
        none.className = 'voice';
        none.textContent = 'No voice matches "' + filter.value + '".';
        list.appendChild(none);
      }
    }

    function voiceRow(v) {
      var li = D.createElement('li');
      li.className = 'voice' + (app.settings.voiceURI === v.voiceURI ? ' is-chosen' : '');

      var id = D.createElement('div');
      id.className = 'voice-id';
      var name = D.createElement('b');
      name.textContent = v.name;
      id.appendChild(name);

      var meta = D.createElement('div');
      meta.className = 'voice-meta';

      var lang = D.createElement('span');
      lang.className = 'chip';
      lang.textContent = v.lang || '??';
      meta.appendChild(lang);

      var pill = D.createElement('span');
      pill.className = 'pill ' + (v.localService ? 'local' : 'net');
      pill.textContent = v.localService ? 'on device' : 'network';
      meta.appendChild(pill);

      if (v['default']) {
        var def = D.createElement('span');
        def.textContent = 'system default';
        meta.appendChild(def);
      }

      id.appendChild(meta);
      li.appendChild(id);

      var act = D.createElement('div');
      act.className = 'voice-act';

      var hear = D.createElement('button');
      hear.className = 'mini';
      hear.type = 'button';
      hear.textContent = 'Hear';
      hear.addEventListener('click', function () { sample(v); });
      act.appendChild(hear);

      var use = D.createElement('button');
      use.className = 'mini';
      use.type = 'button';
      use.textContent = 'Use';
      use.addEventListener('click', function () {
        app.settings.voiceURI = v.voiceURI;
        app.saveSettings();
        app.syncVoiceSelect();
        renderVoices();
        app.toast(v.name + ' is now the reading voice.');
      });
      act.appendChild(use);

      li.appendChild(act);
      return li;
    }

    function sample(v) {
      if (!app.synth) return;
      try {
        app.synth.cancel();
        var u = new app.Utterance('This is ' + v.name + ', reading at your current settings.');
        u.voice = v;
        u.rate = app.settings.rate;
        u.pitch = app.settings.pitch;
        u.volume = app.settings.volume;
        u.onerror = function () { app.toast('That voice could not speak.'); };
        app.synth.speak(u);
      } catch (e) {
        app.toast('That voice could not speak.');
      }
    }

    // --- the bench ---------------------------------------------------------

    function probeRow(probe, result) {
      var li = D.createElement('li');
      li.className = 'probe ' + (result ? (VERDICT[result.status] || 'skip') : 'running');
      li.id = 'probe-' + probe.id;

      var head = D.createElement('div');
      head.className = 'probe-head';
      var b = D.createElement('b');
      b.textContent = probe.name;
      head.appendChild(b);
      var verdict = D.createElement('span');
      verdict.className = 'verdict';
      verdict.textContent = result ? result.status : 'running';
      head.appendChild(verdict);
      li.appendChild(head);

      var measured = D.createElement('div');
      measured.className = 'measured';
      measured.textContent = result ? result.measured : 'speaking…';
      li.appendChild(measured);

      var p = D.createElement('p');
      p.textContent = result ? result.note : probe.why;
      li.appendChild(p);

      return li;
    }

    function setBusy(on) {
      running = on;
      btnQuick.disabled = on;
      btnFull.disabled = on;
      btnAbort.hidden = !on;
      btnCopy.hidden = on || !lastRun;
    }

    function run(quick) {
      if (running) return;
      if (!app.synth) { app.toast('This browser has no speech synthesis.'); return; }

      aborted = false;
      setBusy(true);
      report.textContent = '';
      summary.hidden = true;

      var ctx = {
        synth: app.synth,
        Utterance: app.Utterance,
        voice: app.currentVoice(),
        now: function () { return Date.now(); },
        setTimeout: function (fn, ms) { return window.setTimeout(fn, ms); },
        clearTimeout: function (id) { return window.clearTimeout(id); },
        setInterval: function (fn, ms) { return window.setInterval(fn, ms); },
        clearInterval: function (id) { return window.clearInterval(id); },
        shouldAbort: function () { return aborted; },
        state: {}
      };

      window.TTS.probes.runAll(ctx, {
        quick: !!quick,
        onProgress: function (ev) {
          var existing = $('probe-' + ev.probe.id);
          var row = probeRow(ev.probe, ev.phase === 'done' ? ev.result : null);
          if (existing) report.replaceChild(row, existing);
          else report.appendChild(row);
        }
      }).then(function (out) {
        lastRun = { out: out, quick: !!quick, at: new Date() };
        app.setCaps(out.caps);
        setBusy(false);
        btnCopy.hidden = false;
        showSummary(out, quick);
        if (ctx.state.voices && ctx.state.voices.length) app.refreshVoices();
      });
    }

    function showSummary(out, quick) {
      var counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
      var ids = Object.keys(out.results);
      for (var i = 0; i < ids.length; i++) {
        var st = out.results[ids[i]].status;
        counts[st] = (counts[st] || 0) + 1;
      }

      var lines = [
        counts.pass + ' passed, ' + counts.warn + ' warned, ' + counts.fail + ' failed'
        + (counts.skip ? ', ' + counts.skip + ' skipped' : '') + '.'
      ];

      lines.push(out.caps.truncates
        ? 'This device truncates long utterances, which is exactly what the sentence-by-sentence reader is built for — reading is unaffected.'
        : 'No truncation found on this device.');

      lines.push(out.caps.boundary
        ? 'Word-level highlighting is on, and pausing resumes from the exact word.'
        : 'No word boundary events, so the reader highlights whole sentences and resumes from the start of one.');

      lines.push(out.caps.nativePause
        ? 'Native pause works, so pausing holds the sentence where it is.'
        : 'Native pause is unreliable here, so pausing stops and the sentence is re-spoken on resume.');

      if (quick) lines.push('This was the quick run — the truncation, pause and rate probes were skipped.');

      summary.textContent = lines.join(' ');
      summary.hidden = false;
    }

    // --- the copyable report ------------------------------------------------

    function reportText() {
      if (!lastRun) return '';
      var out = lastRun.out;
      var v = app.currentVoice();
      var lines = [];

      lines.push('Aloud voice bench — ' + lastRun.at.toISOString());
      lines.push('run: ' + (lastRun.quick ? 'quick' : 'full'));
      lines.push('ua: ' + (navigator.userAgent || 'unknown'));
      lines.push('voice: ' + (v ? v.name + ' (' + v.lang + ', ' + (v.localService ? 'on-device' : 'network') + ')' : 'engine default'));
      lines.push('voices: ' + app.voices.length + ' total');
      lines.push('');

      for (var i = 0; i < out.probes.length; i++) {
        var p = out.probes[i];
        var r = out.results[p.id];
        if (!r) continue;
        lines.push(pad(r.status.toUpperCase(), 5) + ' ' + p.name);
        lines.push('      ' + r.measured);
        lines.push('      ' + r.note);
        lines.push('');
      }

      lines.push('caps: boundary=' + out.caps.boundary + ' nativePause=' + out.caps.nativePause + ' truncates=' + out.caps.truncates);
      return lines.join('\n');
    }

    function pad(s, n) { while (s.length < n) s += ' '; return s; }

    function copyReport() {
      var text = reportText();
      if (!text) return;

      function fallback() {
        var el = D.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', 'readonly');
        el.style.position = 'fixed';
        el.style.opacity = '0';
        D.body.appendChild(el);
        el.select();
        var okay = false;
        try { okay = D.execCommand('copy'); } catch (e) { okay = false; }
        D.body.removeChild(el);
        app.toast(okay ? 'Report copied.' : 'Copy failed — select the text by hand.');
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { app.toast('Report copied.'); },
          fallback
        );
      } else {
        fallback();
      }
    }

    // --- wiring ------------------------------------------------------------

    filter.addEventListener('input', renderVoices);
    btnQuick.addEventListener('click', function () { run(true); });
    btnFull.addEventListener('click', function () { run(false); });
    btnCopy.addEventListener('click', copyReport);

    btnAbort.addEventListener('click', function () {
      aborted = true;
      try { app.synth.cancel(); } catch (e) { /* nothing queued */ }
      app.toast('Stopping after the current probe.');
    });

    btnCopy.hidden = true;
    btnAbort.hidden = true;

    return { renderVoices: renderVoices, reportText: reportText };
  }

  window.TTS = window.TTS || {};
  window.TTS.bench = { init: init };
})(typeof window !== 'undefined' ? window : this);
