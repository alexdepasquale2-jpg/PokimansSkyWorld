/* Bootstrap — settings, storage, tabs, the settings sheet, and the glue that
 * lets the bench tell the reader what this device can actually do.
 *
 * localStorage throws rather than degrades in some private-browsing modes, so
 * every access here is wrapped. Losing your settings is a nuisance; a blank
 * page because a getter threw is not acceptable.
 */
(function (window) {
  'use strict';

  var D = document;
  function $(id) { return D.getElementById(id); }

  var KEY = {
    settings: 'aloud.settings',
    caps: 'aloud.caps',
    text: 'aloud.text',
    progress: 'aloud.progress'
  };

  var DEFAULTS = {
    voiceURI: '',
    rate: 1,
    pitch: 1,
    volume: 1,
    maxChars: 180,
    readSize: 19,
    theme: 'auto'
  };

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* full or blocked */ }
  }

  function boot() {
    var synth = window.speechSynthesis || null;
    var Utterance = window.SpeechSynthesisUtterance || null;

    var settings = Object.assign({}, DEFAULTS, read(KEY.settings, {}));
    var caps = Object.assign({ boundary: false, nativePause: false, truncates: false }, read(KEY.caps, {}));

    var app = {
      synth: synth,
      Utterance: Utterance,
      settings: settings,
      caps: caps,
      voices: [],

      saveSettings: function () { write(KEY.settings, app.settings); },
      savedText: function () { return read(KEY.text, ''); },
      saveText: function (t) { write(KEY.text, t); write(KEY.progress, 0); },
      savedProgress: function () { return read(KEY.progress, 0) | 0; },
      saveProgress: function (i) { write(KEY.progress, i | 0); },

      currentVoice: function () {
        if (!app.settings.voiceURI) return null;
        for (var i = 0; i < app.voices.length; i++) {
          if (app.voices[i].voiceURI === app.settings.voiceURI) return app.voices[i];
        }
        return null;
      },

      setCaps: function (next) {
        app.caps = Object.assign({}, app.caps, next);
        write(KEY.caps, app.caps);
        if (reader) reader.engine.setCaps(app.caps);
        paintCaps();
      },

      activeTab: function () { return tab; },
      toast: toast,
      refreshVoices: refreshVoices,
      syncVoiceSelect: syncVoiceSelect
    };

    // --- toast -------------------------------------------------------------

    var toastEl = $('toast');
    var toastTimer = null;

    function toast(message) {
      toastEl.textContent = message;
      toastEl.classList.add('show');
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
    }

    // --- theme -------------------------------------------------------------

    function applyTheme() {
      var t = app.settings.theme;
      if (t === 'auto') D.documentElement.removeAttribute('data-theme');
      else D.documentElement.setAttribute('data-theme', t);

      var buttons = D.querySelectorAll('[data-theme-choice]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-theme-choice') === t));
      }
    }

    // --- tabs --------------------------------------------------------------

    var tab = 'read';

    function setTab(name) {
      tab = name;
      var buttons = D.querySelectorAll('.tabs button');
      for (var i = 0; i < buttons.length; i++) {
        var on = buttons[i].getAttribute('data-tab') === name;
        buttons[i].setAttribute('aria-selected', String(on));
      }
      $('tab-read').hidden = name !== 'read';
      $('tab-voices').hidden = name !== 'voices';
      $('transport').hidden = name !== 'read';
      if (name === 'voices' && bench) bench.renderVoices();
    }

    // --- settings sheet ----------------------------------------------------

    var sheet = $('sheet');
    var scrim = $('scrim');

    function openSheet() { sheet.classList.add('open'); scrim.classList.add('open'); }
    function closeSheet() { sheet.classList.remove('open'); scrim.classList.remove('open'); }

    // --- voices ------------------------------------------------------------

    var voiceSelect = $('set-voice');

    function refreshVoices() {
      var list = [];
      try { list = (synth && synth.getVoices()) || []; } catch (e) { list = []; }

      // Group by language, on-device first — the distinction that decides
      // whether a voice works with the network off.
      list = list.slice().sort(function (a, b) {
        if (!!b.localService !== !!a.localService) return b.localService ? 1 : -1;
        if (a.lang !== b.lang) return a.lang < b.lang ? -1 : 1;
        return a.name < b.name ? -1 : 1;
      });

      app.voices = list;
      syncVoiceSelect();
      if (bench) bench.renderVoices();
    }

    function syncVoiceSelect() {
      voiceSelect.textContent = '';

      var auto = D.createElement('option');
      auto.value = '';
      auto.textContent = 'Engine default';
      voiceSelect.appendChild(auto);

      for (var i = 0; i < app.voices.length; i++) {
        var v = app.voices[i];
        var opt = D.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = v.name + ' — ' + v.lang + (v.localService ? '' : ' (network)');
        voiceSelect.appendChild(opt);
      }
      voiceSelect.value = app.settings.voiceURI || '';
    }

    // --- capability line ---------------------------------------------------

    function paintCaps() {
      var el = $('caps-line');
      if (!el) return;

      if (!app.caps.at) {
        el.innerHTML = '<b>The bench has not run on this device.</b> Until it does, the reader assumes pause is unreliable and re-speaks the current sentence when you resume. Open the Voices tab and run it once.';
        return;
      }

      var bits = [];
      bits.push(app.caps.boundary ? 'word highlighting on' : 'sentence highlighting only');
      bits.push(app.caps.nativePause ? 'pause holds the sentence' : 'pause restarts the sentence');
      if (app.caps.truncates) bits.push('long utterances truncate, so text is read sentence by sentence');
      el.innerHTML = '<b>Measured on this device:</b> ' + bits.join(', ') + '.';
    }

    // --- settings controls -------------------------------------------------

    function bindRange(id, key, format, after) {
      var input = $(id);
      var label = $(id + '-val');
      input.value = String(app.settings[key]);
      label.textContent = format(app.settings[key]);

      input.addEventListener('input', function () {
        app.settings[key] = parseFloat(input.value);
        label.textContent = format(app.settings[key]);
        app.saveSettings();
        if (after) after();
      });
    }

    // --- go ----------------------------------------------------------------

    var reader = null;
    var bench = null;

    if (!synth || !Utterance) {
      $('no-speech').hidden = false;
    }

    reader = window.TTS.reader.init(app);
    bench = window.TTS.bench.init(app);

    var tabButtons = D.querySelectorAll('.tabs button');
    for (var i = 0; i < tabButtons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () { setTab(btn.getAttribute('data-tab')); });
      })(tabButtons[i]);
    }

    $('btn-settings').addEventListener('click', openSheet);
    $('btn-sheet-close').addEventListener('click', closeSheet);
    scrim.addEventListener('click', closeSheet);

    voiceSelect.addEventListener('change', function () {
      app.settings.voiceURI = voiceSelect.value;
      app.saveSettings();
      if (bench) bench.renderVoices();
    });

    bindRange('set-rate', 'rate', function (v) { return v.toFixed(2) + '×'; });
    bindRange('set-pitch', 'pitch', function (v) { return v.toFixed(2); });
    bindRange('set-volume', 'volume', function (v) { return Math.round(v * 100) + '%'; });
    bindRange('set-size', 'readSize', function (v) { return v + 'px'; }, function () {
      D.documentElement.style.setProperty('--read-size', app.settings.readSize + 'px');
    });
    bindRange('set-chunk', 'maxChars', function (v) { return v + ' chars'; }, function () {
      if (reader) reader.resegment();
    });

    var themeButtons = D.querySelectorAll('[data-theme-choice]');
    for (var t = 0; t < themeButtons.length; t++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          app.settings.theme = btn.getAttribute('data-theme-choice');
          app.saveSettings();
          applyTheme();
        });
      })(themeButtons[t]);
    }

    D.documentElement.style.setProperty('--read-size', app.settings.readSize + 'px');
    applyTheme();
    paintCaps();
    setTab('read');

    refreshVoices();
    if (synth && synth.addEventListener) {
      synth.addEventListener('voiceschanged', refreshVoices);
    }
    // Some engines never fire voiceschanged; give the list a few nudges.
    var tries = 0;
    var poll = setInterval(function () {
      tries++;
      if (app.voices.length || tries > 12) { clearInterval(poll); return; }
      refreshVoices();
    }, 250);

    window.TTS.app = app;
  }

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : this);
