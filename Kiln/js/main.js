/* Kiln — boot.
 *
 * Load, roll the day over, start the clock, hand off to the interface. The
 * only recurring timer in the app checks whether you have reached the
 * session length you set for yourself; there is no polling, no background
 * work, and nothing that runs to keep the app warm.
 */
(function (K) {
  'use strict';
  const S = K.state;

  function start() {
    let state = S.migrate(K.core.load()) || S.newState();

    /* The demo clock offset is restored before anything asks what day it is,
     * so the whole app agrees on the date from the first line. */
    K.core.setDayOffset(state.demoOffset || 0);

    const away = S.rollover(state);
    K.core.save(state);

    K.receipt.start();
    K.ui.boot(state, away);

    /* One interval, one job. When you reach the length you chose, the app
     * says so exactly once and then never brings it up again unless you ask
     * for more time. */
    setInterval(() => {
      if (K.receipt.shouldAnnounce(state)) K.ui.showBudget();
    }, 5000);

    /* Keep the clock honest across a closed tab, without ever using the
     * saved time for anything but the receipt. */
    window.addEventListener('pagehide', () => {
      K.receipt.commit(state);
      K.core.save(state);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window.Kiln = window.Kiln || {});
