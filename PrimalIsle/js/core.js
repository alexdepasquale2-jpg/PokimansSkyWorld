/* Primal Isle — shared helpers: RNG, math, formatting, persistence.
 *
 * The world is regenerated from a seed rather than saved, so everything here
 * that touches world generation has to be deterministic.
 */
(function (ISLE) {
  'use strict';

  const SAVE_KEY = 'primal-isle/save/v1';
  const SAVE_VERSION = 1;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const clamp01 = v => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const chance = p => Math.random() < p;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

  /* Angle difference wrapped to [-PI, PI]. */
  function angDelta(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function turnToward(a, b, maxStep) {
    const d = angDelta(a, b);
    return a + clamp(d, -maxStep, maxStep);
  }

  /* Seeded RNG (mulberry32). World generation uses one of these so the same
   * seed always produces the same island on any device. */
  function rngFrom(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(seed, x, y) {
    let h = (seed * 374761393 + x * 668265263 + y * 2147483647) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* Smooth value noise, good enough for coastlines and biome blotches. */
  function noise2(seed, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(seed, xi, yi), b = hash2(seed, xi + 1, yi);
    const c = hash2(seed, xi, yi + 1), d = hash2(seed, xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  function fbm(seed, x, y, octaves) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < (octaves || 3); i++) {
      sum += amp * noise2(seed + i * 7919, x * f, y * f);
      norm += amp;
      amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }

  // --- formatting --------------------------------------------------------
  function fmt(n) {
    n = Math.floor(n);
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'k';
    return (n / 1e6).toFixed(2).replace(/\.0+$/, '') + 'M';
  }
  const pct = v => Math.round(v * 100) + '%';

  /* Rates and small quantities, where flooring to an integer would print a
   * misleading zero. */
  function fmtSmall(n) {
    if (n >= 100) return fmt(n);
    if (n >= 10) return n.toFixed(1).replace(/\.0$/, '');
    if (n >= 0.01) return n.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
    return n > 0 ? '<0.01' : '0';
  }

  /* Money is stored in whole cents so the receipt never drifts. */
  function money(cents) {
    const neg = cents < 0;
    const v = Math.abs(cents) / 100;
    const s = '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return neg ? '-' + s : s;
  }

  function clock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    return m + ':' + String(s).padStart(2, '0');
  }

  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // --- persistence -------------------------------------------------------
  function save(game) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, t: Date.now(), g: game }));
      return true;
    } catch (e) {
      console.warn('[isle] save failed', e);
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
      console.warn('[isle] load failed', e);
      return null;
    }
  }

  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

  function exportSave(game) {
    return btoa(unescape(encodeURIComponent(JSON.stringify({ v: SAVE_VERSION, t: Date.now(), g: game }))));
  }

  function importSave(text) {
    const payload = JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
    if (!payload || payload.v !== SAVE_VERSION || !payload.g) throw new Error('unrecognised save');
    return payload.g;
  }

  ISLE.core = {
    SAVE_KEY, clamp, clamp01, lerp, rnd, rndInt, pick, chance, dist, dist2,
    angDelta, turnToward, rngFrom, hash2, noise2, fbm,
    fmt, fmtSmall, pct, money, clock, titleCase, save, load, wipe, exportSave, importSave
  };
})(window.ISLE = window.ISLE || {});
