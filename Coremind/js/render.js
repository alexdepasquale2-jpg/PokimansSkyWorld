/* Coremind — camera + rendering. Terrain is baked once into an offscreen
 * canvas (1 pixel per world cell) and blitted with a single drawImage per
 * frame regardless of zoom level; only organisms/samples/Core are drawn as
 * individual shapes, and only the ones inside the viewport (+ a margin).
 */
(function (CM) {
  'use strict';
  const K = CM.core;
  const W = CM.world;
  const T = CM.traits;

  const ZOOM_MIN = 5, ZOOM_MAX = 46;
  const CAM_EASE = 6.5; // per-second convergence rate toward the camera target

  const BIOME_COLOR = {
    [W.BIOME.WATER]: [26, 61, 92],
    [W.BIOME.SOIL]: [90, 68, 48],
    [W.BIOME.ROCK]: [78, 80, 84]
  };

  function buildTerrainCache(world) {
    const size = world.size;
    const canvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const p = i * 4;
        const b = world.biome[i];
        let rgb;
        if (b === W.BIOME.GRASS) {
          const lush = K.clamp01(world.food[i] / Math.max(1, world.foodCap[i]));
          const t = K.clamp01(K.invLerp(-4, 30, world.temp[i]));
          const g1 = [107, 66, 38], g2 = [63, 138, 58], g3 = [150, 168, 60];
          const cold = [K.lerp(g1[0], g2[0], lush), K.lerp(g1[1], g2[1], lush), K.lerp(g1[2], g2[2], lush)];
          const warm = [K.lerp(g1[0], g3[0], lush), K.lerp(g1[1], g3[1], lush), K.lerp(g1[2], g3[2], lush)];
          rgb = [K.lerp(cold[0], warm[0], t), K.lerp(cold[1], warm[1], t), K.lerp(cold[2], warm[2], t)];
        } else {
          rgb = BIOME_COLOR[b] || [50, 50, 50];
        }
        img.data[p] = rgb[0] | 0; img.data[p + 1] = rgb[1] | 0; img.data[p + 2] = rgb[2] | 0; img.data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function ensureCache(game) {
    if (!game.render) game.render = {};
    if (!game.render.terrainCanvas || game.render.terrainSeed !== game.seed) {
      game.render.terrainCanvas = buildTerrainCache(game.world);
      game.render.terrainSeed = game.seed;
    }
    return game.render.terrainCanvas;
  }

  function resizeCanvas(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    return dpr;
  }

  function clampCamera(game) {
    const c = game.camera, size = game.world.size;
    c.x = K.clamp(c.x, 0, size);
    c.y = K.clamp(c.y, 0, size);
    c.zoom = K.clamp(c.zoom, ZOOM_MIN, ZOOM_MAX);
    if (c.targetZoom != null) c.targetZoom = K.clamp(c.targetZoom, ZOOM_MIN, ZOOM_MAX);
  }

  function focusOn(game, x, y, zoom) {
    const c = game.camera;
    c.targetX = x; c.targetY = y;
    if (zoom != null) c.targetZoom = zoom;
  }

  function updateCamera(game, dt) {
    const c = game.camera;
    if (c.targetX == null) { c.targetX = c.x; c.targetY = c.y; c.targetZoom = c.zoom; }
    if (!c.dragging) {
      const t = 1 - Math.exp(-CAM_EASE * dt);
      c.x = K.lerp(c.x, c.targetX, t);
      c.y = K.lerp(c.y, c.targetY, t);
      c.zoom = K.lerp(c.zoom, c.targetZoom, t);
    }
    clampCamera(game);
  }

  function worldToScreen(game, canvas, wx, wy) {
    const c = game.camera;
    return {
      x: (wx - c.x) * c.zoom + canvas.width / 2,
      y: (wy - c.y) * c.zoom + canvas.height / 2
    };
  }
  function screenToWorld(game, canvas, sx, sy) {
    const c = game.camera;
    return {
      x: (sx - canvas.width / 2) / c.zoom + c.x,
      y: (sy - canvas.height / 2) / c.zoom + c.y
    };
  }

  // -- organism drawing -------------------------------------------------------
  function drawOrganism(ctx, org, sx, sy, zoom, alpha) {
    const size = Math.max(1.5, org.stats.size * 0.075) * zoom;
    const mods = new Set(org.traits.map(id => (T.TRAITS_BY_ID[id] || {}).visual_modifier).filter(Boolean));
    const stretch = mods.has('streamlined') ? 1.5 : mods.has('lean') ? 1.25 : 1;

    // A burrowed organism is drawn as the mound it left behind — it has to be
    // visibly *gone* rather than merely faded, because "the predator can no
    // longer see it" is the entire mechanic.
    if (org.burrowed) {
      ctx.save();
      ctx.fillStyle = 'rgba(74,56,38,.85)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, size * 1.15, size * 0.6, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,14,8,.5)'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(org.heading);

    // camouflage: render translucent to hint that predators struggle to spot it
    if (mods.has('mottled')) ctx.globalAlpha = 0.62;

    // legs / digger limbs, drawn under the body
    if (mods.has('legs') || mods.has('digger')) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = Math.max(1, size * 0.12);
      const n = mods.has('digger') ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1 || 1) - 0.5) * size * 1.6;
        ctx.beginPath(); ctx.moveTo(t, size * 0.55); ctx.lineTo(t * 0.7, size * 1.05); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t, -size * 0.55); ctx.lineTo(t * 0.7, -size * 1.05); ctx.stroke();
      }
    }

    // body
    let bodyColor = org.color;
    if (mods.has('warm_hued')) bodyColor = tint(bodyColor, [40, 10, -10]);
    if (mods.has('cool_hued')) bodyColor = tint(bodyColor, [-15, 5, 35]);
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * stretch, size * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    if (mods.has('shell')) {
      ctx.strokeStyle = 'rgba(20,20,20,.55)';
      ctx.lineWidth = Math.max(1.2, size * 0.22);
      ctx.beginPath(); ctx.ellipse(0, 0, size * stretch * 0.86, size * 0.56, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (mods.has('veined')) {
      ctx.strokeStyle = 'rgba(255,90,90,.5)';
      ctx.lineWidth = Math.max(0.6, size * 0.08);
      ctx.beginPath(); ctx.moveTo(-size * 0.4, 0); ctx.lineTo(size * 0.4, 0); ctx.stroke();
    }

    // head features (front = +x local, since heading rotates toward travel dir)
    if (mods.has('jaws') || mods.has('claws')) {
      ctx.fillStyle = 'rgba(30,20,20,.85)';
      ctx.beginPath();
      ctx.moveTo(size * stretch * 0.85, -size * 0.22);
      ctx.lineTo(size * stretch * 1.35, 0);
      ctx.lineTo(size * stretch * 0.85, size * 0.22);
      ctx.closePath(); ctx.fill();
    }
    if (mods.has('eyes')) {
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(size * stretch * 0.55, -size * 0.28, size * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(size * stretch * 0.55, size * 0.28, size * 0.15, 0, Math.PI * 2); ctx.fill();
    }
    if (mods.has('antennae')) {
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = Math.max(0.6, size * 0.08);
      ctx.beginPath(); ctx.moveTo(size * stretch * 0.6, -size * 0.1); ctx.lineTo(size * stretch * 1.3, -size * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(size * stretch * 0.6, size * 0.1); ctx.lineTo(size * stretch * 1.3, size * 0.55); ctx.stroke();
    }
    if (mods.has('whiskers')) {
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = Math.max(0.5, size * 0.06);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, s * size * 0.6); ctx.lineTo(-size * 0.6, s * size * 1.0); ctx.stroke();
      }
    }
    if (mods.has('venom_glands')) {
      ctx.fillStyle = '#8a3fd1';
      for (const s of [-0.35, 0.35]) { ctx.beginPath(); ctx.arc(-size * 0.15, s * size * 0.55, size * 0.22, 0, Math.PI * 2); ctx.fill(); }
    }
    if (mods.has('acid_sacs')) {
      ctx.fillStyle = '#8fd15a';
      for (const s of [-0.3, 0.3]) { ctx.beginPath(); ctx.arc(-size * 0.25, s * size * 0.5, size * 0.2, 0, Math.PI * 2); ctx.fill(); }
    }
    if (mods.has('brood_sac')) {
      ctx.fillStyle = 'rgba(255,200,220,.85)';
      ctx.beginPath(); ctx.ellipse(-size * 0.95, 0, size * 0.4, size * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();

    if (org.selected) {
      ctx.save();
      ctx.strokeStyle = '#33e6b0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, size * 1.9, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // health bar for anything below 60% — a quiet, constant readout of danger
    const hf = K.clamp01(org.health / org.stats.health);
    if (hf < 0.6) {
      const w = Math.max(10, size * 2.2), h = 3;
      const bx = sx - w / 2, by = sy - size * 1.9 - 6;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = hf < 0.3 ? '#ef5b5b' : '#f2a33c'; ctx.fillRect(bx, by, w * hf, h);
    }
  }

  function tint(hex, delta) {
    const c = hexToRgb(hex);
    return `rgb(${K.clamp(c[0] + delta[0], 0, 255)},${K.clamp(c[1] + delta[1], 0, 255)},${K.clamp(c[2] + delta[2], 0, 255)})`;
  }
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // -- main draw ---------------------------------------------------------
  function draw(game, canvas, ctx) {
    const dpr = resizeCanvas(canvas);
    const w = canvas.width, h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04080d';
    ctx.fillRect(0, 0, w, h);

    const zoom = game.camera.zoom * dpr;
    const size = game.world.size;
    const halfW = w / 2 / zoom, halfH = h / 2 / zoom;
    let sx0 = game.camera.x - halfW, sy0 = game.camera.y - halfH;
    let sx1 = game.camera.x + halfW, sy1 = game.camera.y + halfH;
    const csx0 = K.clamp(sx0, 0, size), csy0 = K.clamp(sy0, 0, size);
    const csx1 = K.clamp(sx1, 0, size), csy1 = K.clamp(sy1, 0, size);

    if (csx1 > csx0 && csy1 > csy0) {
      const cache = ensureCache(game);
      const dx0 = (csx0 - game.camera.x) * zoom + w / 2, dy0 = (csy0 - game.camera.y) * zoom + h / 2;
      const dx1 = (csx1 - game.camera.x) * zoom + w / 2, dy1 = (csy1 - game.camera.y) * zoom + h / 2;
      ctx.imageSmoothingEnabled = zoom < 3;
      ctx.drawImage(cache, csx0, csy0, csx1 - csx0, csy1 - csy0, dx0, dy0, dx1 - dx0, dy1 - dy0);
    }

    // Core
    {
      const p = worldToScreenDpr(game, w, h, zoom, dpr, game.core.x, game.core.y);
      const r = game.core.radius * zoom;
      const pulse = 0.85 + Math.sin(game.simTime * 2) * 0.08;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * pulse);
      grad.addColorStop(0, 'rgba(51,230,176,.55)');
      grad.addColorStop(1, 'rgba(51,230,176,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f2e26';
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4, r * 0.32), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#33e6b0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4, r * 0.32), 0, Math.PI * 2); ctx.stroke();
    }

    // samples
    for (const s of game.discovery.samples) {
      if (s.x < sx0 - 2 || s.x > sx1 + 2 || s.y < sy0 - 2 || s.y > sy1 + 2) continue;
      const p = worldToScreenDpr(game, w, h, zoom, dpr, s.x, s.y);
      const r = Math.max(4, 3.6 * zoom / 12);
      ctx.fillStyle = 'rgba(51,230,176,.85)';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2); ctx.stroke();
    }

    // organisms (viewport-culled)
    const margin = 3;
    for (const org of game.organisms) {
      if (org.x < sx0 - margin || org.x > sx1 + margin || org.y < sy0 - margin || org.y > sy1 + margin) continue;
      const p = worldToScreenDpr(game, w, h, zoom, dpr, org.x, org.y);
      drawOrganism(ctx, org, p.x, p.y, zoom);
    }

    canvas.__dpr = dpr;
  }

  function worldToScreenDpr(game, w, h, zoom, dpr, wx, wy) {
    return { x: (wx - game.camera.x) * zoom + w / 2, y: (wy - game.camera.y) * zoom + h / 2 };
  }

  CM.render = {
    ZOOM_MIN, ZOOM_MAX, ensureCache, resizeCanvas, clampCamera, focusOn, updateCamera,
    worldToScreen, screenToWorld, draw, drawOrganism
  };
})(window.CM = window.CM || {});
