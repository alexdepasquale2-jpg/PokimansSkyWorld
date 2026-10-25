/* Coremind — thought. You are a mind, not a camera.
 *
 * Issuing an order dilates time; releasing it lets years pass. The sim
 * spends its budget where attention is: fovea is full presence, near is
 * mid-LOD, dream is cheap time (every eighth tick).
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const THOUGHT_RISE = 3.2;
  const THOUGHT_FALL = 1.6;
  const SPEED_DILATE = 0.82;
  const DREAM_EVERY = 8;
  const VIEW_HALF = 48;
  const VIEW_PX = 180;
  const ZOOM_FLOOR = 4;
  const WAR_FOVEA = 0.8;

  function effectiveSpeed(game) {
    if (!game || !game.speed) return 0;
    const thought = K.clamp(game.thought || 0, 0, 1);
    return game.speed * (1 - SPEED_DILATE * thought);
  }

  function pulse(game, seconds) {
    if (!game) return;
    game.thoughtPulse = Math.max(game.thoughtPulse || 0, seconds == null ? 0.55 : seconds);
  }

  function thinking(game, flags) {
    if (!game) return false;
    if (game.thoughtHold) return true;
    if (game.thoughtPulse > 0) return true;
    if (flags && flags.sheetOpen) return true;
    if (game.commandMode) return true;
    if (game.ui && game.ui.sheetOpen) return true;
    return false;
  }

  function tickThought(game, frameDt, flags) {
    if (!game) return;
    const dt = frameDt || 0;
    if (game.thoughtPulse > 0) game.thoughtPulse = Math.max(0, game.thoughtPulse - dt);
    const t = game.thought || 0;
    game.thought = thinking(game, flags)
      ? Math.min(1, t + THOUGHT_RISE * dt)
      : Math.max(0, t - THOUGHT_FALL * dt);
  }

  function alpha(game) {
    return K.clamp((game && game.drawAlpha) || 0, 0, 1);
  }

  function isSelected(game, org) {
    if (!game || !org) return false;
    if (org.id === game.selection) return true;
    const ids = game.selectedIds;
    return !!(ids && ids.length && ids.indexOf(org.id) >= 0);
  }

  function lookAt(game) {
    if (game.camera && game.camera.x != null) return game.camera;
    return game.core || null;
  }

  function visibleRadius(game) {
    const zoom = game.camera && game.camera.zoom;
    if (zoom) return VIEW_PX / Math.max(zoom, ZOOM_FLOOR);
    return VIEW_HALF;
  }

  function warSample(game, x, y, depth) {
    if (!CM.aura || !CM.aura.sample) return 0;
    return CM.aura.sample(game, x, y, depth, 'war') || 0;
  }

  function band(game, org) {
    if (!game || !org) return 'dream';
    if (isSelected(game, org)) return 'fovea';
    if (org.state === 'ATTACK') return 'fovea';

    const viewDepth = game.viewDepth || 0;
    const orgDepth = org.depth || 0;
    const cam = lookAt(game);

    // On-screen at the inhabited depth is fovea. A missing camera
    // falls back to the Core so headless ticks still have a look-at.
    if (cam && orgDepth === viewDepth) {
      if (K.dist(org.x, org.y, cam.x, cam.y) < visibleRadius(game)) return 'fovea';
    }

    if (warSample(game, org.x, org.y, orgDepth) > WAR_FOVEA) return 'fovea';
    if (orgDepth === viewDepth) return 'near';

    // Adjacent fight would be near if war>0.5 anywhere on that depth.
    // No cheap layer-max on aura; peel keeps the stratum in thought.
    if (Math.abs(orgDepth - viewDepth) === 1) {
      return game.peel !== false ? 'near' : 'dream';
    }
    return 'dream';
  }

  function dreamPulse(game, org) {
    if (!org) return false;
    org.dreamAcc = (org.dreamAcc || 0) + 1;
    if (org.dreamAcc >= DREAM_EVERY) {
      org.dreamAcc = 0;
      return true;
    }
    return false;
  }

  /* True after dreamPulse just reset the accumulator. */
  function isDreamTick(org) {
    return !!(org && org.dreamAcc === 0);
  }

  function markPrev(org) {
    if (!org) return;
    org.px = org.x;
    org.py = org.y;
  }

  function drawXY(org, a) {
    if (!org) return { x: 0, y: 0 };
    a = K.clamp(a, 0, 1);
    const px = org.px != null ? org.px : org.x;
    const py = org.py != null ? org.py : org.y;
    return { x: K.lerp(px, org.x, a), y: K.lerp(py, org.y, a) };
  }

  function onDepthChange(org) {
    markPrev(org);
  }

  /* simulation.js org loop — eight lines:
   *   if (CM.mind) CM.mind.markPrev(org);
   *   const band = CM.mind ? CM.mind.band(game, org) : 'fovea';
   *   if (band === 'dream' && !CM.mind.dreamPulse(game, org)) {
   *     org.hunger = K.clamp((org.hunger || 0) + 0.25 * dt, 0, 100);
   *     org.thirst = K.clamp((org.thirst || 0) + 0.25 * dt, 0, 100);
   *     continue;
   *   }
   *   const stepDt = band === 'dream' ? dt * 8 : dt;
   */

  CM.mind = {
    effectiveSpeed, pulse, thinking, tickThought, alpha, band,
    dreamPulse, markPrev, drawXY, onDepthChange, isDreamTick
  };
})(window.CM = window.CM || {});
