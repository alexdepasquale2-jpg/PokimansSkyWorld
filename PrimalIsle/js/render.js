/* Primal Isle — the canvas.
 *
 * Top-down, procedural, no image assets. The island is baked once into a small
 * offscreen bitmap and scaled up (a phone has no budget for redrawing 17,000
 * terrain cells a frame); everything on top of it — foliage, animals, blood,
 * calls — is drawn live.
 */
(function (ISLE) {
  'use strict';
  const C = ISLE.content;
  const W = ISLE.world;
  const D = ISLE.dino;
  const S = ISLE.store;
  const { clamp, lerp, hash2, dist } = ISLE.core;

  let canvas = null, ctx = null, dpr = 1;
  let cssW = 380, cssH = 700;
  let cam = { x: 0, y: 0, z: 1 };
  let terrain = null, terrainSeed = -1;
  let t = 0;
  let shake = 0;

  const SHAPE = {
    velox: 'raptor', duskclaw: 'raptor', fernback: 'duck', gorehorn: 'horn',
    marshjaw: 'sail', tyrant: 'rex', ivory: 'long'
  };

  function attach(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  }

  function resize() {
    if (!canvas) return;
    const box = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(280, box.width);
    cssH = Math.max(360, box.height);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }

  /* --- the island bitmap ------------------------------------------------ */
  const TPX = 4;                        // pixels per biome cell in the bake
  function bake(world) {
    const n = W.GN;
    const cv = document.createElement('canvas');
    cv.width = n * TPX; cv.height = n * TPX;
    const c = cv.getContext('2d');
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const b = C.BIOMES[W.biomeIdAt(world, gx * W.CELL + 1, gy * W.CELL + 1)];
        const j = (hash2(world.seed, gx, gy) - 0.5) * 16;
        c.fillStyle = shade(b.sand, j);
        c.fillRect(gx * TPX, gy * TPX, TPX, TPX);
      }
    }
    terrain = cv;
    terrainSeed = world.seed;
  }

  function shade(hex, delta) {
    const r = clamp(parseInt(hex.slice(1, 3), 16) + delta, 0, 255) | 0;
    const g = clamp(parseInt(hex.slice(3, 5), 16) + delta, 0, 255) | 0;
    const b = clamp(parseInt(hex.slice(5, 7), 16) + delta, 0, 255) | 0;
    return `rgb(${r},${g},${b})`;
  }

  // --- camera -------------------------------------------------------------
  function follow(g, dt) {
    const p = g.player;
    const target = p || { x: g.world.cx, y: g.world.cy, growth: 0.5 };
    // Grown animals see further. It feels like power and it is also mercy.
    const view = 620 + 620 * (target.growth || 0.2);
    const z = Math.min(cssH / view, cssW / (view * 0.62));
    cam.z = lerp(cam.z, z, Math.min(1, dt * 3));
    cam.x = lerp(cam.x, target.x, Math.min(1, dt * 7));
    cam.y = lerp(cam.y, target.y, Math.min(1, dt * 7));
  }

  const sx = x => (x - cam.x) * cam.z + cssW / 2;
  const sy = y => (y - cam.y) * cam.z + cssH / 2;
  function toWorld(px, py) {
    return { x: (px - cssW / 2) / cam.z + cam.x, y: (py - cssH / 2) / cam.z + cam.y };
  }

  // --- frame --------------------------------------------------------------
  function frame(g, dt) {
    if (!ctx) return;
    t += dt;
    if (terrainSeed !== g.world.seed) bake(g.world);
    follow(g, dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (shake > 0) {
      shake = Math.max(0, shake - dt * 2.6);
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
    }

    drawTerrain(g);
    drawDetail(g);
    drawNodes(g);
    drawCarcasses(g);
    drawCalls(g);

    const list = g.dinos.filter(d => inView(d.x, d.y, 120));
    list.sort((a, b) => a.y - b.y);
    for (const d of list) drawDino(g, d);

    drawNight(g);
    drawOffscreenMarkers(g);

    if (shake > 0) ctx.restore();
    if (g.ui.hitFlash > 0) {
      g.ui.hitFlash -= dt;
      ctx.fillStyle = `rgba(255,90,80,${clamp(g.ui.hitFlash * 1.4, 0, 0.4)})`;
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }

  function inView(x, y, pad) {
    const px = sx(x), py = sy(y);
    pad = pad || 60;
    return px > -pad && px < cssW + pad && py > -pad && py < cssH + pad;
  }

  function drawTerrain(g) {
    const size = W.GN * W.CELL;
    ctx.fillStyle = '#12293b';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(terrain, sx(0), sy(0), size * cam.z, size * cam.z);
  }

  /* Foliage and rocks, placed deterministically per detail cell so they never
   * swim about between frames. */
  const DET = 58;
  function drawDetail(g) {
    const w = g.world;
    const x0 = Math.floor((cam.x - cssW / 2 / cam.z) / DET) - 1;
    const x1 = Math.ceil((cam.x + cssW / 2 / cam.z) / DET) + 1;
    const y0 = Math.floor((cam.y - cssH / 2 / cam.z) / DET) - 1;
    const y1 = Math.ceil((cam.y + cssH / 2 / cam.z) / DET) + 1;
    const z = cam.z;

    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const h = hash2(w.seed + 31, gx, gy);
        const wx = gx * DET + h * DET, wy = gy * DET + hash2(w.seed + 57, gx, gy) * DET;
        const bid = W.biomeIdAt(w, wx, wy);
        const px = sx(wx), py = sy(wy);

        if (bid === 'forest') {
          if (h > 0.34) tree(px, py, (10 + h * 9) * z, h);
        } else if (bid === 'plains') {
          if (h > 0.72) tuft(px, py, 7 * z, '#7d9450');
        } else if (bid === 'swamp') {
          if (h > 0.58) tuft(px, py, 8 * z, '#6a7a45');
        } else if (bid === 'highland') {
          if (h > 0.76) rock(px, py, (7 + h * 8) * z);
        } else if (bid === 'beach') {
          if (h > 0.93) rock(px, py, 4 * z);
        } else if (bid === 'river' || bid === 'lake' || bid === 'shallow') {
          if (h > 0.8) ripple(px, py, 9 * z, h);
        }
      }
    }
  }

  function tree(x, y, r, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x + r * 0.25, y + r * 0.4, r * 0.9, r * 0.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = h > 0.7 ? '#2f4a2a' : '#37552f';
    ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, 7); ctx.fill();
    ctx.fillStyle = h > 0.7 ? '#3d5c33' : '#456b3a';
    ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.22, r * 0.5, 0, 7); ctx.fill();
  }
  function tuft(x, y, r, col) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, r * 0.16); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(x + i * r * 0.3, y);
      ctx.lineTo(x + i * r * 0.42, y - r * (0.7 + i * 0.1));
    }
    ctx.stroke();
  }
  function rock(x, y, r) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + r * 0.3, r, r * 0.45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#8d8d80';
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.85, r * 0.62, 0.4, 0, 7); ctx.fill();
  }
  function ripple(x, y, r, h) {
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1.2;
    const p = (t * 0.6 + h) % 1;
    ctx.beginPath(); ctx.ellipse(x, y, r * (0.4 + p), r * (0.18 + p * 0.4), 0, 0, 7); ctx.stroke();
  }

  function drawNodes(g) {
    for (const n of g.world.nodes) {
      if (n.amt < 0.25) continue;
      if (!inView(n.x, n.y, 30)) continue;
      const px = sx(n.x), py = sy(n.y), z = cam.z;
      if (n.kind === 'plant') {
        const def = C.PLANTS[n.type];
        ctx.fillStyle = def.color;
        const r = (5 + def.food * 0.09) * z;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * 6.28 + n.seedv;
          ctx.beginPath();
          ctx.ellipse(px + Math.cos(a) * r * 0.5, py + Math.sin(a) * r * 0.35, r * 0.55, r * 0.3, a, 0, 7);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = n.type === 'fish' ? '#8fb8c9' : n.type === 'egg' ? '#e8dfc6' : '#b58f5e';
        const wob = Math.sin(t * 3 + n.seedv) * 2 * z;
        ctx.beginPath();
        ctx.ellipse(px + wob, py, 4.2 * z, 2.8 * z, 0, 0, 7);
        ctx.fill();
      }
    }
  }

  function drawCarcasses(g) {
    for (const c of g.carcasses) {
      if (!inView(c.x, c.y, 60)) continue;
      const px = sx(c.x), py = sy(c.y), z = cam.z;
      const r = C.SPECIES[c.sp].size * C.sizeScale(c.growth) * z;
      const rot = clamp(c.age / C.CARCASS_ROT, 0, 1);
      ctx.fillStyle = `rgba(${lerp(120, 70, rot) | 0},${lerp(40, 60, rot) | 0},${lerp(40, 55, rot) | 0},0.92)`;
      ctx.beginPath(); ctx.ellipse(px, py, r * 1.1, r * 0.55, 0.4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(230,220,210,0.5)'; ctx.lineWidth = Math.max(1, r * 0.1);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px - r * 0.6 + i * r * 0.5, py - r * 0.3);
        ctx.lineTo(px - r * 0.4 + i * r * 0.5, py + r * 0.3);
        ctx.stroke();
      }
      if (c.age < 6) {
        ctx.fillStyle = `rgba(150,20,20,${0.5 * (1 - c.age / 6)})`;
        ctx.beginPath(); ctx.arc(px, py, r * 1.8, 0, 7); ctx.fill();
      }
    }
  }

  function drawCalls(g) {
    for (const c of g.calls) {
      const p = c.t / 2.2;
      const r = c.r * p * cam.z;
      ctx.strokeStyle = c.type === 'distress' ? `rgba(255,120,110,${0.5 * (1 - p)})`
        : c.type === 'group' ? `rgba(140,220,160,${0.5 * (1 - p)})`
          : `rgba(230,220,180,${0.42 * (1 - p)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(sx(c.x), sy(c.y), r, 0, 7); ctx.stroke();
    }
  }

  // --- animals ------------------------------------------------------------
  function drawDino(g, d) {
    const sp = D.species(d);
    const px = sx(d.x), py = sy(d.y);
    const r = D.radius(d) * cam.z;
    const step = Math.sin(t * (6 + d.speed * 0.06) + d.id.length) * clamp(d.speed / 60, 0, 1);
    const skin = d.skin ? S.SKINS[d.skin] : null;
    const body = skin ? mix(sp.color, skin.tint, 0.55) : sp.color;
    const dark = skin ? mix(sp.color2, skin.tint, 0.35) : sp.color2;

    ctx.save();
    ctx.translate(px, py);

    // Shadow first, on the ground plane.
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.34, r * 1.05, r * 0.42, 0, 0, 7); ctx.fill();

    ctx.rotate(d.ang);
    const shape = SHAPE[d.sp] || 'raptor';
    silhouette(shape, r, body, dark, step, d);
    ctx.restore();

    if (skin && skin.edge) {
      ctx.strokeStyle = skin.rarity === 'legendary' ? 'rgba(233,178,58,0.75)' : 'rgba(180,120,220,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, r * 1.3, 0, 7); ctx.stroke();
    }

    drawTag(g, d, px, py, r);
  }

  function silhouette(shape, r, body, dark, step, d) {
    ctx.lineJoin = 'round';
    const legY = r * 0.62;

    // legs
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1.4, r * 0.19);
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, s * legY * 0.5);
      ctx.lineTo(-r * 0.15 + step * r * 0.35 * s, s * legY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * 0.35, s * legY * 0.45);
      ctx.lineTo(r * 0.35 - step * r * 0.35 * s, s * legY * 0.92);
      ctx.stroke();
    }

    // tail
    ctx.strokeStyle = body;
    ctx.lineWidth = Math.max(1.6, r * 0.3);
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, 0);
    const tl = shape === 'long' ? 2.4 : shape === 'raptor' ? 2.0 : 1.5;
    ctx.quadraticCurveTo(-r * tl * 0.7, step * r * 0.5, -r * tl, step * r * 0.9);
    ctx.stroke();

    // body
    ctx.fillStyle = body;
    ctx.beginPath();
    const bw = shape === 'horn' || shape === 'long' ? 1.15 : shape === 'rex' ? 1.05 : 0.95;
    ctx.ellipse(0, 0, r * bw, r * 0.62, 0, 0, 7);
    ctx.fill();

    // sail / frill / back ridge
    if (shape === 'sail') {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, 0);
      ctx.quadraticCurveTo(0, -r * 1.35, r * 0.5, 0);
      ctx.closePath(); ctx.fill();
    } else if (shape === 'horn') {
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.ellipse(r * 0.72, 0, r * 0.5, r * 0.72, 0, 0, 7); ctx.fill();
    } else if (shape === 'raptor') {
      ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.1); ctx.lineTo(r * 0.5, -r * 0.1); ctx.stroke();
    }

    // neck + head
    const neck = shape === 'long' ? r * 1.7 : shape === 'sail' ? r * 1.25 : r * 1.0;
    ctx.strokeStyle = body;
    ctx.lineWidth = Math.max(1.4, r * (shape === 'long' ? 0.22 : 0.34));
    ctx.beginPath();
    ctx.moveTo(r * 0.5, 0);
    ctx.quadraticCurveTo(r * neck * 0.7, -step * r * 0.18, r * 0.35 + neck, -step * r * 0.25);
    ctx.stroke();

    const hx = r * 0.35 + neck, hy = -step * r * 0.25;
    const hr = r * (shape === 'rex' ? 0.55 : shape === 'long' ? 0.3 : 0.42);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(hx, hy, hr * 1.25, hr, 0, 0, 7); ctx.fill();

    // jaw, open while biting
    const biting = d.biteT > D.species(d).biteCd * 0.55;
    if (biting) {
      ctx.fillStyle = '#6a2020';
      ctx.beginPath();
      ctx.moveTo(hx + hr * 0.2, hy);
      ctx.lineTo(hx + hr * 2.0, hy - hr * 0.65);
      ctx.lineTo(hx + hr * 2.0, hy + hr * 0.65);
      ctx.closePath(); ctx.fill();
    }

    // eye
    ctx.fillStyle = '#101014';
    ctx.beginPath(); ctx.arc(hx + hr * 0.35, hy - hr * 0.35, Math.max(0.8, hr * 0.22), 0, 7); ctx.fill();

    if (shape === 'horn') {
      ctx.strokeStyle = '#e6dcc4'; ctx.lineWidth = Math.max(1, r * 0.11);
      ctx.beginPath(); ctx.moveTo(hx + hr * 0.6, hy - hr * 0.5); ctx.lineTo(hx + hr * 1.9, hy - hr * 1.1); ctx.stroke();
    }
  }

  function mix(a, b, k) {
    const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], k))).join(',')})`;
  }

  /* The name tag is where the shop shows up in the world: gold for a
   * subscriber, a diamond for anyone spending. */
  function drawTag(g, d, px, py, r) {
    const me = g.player;
    if (!me) return;
    const near = dist(d.x, d.y, me.x, me.y) < D.vision(g, me) * 1.1 || d.player;
    if (!near) return;
    if (px < 34 || px > cssW - 34 || py < 24) return;    // tags do not hang off the edge

    const top = py - r * 1.5 - 10;
    const hpFrac = clamp(d.hp / D.maxHp(d), 0, 1);
    const wBar = Math.max(24, r * 2.2);

    if (!d.player) {
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(px - wBar / 2, top, wBar, 3.5);
      ctx.fillStyle = hpFrac > 0.5 ? '#79c07a' : hpFrac > 0.22 ? '#d8b44a' : '#d8564a';
      ctx.fillRect(px - wBar / 2, top, wBar * hpFrac, 3.5);
    }

    const vip = d.whale || (d.player && ISLE.shop.clubActive(g));
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = (vip ? '♦ ' : '') + d.name + '  ' + Math.round(d.growth * 100) + '%';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(label, px + 1, top - 4 + 1);
    ctx.fillStyle = d.player ? '#ffe9a8' : vip ? '#e8c257' : '#d6dced';
    ctx.fillText(label, px, top - 4);

    if (d.bleed) {
      ctx.fillStyle = '#c8392f';
      ctx.beginPath(); ctx.arc(px + wBar / 2 + 6, top + 2, 2.4, 0, 7); ctx.fill();
    }
  }

  /* Night. The hole in the dark is exactly this animal's vision, which is the
   * clearest possible statement of what night vision is worth. */
  function drawNight(g) {
    const day = W.daylight(g.clock);
    const dark = (1 - day) * 0.86;
    if (dark < 0.02) return;
    const p = g.player;
    const r = (p ? D.vision(g, p) : 500) * cam.z;
    const cx = p ? sx(p.x) : cssW / 2, cy = p ? sy(p.y) : cssH / 2;
    const grad = ctx.createRadialGradient(cx, cy, Math.min(r * 0.35, 240), cx, cy, Math.max(r, 60));
    grad.addColorStop(0, `rgba(6,10,26,${dark * 0.12})`);
    grad.addColorStop(0.6, `rgba(6,10,26,${dark * 0.6})`);
    grad.addColorStop(1, `rgba(4,7,18,${dark})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  /* Arrows at the screen edge for anything close and dangerous — a phone
   * screen is too small to find out the hard way. */
  function drawOffscreenMarkers(g) {
    const me = g.player;
    if (!me || !me.alive) return;
    for (const d of g.dinos) {
      if (d === me || !d.alive) continue;
      if (inView(d.x, d.y, -20)) continue;
      if (!D.canSee(g, me, d)) continue;
      const dd = dist(me.x, me.y, d.x, d.y);
      if (dd > 900) continue;
      const ang = Math.atan2(d.y - me.y, d.x - me.x);
      const m = 26;
      const rx = (cssW / 2 - m), ry = (cssH / 2 - m);
      const k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-3), ry / Math.abs(Math.sin(ang) || 1e-3));
      const px = cssW / 2 + Math.cos(ang) * k, py = cssH / 2 + Math.sin(ang) * k;
      const danger = ISLE.combat.matchup(me, d) < 0.8;
      ctx.save();
      ctx.translate(px, py); ctx.rotate(ang);
      ctx.fillStyle = danger ? 'rgba(216,86,74,0.85)' : 'rgba(214,220,237,0.55)';
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  /* The minimap, drawn into whatever 2D context the UI hands over. Everything
   * the player has not paid to see is a rumour: only your own position, the
   * coastline and your group show up unless Scent Surge is running. */
  function minimap(g, mctx, w, h) {
    const world = C.WORLD;
    const k = Math.min(w, h) / world;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = '#0b1a26';
    mctx.fillRect(0, 0, w, h);
    if (terrain) {
      mctx.imageSmoothingEnabled = true;
      mctx.globalAlpha = 0.9;
      mctx.drawImage(terrain, 0, 0, world * k, world * k);
      mctx.globalAlpha = 1;
    }
    const p = g.player;
    const reveal = p && p.buffs.reveal;
    for (const d of g.dinos) {
      if (!d.alive || d.player) continue;
      const known = reveal || (p && d.group && d.group === p.group);
      if (!known) continue;
      mctx.fillStyle = d.whale ? '#e8c257' : '#ff8f7f';
      mctx.beginPath(); mctx.arc(d.x * k, d.y * k, 2 + d.growth * 2, 0, 7); mctx.fill();
    }
    if (p) {
      mctx.fillStyle = '#8fe3ff';
      mctx.beginPath(); mctx.arc(p.x * k, p.y * k, 3.4, 0, 7); mctx.fill();
      mctx.strokeStyle = 'rgba(143,227,255,0.7)';
      mctx.beginPath();
      mctx.moveTo(p.x * k, p.y * k);
      mctx.lineTo(p.x * k + Math.cos(p.ang) * 9, p.y * k + Math.sin(p.ang) * 9);
      mctx.stroke();
    }
  }

  function kick(v) { shake = Math.max(shake, v || 0.6); }

  ISLE.render = { attach, resize, frame, toWorld, minimap, kick, get cam() { return cam; } };
})(window.ISLE = window.ISLE || {});
