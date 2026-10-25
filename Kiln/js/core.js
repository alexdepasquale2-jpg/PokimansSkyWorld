/* Kiln — shared helpers: RNG, days, DOM, persistence.
 *
 * Two rules hold this file together and most of the app follows from them:
 *
 *   1. Randomness that anyone else can see must be deterministic. The circle
 *      is simulated, and a peer who made a different drawing every time you
 *      reloaded would be a slot machine wearing a friend's name. Everything
 *      about a peer's day comes out of seeded(day, peerId), so the day is the
 *      day whether you look once or forty times.
 *
 *   2. Nothing leaves the device. There is no fetch, no XHR, no beacon, no
 *      WebSocket anywhere in this app, and tools/build.mjs fails the build if
 *      one appears. Storage is localStorage and the user can read and erase
 *      all of it from inside the app.
 */
(function (K) {
  'use strict';

  const SAVE_KEY = 'kiln/save/v1';
  const SAVE_VERSION = 1;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* --- deterministic randomness ------------------------------------------
   * mulberry32 off a string hash. Same seed, same stream, forever. */
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function seeded(...parts) {
    let a = hash(parts.join('|'));
    const rng = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
    rng.pick = arr => arr[Math.floor(rng() * arr.length)];
    rng.chance = p => rng() < p;
    rng.shuffle = arr => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = a2[i]; a2[i] = a2[j]; a2[j] = t;
      }
      return a2;
    };
    /* Pick without repeating until the pool is exhausted — peers should not
     * say the same word four times in a row just because the die is fair. */
    rng.some = (arr, n) => rng.shuffle(arr).slice(0, clamp(n, 0, arr.length));
    return rng;
  }

  /* --- days --------------------------------------------------------------
   * A day is a local calendar day, not 24 hours from signup. Rolling over at
   * midnight local time is the honest version: it does not quietly move the
   * finish line based on when you happened to open the app.
   *
   * `offset` is the demo control in Settings. It is stored, visible, and
   * labelled as a demo — it exists so the "you were away" paths can be seen
   * without waiting a week, and it is never used to manufacture urgency. */
  let dayOffset = 0;
  function setDayOffset(n) { dayOffset = n | 0; }
  function getDayOffset() { return dayOffset; }

  function today() {
    const d = new Date();
    const local = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.floor(local / 86400000) + dayOffset;
  }

  /* A day index maps straight to a calendar date, offset included — moving
   * the demo clock forward really does move the date, so the app never shows
   * one date while reasoning about another. */
  function dayLabel(day) {
    const d = new Date(day * 86400000);
    return d.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC'
    });
  }

  function dayShort(day) {
    const d = new Date(day * 86400000);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function agoWords(days) {
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    if (days < 14) return 'last week';
    if (days < 60) return Math.round(days / 7) + ' weeks ago';
    return Math.round(days / 30) + ' months ago';
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : (many || one + 's'));
  }

  function minutesWords(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor(ms / 1000) % 60;
    if (m < 1) return s + ' seconds';
    if (m < 60) return plural(m, 'minute');
    const h = Math.floor(m / 60);
    return plural(h, 'hour') + (m % 60 ? ' ' + plural(m % 60, 'minute') : '');
  }

  /* --- DOM ---------------------------------------------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
        else if (k === 'data') { for (const d in v) n.dataset[d] = v[d]; }
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    if (kids) {
      for (const kid of [].concat(kids)) {
        if (kid === null || kid === undefined || kid === false) continue;
        n.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
      }
    }
    return n;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* --- persistence -------------------------------------------------------- */
  function save(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, t: Date.now(), s: state }));
      return true;
    } catch (e) {
      return false;   // private mode, quota, a locked-down browser — never fatal
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return p && p.s ? p.s : null;
    } catch (e) {
      return null;
    }
  }

  function saveBytes() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? raw.length : 0;
    } catch (e) { return 0; }
  }

  function erase() {
    try { localStorage.removeItem(SAVE_KEY); return true; } catch (e) { return false; }
  }

  function bytesWords(n) {
    if (n < 1024) return n + ' bytes';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' kB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  function uid(prefix) {
    return (prefix || 'x') + '-' + Date.now().toString(36) + '-' +
      Math.floor(Math.random() * 1e6).toString(36);
  }

  const reducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  K.core = {
    SAVE_KEY, clamp, lerp, hash, seeded,
    today, dayLabel, dayShort, agoWords, setDayOffset, getDayOffset,
    plural, minutesWords, bytesWords,
    $, $$, el, clear, esc,
    save, load, erase, saveBytes, uid, reducedMotion
  };
})(window.Kiln = window.Kiln || {});
