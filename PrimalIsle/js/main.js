/* Primal Isle — bootstrap and the game loop. */
(function (ISLE) {
  'use strict';

  let G = null;
  let last = 0;
  let saveAcc = 0;
  let running = false;
  let started = false;

  function replace(g) {
    G = g;
    ISLE.ui.setGame(G);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!G) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!running) { ISLE.render.frame(G, 0); return; }

    /* A sheet or a mutation draft holds the isle still — but never the
     * Exchange, which is the whole reason it is worth leaving open. */
    ISLE.sim.tickTimers(G, dt);
    if (ISLE.ui.paused()) {
      ISLE.idle.tick(G, dt * ISLE.shop.exchangeMult(G));
    } else {
      ISLE.sim.update(G, dt, G.player && G.player.alive ? ISLE.ui.input : null);
    }
    ISLE.render.frame(G, dt);
    ISLE.ui.frame(G, dt);

    saveAcc += dt;
    if (saveAcc > 10) { saveAcc = 0; persist(); }
  }

  function persist() {
    if (!G) return;
    ISLE.core.save(ISLE.state.forSave(G));
  }

  /* Start the clock. Called once, whether the game came from a save or from
   * the species picker. */
  function run() {
    if (started) { running = true; last = performance.now(); return; }
    started = true;
    running = true;
    /* The Exchange ran while the tab was shut. Credit it, and say so. */
    const away = ISLE.idle.catchUp(G);
    if (away) ISLE.ui.offlineReport(away);
    last = performance.now();
    requestAnimationFrame(loop);

    window.addEventListener('beforeunload', persist);

    /* A backgrounded tab stops getting frames, and this world does not run
     * while you are not looking at it. Nothing is credited on return: an
     * action game that pays out for being closed is an idle game with teeth. */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { running = false; persist(); }
      else { last = performance.now(); running = true; }
    });
  }

  function boot() {
    ISLE.render.attach(document.getElementById('scene'));
    const loaded = ISLE.state.hydrate(ISLE.core.load());

    if (loaded && loaded.player) {
      G = loaded;
      ISLE.ui.init(G);
      ISLE.sim.feed(G, 'You wake where you left off.', 'info');
      run();
      return;
    }

    /* No save: build a world immediately so the island sits behind the start
     * sheet, then rebuild it around whichever animal is chosen. */
    G = ISLE.state.startGame('fernback', 'you');
    ISLE.ui.init(G);
    ISLE.render.frame(G, 0.016);
    ISLE.ui.showStart(spId => {
      G = ISLE.state.startGame(spId, 'you', G.seed);
      ISLE.ui.setGame(G);
      ISLE.sim.feed(G, 'You hatch. Eat, drink, and keep away from anything bigger.', 'info');
      run();
    });
  }

  ISLE.main = { boot, replace, persist, get game() { return G; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.ISLE = window.ISLE || {});
