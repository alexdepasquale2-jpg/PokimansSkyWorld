/* The Read tab — source drawer, reading pane, transport.
 *
 * The pane renders one span per chunk covering the whole source string, so the
 * text on screen is the text you pasted, whitespace and all. Tapping a span
 * seeks to it. The current chunk gets a band; where the bench found boundary
 * events, the word inside it gets a marker too.
 */
(function (window) {
  'use strict';

  var D = document;
  function $(id) { return D.getElementById(id); }

  var SAMPLE = [
    'Aloud reads text out with the voices already on your device. Nothing is uploaded, ' +
    'and nothing is downloaded — once this page has loaded it works with the network off.',
    '',
    'The hard part is not the reading. It is that mobile speech engines misbehave in ways ' +
    'you cannot detect by asking them. Dr. Chen at approx. 3.14 in the afternoon is one ' +
    'sentence, not four, and this reader knows that. A passage longer than about fifteen ' +
    'seconds is silently cut off by Android Chrome, so nothing here is ever spoken as one ' +
    'long utterance; it is broken into sentences and fed through one at a time.',
    '',
    'Open the Voices tab and run the bench to find out what your device actually does. ' +
    'Then come back, pick a voice that works offline, and press play.'
  ].join('\n');

  function init(app) {
    var pane = $('pane');
    var ta = $('text');
    var fileInput = $('file');
    var counter = $('counter');
    var progress = $('progress-fill');

    var btnPlay = $('t-play');
    var btnPrev = $('t-prev');
    var btnNext = $('t-next');
    var btnStop = $('t-stop');

    var chunks = [];
    var spans = [];
    var current = -1;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var engine = window.TTS.engine.create({
      synth: app.synth,
      Utterance: app.Utterance,
      caps: app.caps,
      settings: function () {
        var s = app.settings;
        return { voice: app.currentVoice(), rate: s.rate, pitch: s.pitch, volume: s.volume };
      },
      emit: onEngine
    });

    // --- rendering ---------------------------------------------------------

    function renderPane() {
      pane.textContent = '';
      spans = [];
      current = -1;

      if (!chunks.length) {
        var empty = D.createElement('div');
        empty.className = 'pane-empty';
        empty.textContent = 'Nothing to read yet. Paste some text above, or load a .txt file.';
        pane.appendChild(empty);
        return;
      }

      var frag = D.createDocumentFragment();
      for (var i = 0; i < chunks.length; i++) {
        var s = D.createElement('span');
        s.className = 'chunk';
        s.setAttribute('data-i', String(i));
        s.textContent = chunks[i].text;
        frag.appendChild(s);
        spans.push(s);
      }
      pane.appendChild(frag);
    }

    function plainChunk(i) {
      if (spans[i]) spans[i].textContent = chunks[i].text;
    }

    function setCurrent(i) {
      if (i === current) return;
      if (spans[current]) {
        spans[current].classList.remove('is-current');
        plainChunk(current);
      }
      current = i;
      var el = spans[i];
      if (!el) return;
      el.classList.add('is-current');
      if (el.scrollIntoView) {
        el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }

    /* charIndex counts into chunk.speech; the span shows chunk.text, which may
     * carry leading whitespace. Shift by that much or the marker drifts. */
    function markWord(i, charIndex, length) {
      var el = spans[i];
      var chunk = chunks[i];
      if (!el || !chunk) return;

      var lead = chunk.text.length - chunk.text.replace(/^\s+/, '').length;
      var start = lead + charIndex;
      if (start >= chunk.text.length) return;

      var end;
      if (length && length > 0) {
        end = start + length;
      } else {
        end = start;
        while (end < chunk.text.length && !/\s/.test(chunk.text.charAt(end))) end++;
      }
      if (end <= start) return;

      el.textContent = '';
      el.appendChild(D.createTextNode(chunk.text.slice(0, start)));
      var w = D.createElement('span');
      w.className = 'word';
      w.textContent = chunk.text.slice(start, end);
      el.appendChild(w);
      el.appendChild(D.createTextNode(chunk.text.slice(end)));
    }

    var PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
    var PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z"/></svg>';

    function paintTransport() {
      var live = engine.playing && !engine.paused;
      btnPlay.innerHTML = live ? PAUSE_ICON : PLAY_ICON;
      btnPlay.setAttribute('aria-label', live ? 'Pause' : 'Play');
      btnPlay.classList.toggle('is-live', live);

      var has = chunks.length > 0;
      btnPlay.disabled = !has;
      btnPrev.disabled = !has;
      btnNext.disabled = !has;
      btnStop.disabled = !engine.playing;

      var at = has ? engine.index + 1 : 0;
      counter.innerHTML = '';
      var b = D.createElement('b');
      b.textContent = has ? at + ' / ' + chunks.length : '—';
      counter.appendChild(b);
      counter.appendChild(D.createTextNode(has ? 'sentences' : 'no text'));

      progress.style.width = has ? Math.round(at / chunks.length * 100) + '%' : '0%';
    }

    // --- engine events -----------------------------------------------------

    function onEngine(kind, data) {
      if (kind === 'chunk') {
        setCurrent(data.index);
        paintTransport();
      } else if (kind === 'word') {
        if (app.caps.boundary) markWord(data.index, data.charIndex, data.length);
      } else if (kind === 'state') {
        paintTransport();
        app.saveProgress(engine.index);
      } else if (kind === 'done') {
        if (spans[current]) { spans[current].classList.remove('is-current'); plainChunk(current); }
        current = -1;
        paintTransport();
      } else if (kind === 'error') {
        app.toast(data.message);
        paintTransport();
      }
    }

    // --- text --------------------------------------------------------------

    var saveTimer = null;

    function setText(text, opts) {
      chunks = window.TTS.split.segment(text, { maxChars: app.settings.maxChars });
      engine.setChunks(chunks);
      renderPane();

      var resume = opts && opts.resumeAt;
      if (resume && resume > 0 && resume < chunks.length) {
        engine.index = resume;
        setCurrent(resume);
      }
      paintTransport();
    }

    function textChanged() {
      setText(ta.value);
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { app.saveText(ta.value); }, 400);
    }

    // --- wiring ------------------------------------------------------------

    ta.addEventListener('input', textChanged);

    $('btn-sample').addEventListener('click', function () {
      ta.value = SAMPLE;
      textChanged();
      app.toast('Sample text loaded.');
    });

    $('btn-clear').addEventListener('click', function () {
      engine.stop();
      ta.value = '';
      textChanged();
    });

    $('btn-file').addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        ta.value = String(fr.result || '');
        textChanged();
        app.toast('Loaded ' + f.name + '.');
      };
      fr.onerror = function () { app.toast('That file could not be read.'); };
      fr.readAsText(f);
      fileInput.value = '';
    });

    pane.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== pane && !el.classList.contains('chunk')) el = el.parentNode;
      if (!el || el === pane) return;
      var i = parseInt(el.getAttribute('data-i'), 10);
      if (isNaN(i)) return;
      engine.seek(i);
      if (!engine.playing) engine.play(i);
    });

    btnPlay.addEventListener('click', function () { engine.toggle(); });
    btnPrev.addEventListener('click', function () { engine.prev(); });
    btnNext.addEventListener('click', function () { engine.next(); });
    btnStop.addEventListener('click', function () { engine.stop(); });

    D.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
      if (app.activeTab() !== 'read') return;

      if (e.key === ' ') { e.preventDefault(); engine.toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); engine.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); engine.prev(); }
      else if (e.key === 'Escape') { engine.stop(); }
    });

    D.addEventListener('visibilitychange', function () {
      if (!D.hidden) engine.onVisible();
    });

    window.addEventListener('pagehide', function () { engine.stop(); });

    // Restore whatever was open last time.
    var saved = app.savedText();
    if (saved) {
      ta.value = saved;
      setText(saved, { resumeAt: app.savedProgress() });
    } else {
      setText('');
    }

    return {
      engine: engine,
      resegment: function () { setText(ta.value, { resumeAt: engine.index }); },
      stop: function () { engine.stop(); }
    };
  }

  window.TTS = window.TTS || {};
  window.TTS.reader = { init: init, SAMPLE: SAMPLE };
})(typeof window !== 'undefined' ? window : this);
