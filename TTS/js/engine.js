/* Playback — turns a list of chunks into speech you can steer.
 *
 * One utterance at a time, never a bulk enqueue. Queueing the whole document
 * would forfeit seeking and walk straight into the engine queue bugs the bench
 * measures; speaking sentence by sentence costs nothing and gives the reader a
 * cursor for free.
 *
 * Everything here is defensive about a specific measured failure:
 *
 *   cancel() before every speak()   — clears a wedged queue
 *   a generation token on callbacks — a cancelled utterance still fires onend
 *                                     in Chrome, and that stale event would
 *                                     otherwise advance the cursor
 *   a start watchdog                — Chrome sometimes swallows the first
 *                                     utterance entirely
 *   pause by cancel-and-remember    — unless the bench proved native pause
 *                                     works on this device
 *   resume on visibilitychange      — Android kills speech in the background
 *   a screen wake lock              — the screen sleeping stops the voice
 */
(function (window) {
  'use strict';

  var START_TIMEOUT_MS = 1600;

  function createEngine(cfg) {
    var synth = cfg.synth;
    var Utterance = cfg.Utterance;
    var emit = cfg.emit || function () {};
    var settings = cfg.settings || function () { return {}; };

    var self = {
      chunks: [],
      index: 0,
      playing: false,
      paused: false,
      caps: cfg.caps || { boundary: false, nativePause: false },
      offset: 0,        // characters into chunks[index].speech already spoken
      wordAt: -1        // absolute char offset of the word being spoken, or -1
    };

    var token = 0;
    var startTimer = null;
    var retried = false;
    var wakeLock = null;

    function available() { return !!(synth && typeof synth.speak === 'function' && typeof Utterance === 'function'); }

    function clearStartTimer() {
      if (startTimer !== null) { clearTimeout(startTimer); startTimer = null; }
    }

    function state() {
      emit('state', {
        playing: self.playing,
        paused: self.paused,
        index: self.index,
        total: self.chunks.length
      });
    }

    // --- screen wake lock ----------------------------------------------------
    // Without it the screen sleeps mid-paragraph and the voice goes with it.

    function acquireWakeLock() {
      if (wakeLock || !navigator.wakeLock || !navigator.wakeLock.request) return;
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        lock.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () { /* denied or unsupported; not worth surfacing */ });
    }

    function releaseWakeLock() {
      if (!wakeLock) return;
      var lock = wakeLock;
      wakeLock = null;
      try { lock.release(); } catch (e) { /* already gone */ }
    }

    // --- speaking ------------------------------------------------------------

    function speakCurrent() {
      if (!available()) { emit('error', { message: 'This browser has no speech synthesis.' }); return; }

      var chunk = self.chunks[self.index];
      if (!chunk) { finish(); return; }

      var body = chunk.speech.slice(self.offset);
      if (!body.trim()) { advance(); return; }

      var mine = ++token;
      var base = self.offset;
      var s = settings();
      retried = false;

      var u = new Utterance(body);
      if (s.voice) u.voice = s.voice;
      u.rate = s.rate || 1;
      u.pitch = s.pitch == null ? 1 : s.pitch;
      u.volume = s.volume == null ? 1 : s.volume;
      u.lang = (s.voice && s.voice.lang) || undefined;

      u.onstart = function () {
        if (mine !== token) return;
        clearStartTimer();
        emit('chunk', { index: self.index });
      };

      u.onboundary = function (e) {
        if (mine !== token) return;
        if (!e || typeof e.charIndex !== 'number' || e.charIndex < 0) return;
        self.offset = base + e.charIndex;
        self.wordAt = self.offset;
        emit('word', { index: self.index, charIndex: self.offset, length: e.charLength || 0 });
      };

      u.onend = function () {
        if (mine !== token) return;      // a stale end from a cancelled utterance
        clearStartTimer();
        advance();
      };

      u.onerror = function (e) {
        if (mine !== token) return;
        clearStartTimer();
        var kind = (e && (e.error || e.name)) || 'error';
        // Cancelling is how we stop and seek; it is not a failure.
        if (kind === 'canceled' || kind === 'cancelled' || kind === 'interrupted') return;
        self.playing = false;
        releaseWakeLock();
        state();
        emit('error', { message: 'The speech engine reported "' + kind + '".' });
      };

      try {
        synth.cancel();
        synth.speak(u);
      } catch (err) {
        emit('error', { message: String((err && err.message) || err) });
        return;
      }

      // Chrome occasionally accepts an utterance and never starts it.
      clearStartTimer();
      startTimer = setTimeout(function () {
        startTimer = null;
        if (mine !== token || !self.playing || self.paused) return;
        if (retried) {
          emit('error', { message: 'The speech engine accepted the text but never started. Try another voice, or reload.' });
          self.playing = false;
          releaseWakeLock();
          state();
          return;
        }
        retried = true;
        speakCurrent();
      }, START_TIMEOUT_MS);
    }

    function advance() {
      self.offset = 0;
      self.wordAt = -1;
      if (self.index + 1 >= self.chunks.length) { finish(); return; }
      self.index++;
      emit('chunk', { index: self.index });
      state();
      speakCurrent();
    }

    function finish() {
      token++;
      clearStartTimer();
      self.playing = false;
      self.paused = false;
      self.offset = 0;
      self.wordAt = -1;
      releaseWakeLock();
      state();
      emit('done', { index: self.index });
    }

    // --- controls ------------------------------------------------------------

    self.setChunks = function (chunks) {
      self.stop();
      self.chunks = chunks || [];
      self.index = 0;
      self.offset = 0;
      state();
    };

    self.play = function (from) {
      if (!self.chunks.length) return;
      if (typeof from === 'number') {
        token++;
        self.index = Math.max(0, Math.min(from, self.chunks.length - 1));
        self.offset = 0;
      }
      if (self.playing && self.paused) { self.resume(); return; }
      if (self.playing) return;

      self.playing = true;
      self.paused = false;
      acquireWakeLock();
      state();
      emit('chunk', { index: self.index });
      speakCurrent();
    };

    self.pause = function () {
      if (!self.playing || self.paused) return;
      self.paused = true;
      clearStartTimer();

      if (self.caps.nativePause) {
        try { synth.pause(); } catch (e) { /* fall through to the safe path */ }
        if (synth.paused) { releaseWakeLock(); state(); return; }
      }

      // The safe path: stop, and remember how far in we got. Where the bench
      // found no boundary events, offset is still 0 and the sentence restarts —
      // which is why the reader says so rather than pretending otherwise.
      token++;
      try { synth.cancel(); } catch (e2) { /* already stopped */ }
      releaseWakeLock();
      state();
    };

    self.resume = function () {
      if (!self.playing || !self.paused) return;
      self.paused = false;
      acquireWakeLock();
      state();

      if (self.caps.nativePause && synth.paused) {
        try { synth.resume(); return; } catch (e) { /* fall through */ }
      }
      speakCurrent();
    };

    self.toggle = function () {
      if (!self.playing) self.play();
      else if (self.paused) self.resume();
      else self.pause();
    };

    self.stop = function () {
      token++;
      clearStartTimer();
      self.playing = false;
      self.paused = false;
      self.offset = 0;
      self.wordAt = -1;
      try { if (synth && synth.cancel) synth.cancel(); } catch (e) { /* nothing queued */ }
      releaseWakeLock();
      state();
    };

    self.seek = function (i) {
      if (!self.chunks.length) return;
      var wasPlaying = self.playing && !self.paused;
      token++;
      clearStartTimer();
      try { if (synth && synth.cancel) synth.cancel(); } catch (e) { /* nothing queued */ }

      self.index = Math.max(0, Math.min(i, self.chunks.length - 1));
      self.offset = 0;
      self.wordAt = -1;
      emit('chunk', { index: self.index });
      state();

      if (wasPlaying) { self.playing = true; self.paused = false; speakCurrent(); }
    };

    self.next = function () { self.seek(self.index + 1); };
    self.prev = function () {
      // Mid-sentence, "back" means the start of this sentence — the same thing
      // a person means when they say it.
      self.seek(self.offset > 8 ? self.index : self.index - 1);
    };

    self.setCaps = function (caps) { if (caps) self.caps = caps; };

    // Android stops speech when the tab goes to the background and does not
    // start it again by itself. Pick the sentence back up on return.
    self.onVisible = function () {
      if (!self.playing || self.paused) return;
      var speaking = false;
      try { speaking = !!(synth && (synth.speaking || synth.pending)); } catch (e) { speaking = false; }
      if (!speaking) speakCurrent();
      else acquireWakeLock();
    };

    return self;
  }

  window.TTS = window.TTS || {};
  window.TTS.engine = { create: createEngine, START_TIMEOUT_MS: START_TIMEOUT_MS };
})(typeof window !== 'undefined' ? window : this);
