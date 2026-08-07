/* Skyward Reach — bootstrap and the game loop. */
(function (SW) {
  'use strict';
  const C = SW.content;

  let G = null;
  let last = 0;
  let acc = 0;
  let saveAcc = 0;
  const TICK = 1;               // one simulation tick = one second at 1×

  function setSpeed(n) { if (G) { G.speed = n; G.paused = false; } }
  function togglePause() { if (G) G.paused = !G.paused; }

  function replace(g) {
    G = g;
    SW.ui.setGame(G);
    SW.ui.log(G, 'Save loaded.', 'good');
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!G) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;

    if (!G.paused) {
      acc += dt * G.speed;
      let guard = 0;
      while (acc >= TICK && guard++ < 120) {
        acc -= TICK;
        SW.sim.tick(G, TICK);
      }
      // Feats are cheap to test and much better felt immediately.
      G.__featAcc = (G.__featAcc || 0) + dt;
      if (G.__featAcc > 1.5) { G.__featAcc = 0; SW.sim.checkFeats(G); }
    }

    SW.render.frame(G, dt);
    SW.ui.frame(G, dt);

    saveAcc += dt;
    if (saveAcc > 12) { saveAcc = 0; G.__savedAt = Date.now(); SW.core.save(G); }
  }

  function begin(game, offlineReport) {
    G = game;
    SW.render.attach(document.getElementById('scene'));
    SW.ui.init(G);
    if (offlineReport) SW.ui.showOffline(offlineReport);
    last = performance.now();
    requestAnimationFrame(loop);
    window.addEventListener('beforeunload', () => { G.__savedAt = Date.now(); SW.core.save(G); });

    /* A backgrounded tab stops getting animation frames, so the sim stops with
     * it. Credit that time on the way back, the same way a closed tab is
     * credited on reload — otherwise switching tabs quietly costs you an hour
     * that closing the game would have paid out. */
    document.addEventListener('visibilitychange', () => {
      if (!G) return;
      if (document.hidden) {
        G.__savedAt = Date.now();
        SW.core.save(G);
      } else {
        const report = SW.sim.runOffline(G);
        last = performance.now();
        acc = 0;
        // Resync first: festivals resolved during catch-up are summarised in
        // the report, not replayed as a stack of modals.
        SW.ui.setGame(G);
        if (report) SW.ui.showOffline(report);
      }
    });
  }

  function boot() {
    const loaded = SW.state.hydrate(SW.core.load());
    if (loaded) {
      const report = SW.sim.runOffline(loaded);
      begin(loaded, report);
      SW.ui.log(loaded, 'You return to the island.', 'info');
    } else {
      SW.render.attach(document.getElementById('scene'));
      SW.ui.showHatch((lineage, beastName, godName) => {
        const g = SW.state.startGame(lineage, beastName, godName);
        SW.ui.log(g, `The egg opens. ${beastName} looks at you and waits to be told what it is.`, 'great');
        SW.ui.log(g, 'Click a plot to work it. Praise or strike the creature after it acts — that is how it learns.', 'info');
        begin(g);
      });
    }
  }

  SW.main = { boot, setSpeed, togglePause, replace, get game() { return G; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.SW = window.SW || {});
