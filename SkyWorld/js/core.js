/* Skyward Reach — small shared helpers: RNG, math, formatting, persistence. */
(function (SW) {
  'use strict';

  const SAVE_KEY = 'skyward-reach/save/v1';
  const SAVE_VERSION = 1;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const chance = p => Math.random() < p;

  /* Deterministic hash-based noise, so rivals behave the same across reloads
   * without us having to persist their whole random walk. */
  function hashNoise(seed, n) {
    let h = (seed * 374761393 + n * 668265263) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function fmt(n) {
    n = Math.floor(n);
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 2 : 1).replace(/\.0+$/, '') + 'k';
    return (n / 1e6).toFixed(2).replace(/\.0+$/, '') + 'M';
  }
  const pct = v => Math.round(v * 100) + '%';

  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // --- persistence -------------------------------------------------------
  function save(game) {
    try {
      const payload = { v: SAVE_VERSION, t: Date.now(), g: game };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[skyward] save failed', e);
      return false;
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || payload.v !== SAVE_VERSION || !payload.g) return null;
      payload.g.__savedAt = payload.t || Date.now();
      return payload.g;
    } catch (e) {
      console.warn('[skyward] load failed', e);
      return null;
    }
  }

  function wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  function exportSave(game) {
    return btoa(unescape(encodeURIComponent(JSON.stringify({ v: SAVE_VERSION, t: Date.now(), g: game }))));
  }

  function importSave(text) {
    const payload = JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
    if (!payload || payload.v !== SAVE_VERSION || !payload.g) throw new Error('unrecognised save');
    return payload.g;
  }

  SW.core = {
    SAVE_KEY, clamp, lerp, rnd, rndInt, pick, chance, hashNoise,
    fmt, pct, titleCase, save, load, wipe, exportSave, importSave
  };
})(window.SW = window.SW || {});
