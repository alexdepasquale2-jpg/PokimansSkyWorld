/* DoomSpire — shared helpers: RNG, math, formatting, persistence.
 *
 * Nothing here knows about walls or talents. Content and systems build on
 * top of this the way PrimalIsle's core.js underpins that game.
 */
(function (DS) {
  'use strict';

  const SAVE_KEY = 'doomspire/save/v1';
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

  /* Angle difference wrapped to [-PI, PI], and a turn that never overshoots. */
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

  /* Seeded RNG (mulberry32), used for loot rolls and anything that should be
   * reproducible from a saved seed rather than the wall-clock RNG. */
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

  // --- formatting ----------------------------------------------------------
  function fmt(n) {
    n = Math.floor(n);
    if (Math.abs(n) < 1000) return String(n);
    if (Math.abs(n) < 1e6) return (n / 1000).toFixed(Math.abs(n) < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'k';
    return (n / 1e6).toFixed(2).replace(/\.0+$/, '') + 'M';
  }
  const pct = v => Math.round(v * 100) + '%';
  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // --- persistence -----------------------------------------------------------
  function save(game) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, t: Date.now(), g: game }));
      return true;
    } catch (e) { console.warn('[doomspire] save failed', e); return false; }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || payload.v !== SAVE_VERSION || !payload.g) return null;
      return payload.g;
    } catch (e) { console.warn('[doomspire] load failed', e); return null; }
  }
  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

  DS.core = {
    SAVE_KEY, clamp, clamp01, lerp, rnd, rndInt, pick, chance, dist, dist2,
    angDelta, turnToward, rngFrom, fmt, pct, titleCase, save, load, wipe
  };
})(window.DS = window.DS || {});
