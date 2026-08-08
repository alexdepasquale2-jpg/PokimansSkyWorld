/* Kiln — the charter: limits you set on yourself, and the asymmetry that
 * makes them worth anything.
 *
 * A limit you can lift in the moment you want to lift it is not a limit; it
 * is a suggestion you will overrule exactly when overruling it matters. So:
 *
 *   Tightening a limit takes effect now.
 *   Loosening a limit takes effect tomorrow.
 *
 * That is the whole mechanism. It is the oldest trick there is — the sailor
 * lashed to the mast, the alarm clock across the room — and it belongs to
 * the user rather than being done to them. Crucially the app never refuses.
 * You can always raise the ceiling; the raise simply arrives when the urge
 * that produced it has passed, which is the only time a limit is tested.
 *
 * Everything about the delay is stated out loud before the first choice is
 * made. A commitment device you did not know you were signing is a trap, and
 * the difference between this and a dark pattern is entirely consent.
 */
(function (K) {
  'use strict';
  const { today, plural } = K.core;

  /* Which way is stricter for each setting. */
  const STRICTER = {
    minutes: (a, b) => a < b,      // fewer minutes is stricter
    makeFirst: (a, b) => a === true && b === false
  };

  const LABEL = {
    minutes: 'session length',
    makeFirst: 'make before you look'
  };

  function describe(key, value) {
    if (key === 'minutes') return plural(value, 'minute');
    if (key === 'makeFirst') return value ? 'on' : 'off';
    return String(value);
  }

  function pendingFor(s, key) {
    for (const p of s.charter.pending) if (p.key === key) return p;
    return null;
  }

  function dropPending(s, key) {
    s.charter.pending = s.charter.pending.filter(p => p.key !== key);
  }

  /* The single entry point for changing a charter setting. Returns a result
   * the interface can show verbatim — the user should never have to guess
   * whether their change took. */
  function propose(s, key, value) {
    const cur = s.charter[key];
    if (cur === value) {
      dropPending(s, key);
      return { applied: true, changed: false, text: 'No change.' };
    }

    const stricter = STRICTER[key] ? STRICTER[key](value, cur) : true;

    if (stricter) {
      // Tighter, now. Also cancels any looser change waiting in the post.
      dropPending(s, key);
      s.charter[key] = value;
      return {
        applied: true, changed: true,
        text: 'Done, from right now. ' + LABEL[key] + ' is ' + describe(key, value) + '.'
      };
    }

    // Looser: it waits.
    dropPending(s, key);
    const from = today() + 1;
    s.charter.pending.push({ key, value, from });
    return {
      applied: false, changed: true, from,
      text: 'Saved for tomorrow. You set this limit yourself, so loosening it ' +
            'takes a day — that way the decision is made by the version of you ' +
            'who is not in the middle of it. ' + LABEL[key] + ' stays ' +
            describe(key, cur) + ' today.'
    };
  }

  /* Cancelling a waiting loosening is itself a tightening, so it is instant. */
  function cancel(s, key) {
    dropPending(s, key);
  }

  function pendingSummary(s) {
    return s.charter.pending.map(p => ({
      key: p.key,
      label: LABEL[p.key],
      value: describe(p.key, p.value),
      from: p.from,
      days: Math.max(0, p.from - today())
    }));
  }

  /* Whether the circle is open yet under the user's own make-first rule.
   * Note that this never hides the tab or lies about why — see feed.js. */
  function circleOpen(s) {
    if (!s.charter.makeFirst) return true;
    return K.state.madeToday(s) > 0;
  }

  K.charter = { propose, cancel, pendingFor, pendingSummary, describe, circleOpen, LABEL };
})(window.Kiln = window.Kiln || {});
