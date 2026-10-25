/* Kiln — the shape of everything that persists, and the day rollover.
 *
 * The whole state is a plain object the user can read in the Audit tab. That
 * is a design constraint, not a convenience: an app aimed at children should
 * not hold anything about them it would be awkward to show them.
 *
 * Note what is absent. No engagement score, no session count used against
 * you, no dwell time per post, no "last active" broadcast to anyone, no
 * consecutive-day counter. Those fields are missing because a field that
 * exists eventually gets used, and there is no version of "how long did they
 * hesitate over Priya's drawing" that helps the person hesitating.
 */
(function (K) {
  'use strict';
  const { today, clamp } = K.core;
  const C = K.content;

  const VERSION = 1;

  function newState() {
    const d = today();
    return {
      v: VERSION,
      name: '',
      onboarded: false,
      createdDay: d,
      lastDay: d,

      /* The charter: limits the user sets for themselves. See charter.js for
       * why loosening one waits until tomorrow and tightening one does not. */
      charter: {
        minutes: 20,        // session budget, self-chosen
        makeFirst: false,   // open the studio before the circle
        pending: []         // [{ key, value, from }] — loosenings in the post
      },

      pieces: [],           // everything you have made, oldest first
      practice: {},         // practiceId -> day completed
      given: {},            // postId -> { praise, text, day } you sent a peer
      seen: {},             // postId -> day you first saw it
      batch: { day: -1, ids: [] },
      days: [],             // [{ day, made, looked, ms, over }] one per day used
      read: [],             // Watchtower entries read through

      /* Feed ordering, user-editable, printed in plain English in Audit. */
      rules: { chrono: true, quiet: true, unseen: true, mycraft: false },

      demoOffset: 0
    };
  }

  function migrate(s) {
    if (!s || typeof s !== 'object') return null;
    const base = newState();
    /* Forward-compatible merge: unknown keys survive, missing keys fill in. */
    const out = Object.assign({}, base, s);
    out.charter = Object.assign({}, base.charter, s.charter || {});
    out.charter.pending = Array.isArray(out.charter.pending) ? out.charter.pending : [];
    out.rules = Object.assign({}, base.rules, s.rules || {});
    out.pieces = Array.isArray(s.pieces) ? s.pieces : [];
    out.days = Array.isArray(s.days) ? s.days : [];
    out.read = Array.isArray(s.read) ? s.read : [];
    out.practice = s.practice && typeof s.practice === 'object' ? s.practice : {};
    out.given = s.given && typeof s.given === 'object' ? s.given : {};
    out.seen = s.seen && typeof s.seen === 'object' ? s.seen : {};
    out.batch = s.batch && typeof s.batch === 'object' ? s.batch : { day: -1, ids: [] };
    out.v = VERSION;
    return out;
  }

  /* --- the day ------------------------------------------------------------
   * Everything time-dependent funnels through here so there is exactly one
   * place that can decide a new day has started. Returns how many days were
   * missed, which the shelf uses to say the "nothing was lost" line — the
   * only place in the app that mentions an absence at all. */
  function rollover(s) {
    const d = today();
    if (d === s.lastDay) return 0;

    const gap = d - s.lastDay;
    if (gap < 0) { s.lastDay = d; return 0; }   // clock moved back; no drama

    // Pending charter loosenings mature.
    const still = [];
    for (const p of s.charter.pending) {
      if (p.from <= d) s.charter[p.key] = p.value;
      else still.push(p);
    }
    s.charter.pending = still;

    s.batch = { day: -1, ids: [] };
    s.lastDay = d;
    return gap - 1;   // days entirely skipped
  }

  function dayRecord(s, day) {
    let rec = null;
    for (const r of s.days) if (r.day === day) { rec = r; break; }
    if (!rec) { rec = { day, made: 0, looked: 0, ms: 0, over: 0 }; s.days.push(rec); }
    return rec;
  }

  /* --- the prompt ---------------------------------------------------------
   * One prompt per calendar day, the same for everyone in the circle. Walking
   * the table by day index rather than picking randomly means the prompt is a
   * fact about the day, not a roll — you can be told tomorrow's if you ask. */
  function promptFor(day) {
    const n = C.PROMPTS.length;
    return C.PROMPTS[((day % n) + n) % n];
  }
  function promptIndex(day) {
    const n = C.PROMPTS.length;
    return ((day % n) + n) % n;
  }

  /* --- derived reads ------------------------------------------------------ */
  function piecesOn(s, day) { return s.pieces.filter(p => p.day === day); }
  function madeToday(s) { return piecesOn(s, today()).length; }

  function craftCount(s, craft) {
    let n = 0;
    for (const p of s.pieces) if (p.craft === craft) n++;
    return n;
  }

  function levelFor(count) {
    let cur = C.LEVELS[0], next = null;
    for (let i = 0; i < C.LEVELS.length; i++) {
      if (count >= C.LEVELS[i].at) cur = C.LEVELS[i];
      else { next = C.LEVELS[i]; break; }
    }
    return { cur, next };
  }

  function practiceDone(s, id) { return Object.prototype.hasOwnProperty.call(s.practice, id); }

  function addPiece(s, piece) {
    s.pieces.push(piece);
    dayRecord(s, piece.day).made++;
    return piece;
  }

  function markSeen(s, postId) {
    if (s.seen[postId] !== undefined) return false;
    s.seen[postId] = today();
    dayRecord(s, today()).looked++;
    return true;
  }

  K.state = {
    VERSION, newState, migrate, rollover, dayRecord,
    promptFor, promptIndex, piecesOn, madeToday, craftCount, levelFor,
    practiceDone, addPiece, markSeen, clamp
  };
})(window.Kiln = window.Kiln || {});
