/* DoomSpire — the renderer and the touch input, and nothing else.
 *
 * The renderer is deliberately the simplest raycaster that still reads as
 * Doom: vertical-strip DDA walls in one flat colour per wall type, shaded by
 * side and by distance, no textures. Floor and ceiling are cheap horizontal
 * bands rather than per-pixel casting. Sprites are a coloured disc and an
 * emoji glyph, billboarded and depth-tested against the wall the ray behind
 * them actually hit. That is the whole trick; everything else in the game
 * is the MMO sitting on top of it.
 */
(function (DS) {
  'use strict';
  const C = DS.core;
  const FOV = 1.15; // ~66 degrees, classic Doom-ish field of view

  function wallColorFor(cellVal, palette) {
    return cellVal === 2 ? palette.wall2 : palette.wall1;
  }
  function shade(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = C.clamp(Math.round(r * factor), 0, 255);
    g = C.clamp(Math.round(g * factor), 0, 255);
    b = C.clamp(Math.round(b * factor), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  /* Casts every column, draws floor/ceiling/walls straight to ctx, and
   * returns the per-column depth buffer sprites are tested against. */
  function castWalls(ctx, W, H, zone, player) {
    const grid = zone.grid, pal = zone.palette;
    const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    const planeLen = Math.tan(FOV / 2);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;
    const zbuffer = new Float32Array(W);
    const half = H / 2;

    // Floor and ceiling: cheap distance-shaded horizontal bands.
    ctx.fillStyle = pal.ceil; ctx.fillRect(0, 0, W, half);
    ctx.fillStyle = pal.floor; ctx.fillRect(0, half, W, half);
    const bandStep = Math.max(2, Math.floor(H / 90));
    for (let y = half; y < H; y += bandStep) {
      const rowDist = half / (y - half + 1) * 0.9;
      const f = C.clamp(1.15 - rowDist * 0.10, 0.18, 1.0);
      ctx.fillStyle = shade(pal.floor, f);
      ctx.fillRect(0, y, W, bandStep);
      const cy = H - y - bandStep;
      ctx.fillStyle = shade(pal.ceil, f * 0.85);
      ctx.fillRect(0, Math.max(0, cy), W, bandStep);
    }

    for (let x = 0; x < W; x++) {
      const cameraX = (2 * x) / W - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;
      let mapX = Math.floor(player.x), mapY = Math.floor(player.y);
      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
      let stepX, stepY, sideDistX, sideDistY;
      if (rayDirX < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
      else { stepX = 1; sideDistX = (mapX + 1 - player.x) * deltaDistX; }
      if (rayDirY < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
      else { stepY = 1; sideDistY = (mapY + 1 - player.y) * deltaDistY; }

      let side = 0, hitVal = 1, steps = 0;
      while (steps++ < 256) {
        if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
        else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= grid.w || mapY >= grid.h) { hitVal = 1; break; }
        const v = grid.cells[mapY][mapX];
        if (v !== 0) { hitVal = v; break; }
      }
      const perp = side === 0 ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY);
      const dist = Math.max(0.05, perp);
      zbuffer[x] = dist;
      const lineH = Math.min(H * 4, H / dist);
      const drawStart = Math.max(0, half - lineH / 2);
      const drawEnd = Math.min(H, half + lineH / 2);
      const fog = C.clamp(1 - dist / 16, 0.12, 1);
      const sideShade = side === 1 ? 0.72 : 1.0;
      ctx.fillStyle = shade(wallColorFor(hitVal, pal), fog * sideShade);
      ctx.fillRect(x, drawStart, 1, Math.max(1, drawEnd - drawStart));
    }
    return zbuffer;
  }

  /* Projects a world point into screen space against the same camera used
   * for the walls this frame, so sprites and nameplates line up. */
  function project(player, W, H, ex, ey) {
    const dirX = Math.cos(player.angle), dirY = Math.sin(player.angle);
    const planeLen = Math.tan(FOV / 2);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;
    const sx = ex - player.x, sy = ey - player.y;
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const tx = invDet * (dirY * sx - dirX * sy);
    const ty = invDet * (-planeY * sx + planeX * sy);
    if (ty <= 0.05) return { visible: false, depth: ty };
    const screenX = (W / 2) * (1 + tx / ty);
    const scale = H / ty;
    return { visible: true, depth: ty, screenX, scale };
  }

  /* Draws one billboard: a team-coloured disc with an emoji glyph on it,
   * clipped by the wall depth buffer at its own screen column.
   * Supports animation via opts.anim: { frame: 0-3, kind: 'attack'|'cast'|'heal'|'idle', scale: 1.0, color: '#...' } */
  function drawSprite(ctx, W, H, zbuffer, proj, opts) {
    if (!proj.visible) return;
    const col = C.clamp(Math.floor(proj.screenX), 0, W - 1);
    if (proj.depth > zbuffer[col] + 0.15) return;
    const size = C.clamp(proj.scale * (opts.height || 0.9), 4, H * 1.4);
    const cy = H / 2 + H / 2 - size * (opts.footOffset != null ? opts.footOffset : 0.5);
    const top = cy - size;
    if (proj.screenX < -size || proj.screenX > W + size) return;

    const anim = opts.anim || {};
    const animScale = anim.scale || 1.0;
    const animKind = anim.kind || 'idle';

    ctx.save();
    ctx.globalAlpha = 0.92;

    // Ring effect: pulse during cast, glow during attack, heal color
    let ringColor = opts.ring || '#c0392b';
    if (animKind === 'cast') {
      const pulse = 0.5 + Math.sin(anim.frame * 0.8) * 0.5;
      ctx.globalAlpha = 0.7 + pulse * 0.25;
      ringColor = anim.color || `rgba(255, 180, 50, ${0.7 + pulse * 0.3})`;
    } else if (animKind === 'heal') {
      const pulse = 0.5 + Math.sin(anim.frame * 1.0) * 0.5;
      ctx.globalAlpha = 0.75 + pulse * 0.2;
      ringColor = anim.color || `rgba(100, 220, 120, ${0.75 + pulse * 0.25})`;
    } else if (animKind === 'attack') {
      ctx.globalAlpha = 0.92 + Math.sin(anim.frame * 1.2) * 0.08;
    } else if (animKind === 'walk') {
      ctx.globalAlpha = 0.88;
    }

    ctx.fillStyle = ringColor;
    const ringScale = animKind === 'attack' ? animScale : 1.0;
    ctx.beginPath();
    ctx.ellipse(proj.screenX, cy - size * 0.5, size * 0.42 * ringScale, size * 0.5 * ringScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw expanding rings during cast/heal for effect
    if ((animKind === 'cast' || animKind === 'heal') && anim.frame > 0) {
      ctx.globalAlpha = 0.25;
      const outerScale = 1.0 + anim.frame * 0.2;
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = Math.max(0.5, size * 0.02);
      ctx.beginPath();
      ctx.ellipse(proj.screenX, cy - size * 0.5, size * 0.42 * outerScale, size * 0.5 * outerScale, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.font = `${Math.max(8, size * 0.62)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Rotate emoji during attack animation
    let icon = opts.icon || '?';
    if (animKind === 'attack' && anim.frame > 0) {
      ctx.save();
      ctx.translate(proj.screenX, cy - size * 0.52);
      ctx.rotate((anim.frame * 0.5) * Math.PI);
      ctx.fillText(icon, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(icon, proj.screenX, cy - size * 0.52);
    }

    ctx.restore();
    return { screenX: proj.screenX, top, size, cy };
  }

  function minimap(ctx, canvas, zone, player, entities) {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6,10,18,0.72)';
    ctx.fillRect(0, 0, W, H);
    const grid = zone.grid;
    const range = 11; // world units shown across the minimap
    const scale = W / (range * 2);
    const px = player.x, py = player.y;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-player.angle + Math.PI / 2);
    const x0 = Math.max(0, Math.floor(px - range)), x1 = Math.min(grid.w - 1, Math.ceil(px + range));
    const y0 = Math.max(0, Math.floor(py - range)), y1 = Math.min(grid.h - 1, Math.ceil(py + range));
    ctx.fillStyle = 'rgba(220,230,247,0.16)';
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (grid.cells[y][x] === 0) ctx.fillRect((x - px) * scale, (y - py) * scale, scale + 1, scale + 1);
    }
    (entities || []).forEach(e => {
      ctx.fillStyle = e.color || '#e0655a';
      ctx.beginPath();
      ctx.arc((e.x - px) * scale, (e.y - py) * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    ctx.fillStyle = '#79c07a';
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2 - 6); ctx.lineTo(W / 2 - 5, H / 2 + 5); ctx.lineTo(W / 2 + 5, H / 2 + 5);
    ctx.closePath(); ctx.fill();
  }

  // --- input: left move-stick, right-side drag-to-look, keyboard fallback ---
  function makeInput(els) {
    const st = {
      moveX: 0, moveY: 0, turnDelta: 0, keys: {},
      touches: {} // pointerId -> {kind:'stick'|'look', ...}
    };
    const stick = els.stick, knob = els.knob, stage = els.stage;
    let stickCenter = null;

    function stickStart(id, x, y) {
      const r = stick.getBoundingClientRect();
      stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      st.touches[id] = { kind: 'stick' };
      stickMove(id, x, y);
    }
    function stickMove(id, x, y) {
      if (!stickCenter) return;
      const maxR = 42;
      let dx = x - stickCenter.x, dy = y - stickCenter.y;
      const d = Math.hypot(dx, dy) || 1;
      const clampD = Math.min(maxR, d);
      dx = (dx / d) * clampD; dy = (dy / d) * clampD;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      st.moveX = dx / maxR; st.moveY = dy / maxR;
    }
    function stickEnd() {
      st.moveX = 0; st.moveY = 0;
      knob.style.transform = 'translate(0,0)';
    }

    stage.addEventListener('pointerdown', ev => {
      const stickBox = stick.getBoundingClientRect();
      const inStick = ev.clientX >= stickBox.left - 24 && ev.clientX <= stickBox.right + 24 &&
        ev.clientY >= stickBox.top - 24 && ev.clientY <= stickBox.bottom + 24;
      if (ev.target.closest('button') || ev.target.closest('.panel')) return;
      if (inStick) { stickStart(ev.pointerId, ev.clientX, ev.clientY); }
      else { st.touches[ev.pointerId] = { kind: 'look', lastX: ev.clientX, lastY: ev.clientY }; }
      ev.target.setPointerCapture && ev.target.setPointerCapture(ev.pointerId);
    });
    stage.addEventListener('pointermove', ev => {
      const t = st.touches[ev.pointerId];
      if (!t) return;
      if (t.kind === 'stick') stickMove(ev.pointerId, ev.clientX, ev.clientY);
      else {
        st.turnDelta += (ev.clientX - t.lastX) * 0.0062;
        t.lastX = ev.clientX; t.lastY = ev.clientY;
      }
    });
    function endTouch(ev) {
      const t = st.touches[ev.pointerId];
      if (t && t.kind === 'stick') stickEnd();
      delete st.touches[ev.pointerId];
    }
    stage.addEventListener('pointerup', endTouch);
    stage.addEventListener('pointercancel', endTouch);

    window.addEventListener('keydown', e => { st.keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', e => { st.keys[e.key.toLowerCase()] = false; });

    function frameAxes() {
      let mx = st.moveX, my = st.moveY, turn = st.turnDelta;
      st.turnDelta = 0;
      if (st.keys['w']) my = -1; if (st.keys['s']) my = 1;
      if (st.keys['a']) mx = -1; if (st.keys['d']) mx = 1;
      if (st.keys['arrowleft'] || st.keys['q']) turn -= 0.045;
      if (st.keys['arrowright'] || st.keys['e']) turn += 0.045;
      return { mx, my, turn };
    }
    return Object.assign(st, { frameAxes });
  }

  DS.engine = { FOV, castWalls, project, drawSprite, minimap, makeInput };
})(window.DS = window.DS || {});
