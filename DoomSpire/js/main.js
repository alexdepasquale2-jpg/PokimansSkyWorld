/* DoomSpire — bootstrap and the game loop. */
(function (DS) {
  'use strict';

  let game = null;
  let last = 0;
  let saveAcc = 0;
  let started = false;

  function persist() {
    if (!game) return;
    DS.core.save(DS.state.forSave(game));
  }

  function begin(g) {
    game = g;
    DS.ui.startGame(game);
    started = true;
    last = performance.now();
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!started) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!DS.ui.paused()) DS.sim.tick(game, dt, DS.engine.input);
    DS.render.frame(game, dt);
    DS.ui.frame(dt);
    saveAcc += dt;
    if (saveAcc > 8) { saveAcc = 0; persist(); }
  }

  window.addEventListener('DOMContentLoaded', () => {
    DS.ui.boot();
    const saved = DS.state.load();
    const continueBtn = document.getElementById('continue-btn');
    if (saved) {
      continueBtn.classList.remove('hidden');
      continueBtn.addEventListener('click', () => {
        document.getElementById('charcreate').classList.add('hidden');
        begin(saved);
      });
    }
    DS.ui.showCharCreate(begin);
    requestAnimationFrame(loop);
  });
  window.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  window.addEventListener('pagehide', persist);
})(window.DS = window.DS || {});
