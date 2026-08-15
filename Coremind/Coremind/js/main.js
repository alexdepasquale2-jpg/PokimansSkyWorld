/* Coremind — bootstrap. Wires world/sim/render/input/ui/save together and
 * runs the game loop: a fixed-step simulation accumulator decoupled from
 * rendering, so physics stays stable regardless of frame rate or the
 * player's chosen simulation speed.
 */
(function (CM) {
  'use strict';
  const SIM_DT = 0.1;
  const MAX_STEPS_PER_FRAME = 8;

  let game = null, canvas = null, ctx = null, acc = 0, lastT = 0, rafId = null, periodicAcc = 0;

  function wireInput() {
    CM.input.attach(canvas, game, {
      onSelectOrganism(org) {
        if (game.hero && game.hero.on && CM.hero) {
          if (org.id !== game.hero.orgId) game.hero.targetId = org.id;
          if (CM.ui.renderHero) CM.ui.renderHero(game);
          return;
        }
        if (CM.orders && CM.orders.handleTap(game, { kind: 'org', org })) {
          CM.ui.renderSelection(game);
          if (CM.ui.renderOrderBar) CM.ui.renderOrderBar(game);
          return;
        }
        CM.coremind.selectOrganism(game, org.id, game.addSelect);
        CM.ui.renderSelection(game);
        if (CM.ui.renderOrderBar) CM.ui.renderOrderBar(game);
        CM.render.focusOn(game, org.x, org.y);
      },
      onTapSample(sample) { CM.ui.showInspect(game, 'sample', { sample }); },
      onTapCore() {
        if (CM.orders && CM.orders.handleTap(game, { kind: 'core', world: { x: game.core.x, y: game.core.y } })) {
          CM.ui.renderSelection(game);
          if (CM.ui.renderOrderBar) CM.ui.renderOrderBar(game);
          return;
        }
        CM.ui.showInspect(game, 'core', {});
      },
      onTapStructure(site) {
        if (CM.orders && CM.orders.handleTap(game, { kind: 'site', site })) {
          CM.ui.renderSelection(game);
          if (CM.ui.renderOrderBar) CM.ui.renderOrderBar(game);
          return;
        }
        CM.ui.showInspect(game, 'structure', { site });
      },
      onTapEmpty(world) {
        if (game.hero && game.hero.on && CM.hero) {
          const h = CM.hero.ensure(game);
          h.walk = { x: world.x, y: world.y };
          const hero = CM.hero.heroOf(game);
          if (hero) hero.heading = Math.atan2(world.y - hero.y, world.x - hero.x);
          return;
        }
        /* Placing a chamber takes priority over clearing the selection: while
         * build mode is armed a tap on the ground is a construction order. */
        if (game.buildMode) {
          const res = CM.structures.queue(game, game.__bus, game.core, game.buildMode, world.x, world.y);
          if (res.ok) {
            CM.ui.toast({ kind: 'system', icon: CM.structures.TYPES[game.buildMode].icon,
              message: `${CM.structures.TYPES[game.buildMode].name} sited. Order selected organisms to garrison, or the colony to Dig.` });
            game.buildMode = null;
            CM.ui.renderBuildBanner(game);
          } else {
            CM.ui.toast({ kind: 'warn', icon: '\u{26A0}', message: res.reason });
          }
          return;
        }
        if (CM.orders && CM.orders.handleTap(game, { kind: 'empty', world })) {
          CM.ui.renderSelection(game);
          if (CM.ui.renderOrderBar) CM.ui.renderOrderBar(game);
          return;
        }
        CM.coremind.selectOrganism(game, null);
        CM.ui.renderSelection(game);
        if (CM.ui.renderOrderBar) CM.ui.renderOrderBar(game);
      }
    });
  }

  function startCommon() {
    canvas = document.getElementById('world-canvas');
    ctx = canvas.getContext('2d');
    window.__CM_GAME__ = game; // debug/inspection hook only — never read by game logic
    CM.save.init(game, game.__bus);
    CM.ui.init(game, game.__bus);
    CM.ui.renderFeed(game);
    CM.ui.updateBadges(game);
    wireInput();
    window.addEventListener('resize', () => CM.render.resizeCanvas(canvas));
    document.addEventListener('visibilitychange', () => { if (document.hidden) CM.save.writeNow(game); });
    window.addEventListener('pagehide', () => CM.save.writeNow(game));
    acc = 0; periodicAcc = 0; lastT = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function newWorld(opts) {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    game = CM.coremind.newGame(seed);
    game.__bus = CM.core.makeBus();
    CM.simulation.spawnStarterColony(game, game.__bus);
    CM.simulation.spawnStarterWildlife(game);
    if (CM.sentiment) CM.sentiment.ensure(game);
    if (CM.economy) CM.economy.ensure(game);
    if (CM.reputation) CM.reputation.ensure(game);
    if (CM.guide) CM.guide.start(game, !(opts && opts.skipGuide));
    startCommon();
    CM.save.writeNow(game);
  }

  function continueGame() {
    const data = CM.save.readRaw();
    if (!data) { newWorld(); return; }
    game = CM.save.hydrate(data);
    game.__bus = CM.core.makeBus();
    startCommon();
  }

  function loop(tMs) {
    rafId = requestAnimationFrame(loop);
    if (!lastT) lastT = tMs;
    let frameDt = (tMs - lastT) / 1000;
    lastT = tMs;
    frameDt = Math.min(frameDt, 0.25); // guard against tab-backgrounding spikes

    if (CM.mind) {
      CM.mind.tickThought(game, frameDt, {
        pointerDown: false,
        sheetOpen: !!(CM.ui.anySheetOpen && CM.ui.anySheetOpen())
      });
    }
    const rate = CM.mind ? CM.mind.effectiveSpeed(game) : game.speed;
    acc += frameDt * rate;
    let steps = 0;
    while (acc >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
      CM.simulation.tick(game, game.__bus, SIM_DT);
      acc -= SIM_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0; // device can't keep up — drop the backlog rather than spiral
    game.drawAlpha = acc / SIM_DT;

    CM.render.updateCamera(game, frameDt);
    CM.render.draw(game, canvas, ctx);
    CM.ui.render(game);
    if (!game.ui || game.ui.selDirty !== false) {
      CM.ui.renderSelection(game);
      if (game.ui) game.ui.selDirty = false;
    }

    periodicAcc += frameDt;
    if (periodicAcc * 1000 >= CM.save.PERIODIC_MS) { periodicAcc = 0; CM.save.writeNow(game); }
  }

  function boot() {
    const bootOverlay = document.getElementById('boot-overlay');
    const continueBtn = document.getElementById('btn-continue');
    if (CM.save.hasSave()) continueBtn.classList.remove('hidden');
    continueBtn.addEventListener('click', () => { bootOverlay.classList.add('hidden'); continueGame(); });
    document.getElementById('btn-new-world').addEventListener('click', () => { bootOverlay.classList.add('hidden'); newWorld({ skipGuide: false }); });
    const quiet = document.getElementById('btn-new-quiet');
    if (quiet) quiet.addEventListener('click', () => { bootOverlay.classList.add('hidden'); newWorld({ skipGuide: true }); });
  }

  CM.main = { newWorld, continueGame, boot };
  document.addEventListener('DOMContentLoaded', CM.main.boot);
})(window.CM = window.CM || {});
