/* Kiln — the attention receipt.
 *
 * The app counts the time you spend in it and then tells you, which is the
 * exact inverse of the normal arrangement: every attention-funded app
 * measures this far more precisely than Kiln does and shows it to advertisers
 * instead of to you.
 *
 * Three rules keep the receipt from becoming its own kind of pressure:
 *
 *   It is never used against you. No target, no goal, no "you did better
 *   than last week", no comparison with anyone. A receipt, not a scorecard.
 *
 *   Reaching your limit is not a lockout. Locks teach circumvention and
 *   nothing else; a fourteen-year-old defeats one in an afternoon and learns
 *   that the app was an opponent. Kiln says the true thing once and then
 *   gets out of the way.
 *
 *   Leaving is celebrated and takes one tap. There is no confirmation, no
 *   "are you sure", and nothing waiting to be missed.
 */
(function (K) {
  'use strict';
  const { el, plural, minutesWords, today } = K.core;
  const S = K.state;

  let startedAt = 0;
  let accrued = 0;
  let visible = true;
  let announced = false;

  function start() {
    startedAt = Date.now();
    accrued = 0;
    announced = false;
    document.addEventListener('visibilitychange', () => {
      /* Time with the tab hidden is not time you spent here. Counting it
       * would flatter the number in the app's favour, which is the direction
       * every other counter in this industry leans. */
      if (document.hidden) { accrued += Date.now() - startedAt; visible = false; }
      else { startedAt = Date.now(); visible = true; }
    });
  }

  function ms() {
    return accrued + (visible ? Date.now() - startedAt : 0);
  }

  function overBudget(state) {
    return ms() >= state.charter.minutes * 60000;
  }

  function shouldAnnounce(state) {
    if (announced) return false;
    if (!overBudget(state)) return false;
    announced = true;
    return true;
  }

  function extend(state, mins) {
    /* Extending is honest: it is recorded as an extension, in the receipt,
     * in your words. It is not punished and it is not hidden. */
    const rec = S.dayRecord(state, today());
    rec.over = (rec.over || 0) + mins;
    announced = false;
    accrued -= mins * 60000;   // push the next announcement out by the extension
  }

  function commit(state) {
    const rec = S.dayRecord(state, today());
    rec.ms = (rec.ms || 0) + ms();
    accrued = 0;
    startedAt = Date.now();
  }

  /* The "you have reached your limit" card. One sentence of fact, two
   * buttons, neither of them arguing. */
  function budgetCard(state, onDone, onMore) {
    const mins = state.charter.minutes;
    return el('div', { class: 'modal-inner' }, [
      el('h2', { text: 'That is ' + plural(mins, 'minute') + '.' }),
      el('p', { text: 'You set that yourself. Nothing is locked and nothing is ' +
        'about to be taken away — this is just the app telling you the time, ' +
        'which is the only thing it knows that you do not.' }),
      tally(state),
      el('div', { class: 'modal-acts' }, [
        el('button', { type: 'button', class: 'big-btn', onclick: onDone }, ['I am done']),
        el('button', {
          type: 'button', class: 'tool-btn quiet',
          onclick: () => onMore(10)
        }, ['Ten more, on purpose'])
      ]),
      el('p', { class: 'muted tiny', text:
        'If you carry on, it goes in the receipt as a choice you made, not as a ' +
        'failure. That is the difference between a record and a telling-off.' })
    ]);
  }

  function tally(state) {
    const rec = S.dayRecord(state, today());
    const made = S.piecesOn(state, today()).length;
    const looked = rec.looked || 0;
    const t = ms() + (rec.ms || 0);
    return el('div', { class: 'tally' }, [
      row('Time here today', minutesWords(t)),
      row('Things you made', made ? plural(made, 'thing') : 'none'),
      row('Things you looked at', looked ? String(looked) : 'none'),
      rec.over ? row('Extra minutes you chose', plural(rec.over, 'minute')) : null
    ]);
  }

  function row(k, v) {
    return el('div', { class: 'tally-row' }, [
      el('span', { class: 'muted', text: k }), el('b', { text: v })
    ]);
  }

  /* The goodbye. Deliberately final-looking and deliberately pleasant. */
  function goodbye(state, onBack) {
    const made = S.piecesOn(state, today()).length;
    const rec = S.dayRecord(state, today());
    return el('div', { class: 'goodbye' }, [
      el('div', { class: 'goodbye-mark', text: '⌂' }),
      el('h1', { text: 'Done for today.' }),
      el('p', { class: 'lede', text: made
        ? 'You made ' + plural(made, 'thing') + '. It is on your shelf and it will ' +
          'be there whenever you want it.'
        : 'You did not make anything today, and nothing happened as a result. ' +
          'No streak broke. Nobody was told.' }),
      tally(state),
      el('p', { class: 'muted small', text:
        'Tomorrow there is a new prompt and a new batch. Neither of them will ' +
        'come looking for you.' }),
      el('button', { type: 'button', class: 'tool-btn quiet', onclick: onBack },
        ['Actually, one more thing'])
    ]);
  }

  K.receipt = { start, ms, overBudget, shouldAnnounce, extend, commit, budgetCard, tally, goodbye };
})(window.Kiln = window.Kiln || {});
