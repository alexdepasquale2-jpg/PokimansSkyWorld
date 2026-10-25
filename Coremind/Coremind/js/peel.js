/* Coremind — the peel. The underground is a body you peel, not a menu
 * of floors. Two ghost strata hang off the one you inhabit so three
 * depths are one picture: the well below, the room you stand in, the
 * ceiling you have not yet cut.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const MAX_DEPTH = 10;
  const SPINE = {
    SHAFT: true, DESCENT: true, WELL: true, GALLERY: true, CLEFT: true,
    CHASM: true, MANTLE: true, ABYSS: true, GATE: true, NEXUS: true
  };

  function enabled(game) {
    return game.peel !== false && (game.viewDepth || 0) >= 1;
  }

  function offsets(dpr) {
    dpr = dpr || 1;
    return {
      below: { scale: 1.07, dy: 14 * dpr, alpha: 0.28 },
      above: { scale: 0.93, dy: -12 * dpr, alpha: 0.22 }
    };
  }

  /* Same contract as render.worldToScreenDpr at delta 0. Ghost layers
   * scale around the screen centre and shift so the stack reads as one
   * body rather than three maps. */
  function project(game, w, h, zoom, dpr, x, y, layerDelta) {
    const sx = (x - game.camera.x) * zoom + w / 2;
    const sy = (y - game.camera.y) * zoom + h / 2;
    if (layerDelta === 0) return { x: sx, y: sy };
    const off = offsets(dpr);
    const pack = layerDelta < 0 ? off.below : off.above;
    const cx = w / 2, cy = h / 2;
    return {
      x: cx + (sx - cx) * pack.scale,
      y: cy + (sy - cy) * pack.scale + pack.dy
    };
  }

  /* A well is the spine at one xy, drawn through the three projected
   * centres. That is how the stack reads as one body. */
  function drawWells(game, ctx, w, h, zoom, dpr, depth) {
    if (!ctx || !enabled(game) || !CM.structures) return;
    const list = CM.structures.all(game);
    ctx.save();
    ctx.strokeStyle = 'rgba(201,162,39,0.7)';
    ctx.fillStyle = 'rgba(201,162,39,0.7)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    for (let i = 0; i < list.length; i++) {
      const site = list[i];
      if (!site.done || !SPINE[site.type] || site.depth !== depth) continue;
      const a = (depth - 1) >= 1
        ? project(game, w, h, zoom, dpr, site.x, site.y, -1)
        : null;
      const b = project(game, w, h, zoom, dpr, site.x, site.y, 0);
      const c = (depth + 1) <= MAX_DEPTH
        ? project(game, w, h, zoom, dpr, site.x, site.y, 1)
        : null;
      ctx.beginPath();
      if (a) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (c) ctx.lineTo(c.x, c.y);
      } else {
        ctx.moveTo(b.x, b.y);
        if (c) ctx.lineTo(c.x, c.y);
      }
      if (a || c) ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Surface only — callers use this at viewDepth 0. A finished Access
   * Shaft is a wound: a dark ellipse, and if peel is on, a 0.4 glimpse of
   * any Layer-1 chamber that shares the shaft xy. The glimpse is not selectable. */
  function drawWound(game, ctx, w, h, zoom, dpr) {
    if (!game || !ctx || !CM.structures) return;
    const list = CM.structures.all(game);
    const peelOn = game.peel !== false;
    ctx.save();
    ctx.setLineDash([]);
    for (let i = 0; i < list.length; i++) {
      const site = list[i];
      if (!site.done || site.type !== 'SHAFT' || site.depth !== 1) continue;
      const p = project(game, w, h, zoom, dpr, site.x, site.y, 0);
      const r = ((CM.structures.radiusOf ? CM.structures.radiusOf(site) : 6)) * zoom;
      const rx = r, ry = r * 0.68;
      ctx.fillStyle = 'rgba(4,8,13,0.72)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!peelOn) continue;
      ctx.strokeStyle = 'rgba(139,172,15,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Glimpse of a Layer-1 chamber ring at the same xy (not the shaft itself).
      for (let j = 0; j < list.length; j++) {
        const room = list[j];
        if (!room.done || room.depth !== 1 || room.type === 'SHAFT') continue;
        if (room.x !== site.x || room.y !== site.y) continue;
        const rr = ((CM.structures.radiusOf ? CM.structures.radiusOf(room) : 6)) * zoom;
        ctx.strokeStyle = 'rgba(139,172,15,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rr, rr * 0.68, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function layersToDraw(game) {
    if (!enabled(game)) return [{ depth: game.viewDepth || 0, delta: 0, alpha: 1 }];
    const d = game.viewDepth;
    const off = offsets(1);
    const out = [];
    if ((d - 1) >= 1) out.push({ depth: d - 1, delta: -1, alpha: off.below.alpha });
    out.push({ depth: d, delta: 0, alpha: 1 });
    if ((d + 1) <= MAX_DEPTH) {
      const open = !CM.layers || !CM.layers.viewOpen || CM.layers.viewOpen(game, d + 1);
      if (open) out.push({ depth: d + 1, delta: 1, alpha: off.above.alpha });
    }
    return out;
  }

  CM.peel = {
    enabled, offsets, project, drawWells, drawWound, layersToDraw
  };
})(window.CM = window.CM || {});
