/* Coremind — touch input: one-finger drag to pan, two-finger pinch to zoom,
 * tap to select/inspect. Pointer Events unify mouse and touch so the same
 * code path is what gets exercised on desktop during development.
 */
(function (CM) {
  'use strict';
  const K = CM.core;
  const R = CM.render;

  const TAP_MOVE_THRESHOLD = 9;   // px
  const TAP_MAX_DURATION = 400;   // ms
  const HIT_RADIUS_PX = 22;

  function zoomBy(game, factor) {
    const c = game.camera;
    c.targetZoom = K.clamp((c.targetZoom || c.zoom) * factor, R.ZOOM_MIN, R.ZOOM_MAX);
  }
  function focusCore(game) { R.focusOn(game, game.core.x, game.core.y, 12); }

  /* Hit radii are in canvas pixels, so the finger-sized slop has to be scaled
   * by dpr as well — 22 device pixels is 7 CSS pixels on a modern phone, which
   * is far smaller than a fingertip. */
  function slop(canvas) { return HIT_RADIUS_PX * (canvas.__dpr || 1); }

  function hitTestOrganism(game, canvas, screenX, screenY) {
    const dpr = canvas.__dpr || 1;
    const view = game.viewDepth || 0;
    let best = null, bestD = slop(canvas);
    for (const org of game.organisms) {
      if ((org.depth || 0) !== view) continue;
      if (CM.sense && !CM.sense.visibleOrg(game, org)) continue;
      const p = R.worldToScreen(game, canvas, org.x, org.y);
      const d = Math.hypot(p.x - screenX, p.y - screenY);
      const r = Math.max(10 * dpr, org.stats.size * 0.11 * game.camera.zoom * dpr * 1.9);
      if (d < r + 6 * dpr && d < bestD) { bestD = d; best = org; }
    }
    return best;
  }
  function hitTestSample(game, canvas, screenX, screenY) {
    let best = null, bestD = slop(canvas);
    for (const s of game.discovery.samples) {
      if (game.senseSight !== false && CM.sense && !CM.sense.lit(game, s.x, s.y, game.viewDepth || 0)) continue;
      const p = R.worldToScreen(game, canvas, s.x, s.y);
      const d = Math.hypot(p.x - screenX, p.y - screenY);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /* Chambers are only tappable on their own depth. Exception: a finished
   * Access Shaft on L1 is a wound on the surface and must take a tap so
   * GARRISON / inspect work without descending first. */
  function structureHittable(game, site) {
    if (!site) return false;
    if (site.depth === game.viewDepth) return true;
    if ((game.viewDepth || 0) === 0 && site.type === 'SHAFT' && site.depth === 1) return true;
    return false;
  }
  function hitTestStructure(game, canvas, screenX, screenY) {
    if (!R || !R.worldToScreen) return null;
    const dpr = canvas.__dpr || 1;
    let best = null, bestD = Infinity;
    for (const s of CM.structures.all(game)) {
      if (!structureHittable(game, s)) continue;
      const p = R.worldToScreen(game, canvas, s.x, s.y);
      const d = Math.hypot(p.x - screenX, p.y - screenY);
      const r = Math.max(slop(canvas), CM.structures.TYPES[s.type].radius * game.camera.zoom * dpr * 0.62);
      if (d < r && d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  function hitTestCore(game, canvas, screenX, screenY) {
    const p = R.worldToScreen(game, canvas, game.core.x, game.core.y);
    const r = Math.max(18, game.core.radius * game.camera.zoom * (canvas.__dpr || 1));
    return Math.hypot(p.x - screenX, p.y - screenY) < r ? game.core : null;
  }

  function attach(canvas, game, handlers) {
    handlers = handlers || {};
    const pointers = new Map();
    let mode = null; // 'pan' | 'pinch' | 'box'
    let panLast = null;
    let pinchStartDist = 0, pinchStartZoom = 0;
    let tapStart = null; // {x,y,t,id}
    let holdTimer = null;
    let lastTap = null; // {t, orgId}

    function dpr() { return canvas.__dpr || (window.devicePixelRatio || 1); }
    function toCanvasPx(evt) {
      const rect = canvas.getBoundingClientRect();
      return { x: (evt.clientX - rect.left) * (canvas.width / rect.width), y: (evt.clientY - rect.top) * (canvas.height / rect.height) };
    }

    function armBox(p) {
      mode = 'box';
      tapStart = null;
      game.camera.dragging = false;
      game.boxRect = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    }

    function onDown(evt) {
      canvas.setPointerCapture(evt.pointerId);
      const p = toCanvasPx(evt);
      pointers.set(evt.pointerId, p);
      if (pointers.size === 1) {
        if (evt.shiftKey || evt.ctrlKey || game.boxSelect) {
          armBox(p);
          return;
        }
        mode = 'pan';
        panLast = p;
        tapStart = { x: p.x, y: p.y, t: performance.now(), id: evt.pointerId };
        game.camera.dragging = true;
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          if (pointers.size === 1 && tapStart) armBox(tapStart);
        }, 430);
      } else if (pointers.size === 2) {
        mode = 'pinch';
        tapStart = null;
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        game.boxRect = null;
        const pts = [...pointers.values()];
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        pinchStartZoom = game.camera.zoom;
      }
    }

    function onMove(evt) {
      if (!pointers.has(evt.pointerId)) return;
      const p = toCanvasPx(evt);
      pointers.set(evt.pointerId, p);

      if (mode === 'box' && game.boxRect) {
        game.boxRect.x1 = p.x; game.boxRect.y1 = p.y;
        return;
      }
      if (mode === 'pan' && pointers.size === 1) {
        const dx = p.x - panLast.x, dy = p.y - panLast.y;
        panLast = p;
        const zoom = game.camera.zoom * dpr();
        game.camera.x -= dx / zoom;
        game.camera.y -= dy / zoom;
        game.camera.targetX = game.camera.x; game.camera.targetY = game.camera.y;
        R.clampCamera(game);
        if (CM.guide && (Math.abs(dx) + Math.abs(dy) > 2)) CM.guide.note(game, 'pan');
        if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > TAP_MOVE_THRESHOLD) {
          tapStart = null;
          if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        }
      } else if (mode === 'pinch' && pointers.size === 2) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const z = K.clamp(pinchStartZoom * (dist / pinchStartDist), R.ZOOM_MIN, R.ZOOM_MAX);
        game.camera.zoom = z; game.camera.targetZoom = z;
      }
    }

    function onUp(evt) {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      const wasTap = tapStart && tapStart.id === evt.pointerId
        && (performance.now() - tapStart.t) < TAP_MAX_DURATION;
      pointers.delete(evt.pointerId);

      if (mode === 'box' && game.boxRect) {
        const r = game.boxRect;
        const a = R.screenToWorld(game, canvas, r.x0, r.y0);
        const b = R.screenToWorld(game, canvas, r.x1, r.y1);
        const n = CM.orders ? CM.orders.selectInBox(game, a.x, a.y, b.x, b.y, game.viewDepth || 0) : 0;
        game.boxRect = null;
        game.boxSelect = false;
        if (n && CM.ui.renderSelection) {
          CM.ui.renderSelection(game);
          if (CM.ui.renderOrderBar) CM.ui.renderOrderBar(game);
        }
      } else if (wasTap) {
        game._shiftQueue = !!(evt.shiftKey);
        handleTap(tapStart.x, tapStart.y);
        game._shiftQueue = false;
      }

      if (pointers.size === 0) {
        mode = null; game.camera.dragging = false; tapStart = null;
      } else if (pointers.size === 1) {
        mode = 'pan';
        panLast = [...pointers.values()][0];
        tapStart = null;
      }
    }

    function handleTap(x, y) {
      /* Build mode short-circuits every other hit test. Otherwise a tap
       * aimed at open ground that happens to land near an organism selects
       * it instead of siting the chamber, and the player is left tapping a
       * crowded area wondering why nothing is being built. While the banner
       * says "tap the ground", a tap has to mean exactly that. */
      if (game.buildMode) {
        handlers.onTapEmpty && handlers.onTapEmpty(R.screenToWorld(game, canvas, x, y));
        return;
      }
      const org = hitTestOrganism(game, canvas, x, y);
      if (org) {
        const now = performance.now();
        if (lastTap && lastTap.orgId === org.id && now - lastTap.t < 380 && org.ownerId === 'player' && CM.orders) {
          CM.orders.selectNearby(game, org, 11);
          if (CM.ui.renderSelection) { CM.ui.renderSelection(game); if (CM.ui.renderOrderBar) CM.ui.renderOrderBar(game); }
          lastTap = null;
          return;
        }
        lastTap = { t: now, orgId: org.id };
        handlers.onSelectOrganism && handlers.onSelectOrganism(org);
        return;
      }
      const site = hitTestStructure(game, canvas, x, y);
      if (site) { handlers.onTapStructure && handlers.onTapStructure(site); return; }
      const sample = hitTestSample(game, canvas, x, y);
      if (sample) { handlers.onTapSample && handlers.onTapSample(sample); return; }
      const core = hitTestCore(game, canvas, x, y);
      if (core) { handlers.onTapCore && handlers.onTapCore(); return; }
      handlers.onTapEmpty && handlers.onTapEmpty(R.screenToWorld(game, canvas, x, y));
    }

    canvas.addEventListener('pointerdown', evt => { game.pointerDown = true; onDown(evt); }, { passive: true });
    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerup', evt => { game.pointerDown = false; onUp(evt); }, { passive: true });
    canvas.addEventListener('pointercancel', evt => { game.pointerDown = false; onUp(evt); }, { passive: true });
    canvas.addEventListener('wheel', evt => {
      evt.preventDefault();
      zoomBy(game, evt.deltaY < 0 ? 1.12 : 0.89);
    }, { passive: false });

    window.addEventListener('keydown', evt => {
      if (!game || evt.target && /input|textarea|select/i.test(evt.target.tagName)) return;
      const k = evt.key.toLowerCase();
      if (game.hero) game.hero.shift = evt.shiftKey;
      if (CM.hero && game.hero && game.hero.on) {
        if (k === 'tab') { evt.preventDefault(); CM.hero.onKey(game, 'tab', true); if (CM.ui.renderHero) CM.ui.renderHero(game); return; }
        if (CM.hero.onKey(game, k === 'enter' ? 'enter' : (evt.key === 'Escape' ? 'escape' : k), true)) {
          if (k === ' ') evt.preventDefault();
          if (CM.ui.renderHero) CM.ui.renderHero(game);
          if (CM.ui.renderSelection) CM.ui.renderSelection(game);
          return;
        }
      }
      if (k === 'enter' && game.selection && game.byId[game.selection]) {
        if (CM.hero) CM.hero.enter(game, game.byId[game.selection]);
        if (CM.ui.renderHero) CM.ui.renderHero(game);
        if (CM.ui.renderSelection) CM.ui.renderSelection(game);
        return;
      }
      if (k === ' ' || evt.code === 'Space') { game.thoughtHold = true; evt.preventDefault(); return; }
      if (k === 'escape') {
        if (game.hero && game.hero.on && CM.hero) { CM.hero.exit(game); if (CM.ui.renderHero) CM.ui.renderHero(game); return; }
        CM.coremind.selectOrganism(game, null); CM.ui.renderSelection(game); return;
      }
      if (k === 'u') {
        game.showAura = !game.showAura;
        if (CM.progress) CM.progress.note(game, 'weather');
        if (CM.guide) CM.guide.note(game, 'weather');
        if (CM.ui.renderLayerCard) CM.ui.renderLayerCard(game);
        return;
      }
      if (k === 'o') {
        game.peel = game.peel === false;
        if (CM.ui.renderLayerCard) CM.ui.renderLayerCard(game);
        return;
      }
      if (k === 'k') {
        game.senseSight = !game.senseSight;
        if (CM.ui.renderLayerCard) CM.ui.renderLayerCard(game);
        return;
      }
      if (!CM.orders) return;
      if (k === 'a') CM.orders.setMode(game, evt.shiftKey ? 'ATTACK_MOVE' : 'ATTACK');
      else if (k === 'm') CM.orders.setMode(game, 'MOVE');
      else if (k === 'h') CM.orders.setMode(game, 'HOLD');
      else if (k === 's') CM.orders.setMode(game, 'STOP');
      else if (k === 'g') CM.orders.setMode(game, 'GARRISON');
      else if (k === 'p') CM.orders.setMode(game, 'PATROL');
      else if (k === 'r') CM.orders.setMode(game, 'RETREAT');
      else if (k === 'q') { game.queueOrders = !game.queueOrders; }
      else if (k === 'v') { game.showInfluence = !game.showInfluence; }
      else if (k === 'f') { game.followSelection = !game.followSelection; }
      else if (k === 'b') { game.boxSelect = !game.boxSelect; }
      else if (k === 'e') { CM.orders.selectAllOnLayer(game); }
      else if (k >= '1' && k <= '6') {
        if (evt.ctrlKey || evt.metaKey) CM.orders.assignGroup(game, parseInt(k, 10));
        else CM.orders.recallGroup(game, parseInt(k, 10));
      } else return;
      if (CM.ui.renderSelection) CM.ui.renderSelection(game);
      if (CM.ui.renderOrderBar) CM.ui.renderOrderBar(game);
    });
    window.addEventListener('keyup', evt => {
      if (!game) return;
      if (evt.key === ' ' || evt.code === 'Space') game.thoughtHold = false;
      if (CM.hero && game.hero && game.hero.on) CM.hero.onKey(game, evt.key.toLowerCase(), false);
    });
  }

  CM.input = { attach, zoomBy, focusCore, hitTestOrganism, hitTestSample, hitTestCore, hitTestStructure, structureHittable };
})(window.CM = window.CM || {});
