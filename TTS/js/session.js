/* The Session tab — where a development record becomes something to listen to.
 *
 * Four ways in, in order of how little they ask of you:
 *
 *   baked    a narration.json compiled into the page at build time
 *   bridge   tools/bridge.py on this machine or over the LAN, polled live
 *   file     open a narration.json by hand
 *   paste    drop the JSON in
 *
 * The bridge is the live one. The page cannot read a session transcript off
 * disk and cannot call GitHub from a file:// origin, so the connection runs
 * the other way: a small local server watches the transcript, runs the suites
 * on request, and hands over beats. When it is running, this tab follows a
 * session as it happens.
 */
(function (window) {
  'use strict';

  var D = document;
  function $(id) { return D.getElementById(id); }

  var POLL_MS = 4000;

  function init(app) {
    var sourceLine = $('sess-source');
    var modeRow = $('sess-modes');
    var summary = $('sess-summary');
    var preview = $('sess-preview');
    var caveat = $('sess-caveat');
    var bridgeInput = $('sess-bridge');
    var followBox = $('sess-follow');
    var fileInput = $('sess-file');
    var pasteBox = $('sess-paste');

    var script = null;
    var currentMode = null;
    var pollTimer = null;
    var lastSignature = '';

    // --- loading -----------------------------------------------------------

    function adopt(parsed, whence) {
      script = parsed;
      sourceLine.textContent = whence;
      currentMode = script.order[0];
      renderModes();
      selectMode(currentMode);
    }

    function tryAdopt(raw, whence) {
      try {
        adopt(window.TTS.narrate.parseScript(raw), whence);
        app.toast('Loaded ' + Object.keys(script.modes).length + ' mode(s).');
        return true;
      } catch (e) {
        app.toast(e.message);
        return false;
      }
    }

    function loadBaked() {
      if (window.TTS.NARRATION) {
        tryAdopt(window.TTS.NARRATION, 'built into this page');
        return true;
      }
      return false;
    }

    // --- the bridge --------------------------------------------------------

    function bridgeBase() {
      var v = (bridgeInput.value || '').trim().replace(/\/+$/, '');
      return v || '';
    }

    function fetchBridge(path) {
      var base = bridgeBase();
      if (!base) return Promise.reject(new Error('No bridge address.'));
      if (!window.fetch) return Promise.reject(new Error('This browser has no fetch.'));
      return window.fetch(base + path, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('The bridge answered ' + r.status + '.');
        return r.json();
      });
    }

    function connect(quiet) {
      return fetchBridge('/api/narration').then(function (data) {
        var signature = JSON.stringify(data && data.generated) + ':' + beatTotal(data);
        if (signature === lastSignature) return false;
        lastSignature = signature;
        var was = currentMode;
        adopt(window.TTS.narrate.parseScript(data), 'live from ' + bridgeBase());
        if (was && script.modes[was]) selectMode(was);
        if (!quiet) app.toast('Connected to the bridge.');
        return true;
      }, function (err) {
        if (!quiet) app.toast(err.message + ' Is tools/bridge.py running?');
        return false;
      });
    }

    function beatTotal(data) {
      if (!data || !data.modes) return 0;
      var n = 0;
      for (var k in data.modes) if (data.modes[k] && data.modes[k].beats) n += data.modes[k].beats.length;
      return n;
    }

    function setFollowing(on) {
      if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
      if (!on) return;
      pollTimer = setInterval(function () {
        connect(true).then(function (changed) {
          if (changed) app.toast('The session moved on — narration refreshed.');
        });
      }, POLL_MS);
    }

    // --- rendering ---------------------------------------------------------

    function renderModes() {
      modeRow.textContent = '';
      if (!script) return;

      for (var i = 0; i < script.order.length; i++) {
        (function (name) {
          var mode = script.modes[name];
          var b = D.createElement('button');
          b.type = 'button';
          b.className = 'btn';
          b.setAttribute('aria-pressed', String(name === currentMode));
          b.textContent = mode.label + ' (' + mode.beats.length + ')';
          b.addEventListener('click', function () { selectMode(name); });
          modeRow.appendChild(b);
        })(script.order[i]);
      }
    }

    function selectMode(name) {
      if (!script || !script.modes[name]) return;
      currentMode = name;
      renderModes();

      var mode = script.modes[name];
      var tally = window.TTS.narrate.counts(mode);
      var bits = [];
      for (var k in tally) bits.push(tally[k] + ' ' + window.TTS.narrate.kindOf(k).label.toLowerCase());

      var src = mode.source || {};
      var where = src.kind === 'session' ? ('session ' + (src.file || '')) :
        src.kind === 'git' ? ('git, branch ' + (src.branch || '?')) :
        src.kind === 'test' ? ('a test run at ' + (src.at || '').slice(0, 19).replace('T', ' ')) : (src.kind || 'unknown');

      summary.textContent = mode.beats.length + ' beats — ' + bits.join(', ') + '. From ' + where + '.';

      caveat.textContent = mode.caveat || '';
      caveat.hidden = !mode.caveat;

      preview.textContent = '';
      var upto = Math.min(mode.beats.length, 40);
      for (var i = 0; i < upto; i++) preview.appendChild(previewRow(mode.beats[i]));
      if (mode.beats.length > upto) {
        var more = D.createElement('li');
        more.className = 'beat more';
        more.textContent = '…and ' + (mode.beats.length - upto) + ' more.';
        preview.appendChild(more);
      }
    }

    function previewRow(b) {
      var li = D.createElement('li');
      li.className = 'beat beat-' + b.kind + ' tone-' + b.tone;

      var head = D.createElement('div');
      head.className = 'beat-head';

      var kind = D.createElement('b');
      kind.textContent = window.TTS.narrate.kindOf(b.kind).label;
      head.appendChild(kind);

      if (b.inferred) {
        var tag = D.createElement('i');
        tag.textContent = 'reconstructed';
        head.appendChild(tag);
      }
      if (b.at) {
        var at = D.createElement('em');
        at.textContent = b.at;
        head.appendChild(at);
      }
      li.appendChild(head);

      var p = D.createElement('p');
      p.textContent = b.text;
      li.appendChild(p);
      return li;
    }

    // --- wiring ------------------------------------------------------------

    $('sess-connect').addEventListener('click', function () {
      connect(false);
      app.saveBridge(bridgeInput.value);
    });

    followBox.addEventListener('change', function () {
      setFollowing(followBox.checked);
      if (followBox.checked) connect(true);
    });

    $('sess-run-tests').addEventListener('click', function () {
      app.toast('Asking the bridge to run the suites…');
      fetchBridge('/api/run-tests').then(function () {
        return connect(true);
      }).then(function () {
        if (script && script.modes.test) selectMode('test');
        app.toast('Test run finished.');
      }, function (err) {
        app.toast(err.message + ' Is tools/bridge.py running?');
      });
    });

    $('sess-play').addEventListener('click', function () {
      if (!script || !currentMode) { app.toast('Load a narration first.'); return; }
      var n = app.reader().loadNarration(script.modes[currentMode]);
      app.setTab('read');
      app.reader().play(0);
      app.toast('Reading ' + script.modes[currentMode].label.toLowerCase() + ' — ' + n + ' sentences.');
    });

    $('sess-load-file').addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { tryAdopt(String(fr.result || ''), f.name); };
      fr.onerror = function () { app.toast('That file could not be read.'); };
      fr.readAsText(f);
      fileInput.value = '';
    });

    $('sess-use-paste').addEventListener('click', function () {
      var raw = (pasteBox.value || '').trim();
      if (!raw) { app.toast('Nothing pasted.'); return; }
      if (tryAdopt(raw, 'pasted')) pasteBox.value = '';
    });

    $('sess-download').addEventListener('click', function () {
      if (!script || !currentMode) { app.toast('Load a narration first.'); return; }
      var mode = script.modes[currentMode];
      var text = window.TTS.narrate.flatten(mode, { announce: false }).text;

      // The page may have been granted a save; if not, fall back to a blob.
      var name = 'aloud-' + currentMode + '.txt';
      if (window.claude && window.claude.downloads) {
        window.claude.downloads.save({ filename: name, data: text }).then(function () {
          app.toast('Saved.');
        }, function (err) {
          if (err && err.code === 'declined') return;
          blobSave(name, text);
        });
        return;
      }
      blobSave(name, text);
    });

    function blobSave(name, text) {
      try {
        var url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        var a = D.createElement('a');
        a.href = url;
        a.download = name;
        D.body.appendChild(a);
        a.click();
        D.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        app.toast('Downloaded ' + name + '.');
      } catch (e) {
        app.toast('This browser would not save the file.');
      }
    }

    // --- go ----------------------------------------------------------------

    bridgeInput.value = app.savedBridge();

    if (!loadBaked()) {
      sourceLine.textContent = 'nothing loaded yet';
      summary.textContent = 'Run "node tools/monologue.mjs all" to build one, or start tools/bridge.py and connect.';
    }

    return {
      refresh: function () { if (script && currentMode) selectMode(currentMode); },
      hasScript: function () { return !!script; }
    };
  }

  window.TTS = window.TTS || {};
  window.TTS.session = { init: init };
})(typeof window !== 'undefined' ? window : this);
