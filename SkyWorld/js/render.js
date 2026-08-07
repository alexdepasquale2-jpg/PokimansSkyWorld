/* Skyward Reach — canvas scene.
 * Everything is drawn procedurally: no image assets, so the creature can
 * physically change shape as you raise it.
 */
(function (SW) {
  'use strict';
  const C = SW.content;
  const Cr = SW.creature;
  const { clamp, lerp, hashNoise } = SW.core;

  const W = 960, H = 540;
  // The part of the frame worth guaranteeing on screen, and its centre.
  const FIT = { w: 790, h: 476, cx: 476, cy: 316 };

  // Island furniture, in logical canvas pixels.
  const GRID = { ox: 408, oy: 232, ax: 46, ay: 23 };
  const WOOD = { x: 214, y: 330 };
  const VILLAGE = { x: 730, y: 344 };
  const SHRINE = { x: 618, y: 240 };
  const DEN = { x: 492, y: 432 };

  let canvas = null, ctx = null, dpr = 1, scale = 1, offX = 0, offY = 0;
  let time = 0;
  let hover = -1;
  let selected = -1;

  let attached = false;
  function attach(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resize();
    if (!attached) { attached = true; window.addEventListener('resize', resize); }
  }

  function resize() {
    if (!canvas) return;
    const box = canvas.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(320, box.width);
    const ch = Math.max(200, box.height);
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    // Fit the island's bounding box rather than the whole 960x540 frame: the
    // design frame has generous sky margins, and on a narrow phone stage those
    // margins would shrink the island to a thumbnail. The sky is painted over
    // whatever falls outside, so cropping the margins costs nothing.
    scale = Math.min(cw / FIT.w, ch / FIT.h);
    offX = cw / 2 - FIT.cx * scale;
    offY = ch / 2 - FIT.cy * scale;
  }

  function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - offX) / scale, y: (clientY - r.top - offY) / scale };
  }

  /* Inverse of toWorld: scene coordinates back to viewport coordinates. */
  function toScreen(wx, wy) {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + offX + wx * scale, y: r.top + offY + wy * scale };
  }

  /* Unlock order, centre-out, so three plots read as a small farm rather than
   * a diagonal stripe and the field stays compact as it grows to sixteen. */
  const PLOT_CELL = [
    [1, 1], [2, 1], [1, 2], [2, 2],
    [1, 0], [0, 1], [2, 0], [3, 1],
    [0, 2], [3, 2], [1, 3], [2, 3],
    [0, 0], [3, 0], [0, 3], [3, 3]
  ];
  function plotCenter(p) {
    const cell = PLOT_CELL[p.i] || [p.gx, p.gy];
    const gx = cell[0] + 0.5, gy = cell[1] + 0.5;
    return {
      x: GRID.ox + gx * GRID.ax - gy * GRID.ax,
      y: GRID.oy + gx * GRID.ay + gy * GRID.ay
    };
  }

  function anchorPoint(g, a) {
    if (!a) return { x: DEN.x, y: DEN.y };
    switch (a.kind) {
      case 'plot': {
        const p = g.plots.find(p => p.i === a.i) || g.plots[0];
        return p ? plotCenter(p) : { x: DEN.x, y: DEN.y };
      }
      case 'wood': return { x: WOOD.x + 30, y: WOOD.y + 10 };
      case 'village': return { x: VILLAGE.x - 40, y: VILLAGE.y + 8 };
      case 'shrine': return { x: SHRINE.x, y: SHRINE.y + 46 };
      case 'home': return { x: DEN.x, y: DEN.y };
      default: return { x: 480 + Math.sin(time * 0.3) * 90, y: 400 + Math.cos(time * 0.21) * 30 };
    }
  }

  // --- sky ---------------------------------------------------------------
  const SKY_KEYS = [
    { t: 0.00, top: '#2a2f52', mid: '#7d5f7a', low: '#e6a172', sun: '#ffd9a0', amb: 0.55 },
    { t: 0.18, top: '#4d8fd6', mid: '#9fd0f0', low: '#e9f3fb', sun: '#fff6d8', amb: 1.00 },
    { t: 0.52, top: '#3f81cc', mid: '#8fc6ec', low: '#ecf4fa', sun: '#fff3cf', amb: 1.00 },
    { t: 0.72, top: '#2c3a68', mid: '#a8628a', low: '#f0a86a', sun: '#ffcf94', amb: 0.62 },
    { t: 0.86, top: '#111634', mid: '#222a52', low: '#3a3f68', sun: '#cfd8ff', amb: 0.34 },
    { t: 1.00, top: '#2a2f52', mid: '#7d5f7a', low: '#e6a172', sun: '#ffd9a0', amb: 0.55 }
  ];

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (gg << 8) | bl).toString(16).slice(1);
  }

  function skyAt(t) {
    let a = SKY_KEYS[0], b = SKY_KEYS[1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (t >= SKY_KEYS[i].t && t <= SKY_KEYS[i + 1].t) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
    }
    const k = (t - a.t) / Math.max(0.0001, b.t - a.t);
    return {
      top: mix(a.top, b.top, k), mid: mix(a.mid, b.mid, k), low: mix(a.low, b.low, k),
      sun: mix(a.sun, b.sun, k), amb: lerp(a.amb, b.amb, k)
    };
  }

  function drawSky(g, sky, t, vw) {
    const grad = ctx.createLinearGradient(0, vw.y0, 0, vw.y1);
    grad.addColorStop(0, sky.top);
    grad.addColorStop(0.55, sky.mid);
    grad.addColorStop(1, sky.low);
    ctx.fillStyle = grad;
    ctx.fillRect(vw.x0, vw.y0, vw.x1 - vw.x0, vw.y1 - vw.y0);

    // Stars fade in after dusk.
    const night = clamp((t - 0.62) / 0.2, 0, 1) * clamp((1.02 - t) / 0.12, 0, 1) + clamp((0.08 - t) / 0.08, 0, 1);
    if (night > 0.01) {
      ctx.save();
      ctx.globalAlpha = clamp(night, 0, 1) * 0.9;
      for (let i = 0; i < 70; i++) {
        const x = vw.x0 + hashNoise(7, i) * (vw.x1 - vw.x0);
        const y = vw.y0 + hashNoise(13, i) * (vw.y1 - vw.y0) * 0.62;
        const s = 0.6 + hashNoise(19, i) * 1.4;
        ctx.globalAlpha = clamp(night, 0, 1) * (0.35 + 0.65 * Math.abs(Math.sin(time * 0.7 + i)));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, s, s);
      }
      ctx.restore();
    }

    // Rival islands, far off. A reminder there are other gods.
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const span = vw.x1 - vw.x0 + 300;
      const bx = vw.x0 - 150 + ((i * 231 + time * (2 + i)) % span);
      const by = vw.y0 + 40 + hashNoise(3, i) * 140;
      const s = 0.28 + hashNoise(5, i) * 0.3;
      ctx.globalAlpha = 0.13 + 0.1 * s;
      ctx.fillStyle = mix(sky.top, '#000000', 0.25);
      farIsland(bx, by, 120 * s);
    }
    ctx.restore();

    // Clouds.
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const span = vw.x1 - vw.x0 + 400;
      const bx = vw.x0 - 200 + ((i * 173 + time * (5 + i * 1.7)) % span);
      const by = vw.y0 + 20 + hashNoise(11, i) * (vw.y1 - vw.y0) * 0.55;
      const s = 0.5 + hashNoise(17, i) * 0.8;
      ctx.globalAlpha = 0.16 + 0.12 * hashNoise(23, i);
      ctx.fillStyle = '#ffffff';
      cloud(bx, by, 70 * s);
    }
    ctx.restore();

    // Sun / moon on an arc, glared over everything else in the sky.
    const ang = Math.PI * (t * 2 - 0.15);
    const cx = W * 0.5 - Math.cos(ang) * W * 0.42;
    const cy = H * 0.72 - Math.sin(ang) * H * 0.62;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 86);
    glow.addColorStop(0, sky.sun);
    glow.addColorStop(0.45, 'rgba(255,240,200,0.18)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, 86, 0, 7); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = sky.sun;
    ctx.beginPath(); ctx.arc(cx, cy, t > 0.66 || t < 0.06 ? 13 : 19, 0, 7); ctx.fill();
    ctx.restore();
  }

  function farIsland(x, y, r) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.24, 0, Math.PI, 0);
    ctx.moveTo(x - r, y);
    ctx.quadraticCurveTo(x - r * 0.3, y + r * 0.9, x, y + r * 1.1);
    ctx.quadraticCurveTo(x + r * 0.4, y + r * 0.8, x + r, y);
    ctx.fill();
  }

  function cloud(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, 7);
    ctx.arc(x + r * 0.42, y + r * 0.08, r * 0.36, 0, 7);
    ctx.arc(x - r * 0.4, y + r * 0.1, r * 0.3, 0, 7);
    ctx.arc(x + r * 0.06, y + r * 0.24, r * 0.42, 0, 7);
    ctx.fill();
  }

  // --- island ------------------------------------------------------------
  function drawIsland(g, sky) {
    const amb = sky.amb;
    const grassTop = mix('#7fb56a', '#1c2740', 1 - amb);
    const grassLow = mix('#5d9450', '#141c30', 1 - amb);
    const rock = mix('#8a7560', '#241f2e', 1 - amb);
    const rockDark = mix('#5d4c3d', '#161320', 1 - amb);

    // underside
    ctx.beginPath();
    ctx.moveTo(120, 348);
    ctx.bezierCurveTo(180, 470, 300, 560, 430, 545);
    ctx.bezierCurveTo(560, 560, 700, 470, 830, 352);
    ctx.closePath();
    ctx.fillStyle = rockDark;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(140, 344);
    ctx.bezierCurveTo(210, 440, 330, 500, 450, 492);
    ctx.bezierCurveTo(560, 496, 690, 430, 812, 348);
    ctx.closePath();
    ctx.fillStyle = rock;
    ctx.fill();

    // hanging roots
    ctx.strokeStyle = mix('#4c6b40', '#141c2c', 1 - amb);
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const x = 190 + i * 52 + Math.sin(i) * 12;
      const y = 380 + Math.sin(i * 1.7) * 40;
      const len = 30 + hashNoise(29, i) * 60;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.sin(time * 0.6 + i) * 8, y + len * 0.6, x + Math.sin(time * 0.6 + i) * 14, y + len);
      ctx.stroke();
    }

    // grass surface
    ctx.beginPath();
    ctx.moveTo(120, 348);
    ctx.bezierCurveTo(150, 250, 300, 186, 480, 186);
    ctx.bezierCurveTo(660, 186, 806, 252, 830, 352);
    ctx.bezierCurveTo(700, 412, 560, 432, 470, 432);
    ctx.bezierCurveTo(370, 432, 232, 410, 120, 348);
    ctx.closePath();
    const gGrad = ctx.createLinearGradient(0, 186, 0, 432);
    gGrad.addColorStop(0, grassTop);
    gGrad.addColorStop(1, grassLow);
    ctx.fillStyle = gGrad;
    ctx.fill();
    ctx.strokeStyle = mix('#94c97e', '#243252', 1 - amb);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // --- plots -------------------------------------------------------------
  function plotPath(c) {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - GRID.ay);
    ctx.lineTo(c.x + GRID.ax, c.y);
    ctx.lineTo(c.x, c.y + GRID.ay);
    ctx.lineTo(c.x - GRID.ax, c.y);
    ctx.closePath();
  }

  function drawPlots(g, sky) {
    const amb = sky.amb;
    // locked ground first, as faint outlines
    for (const p of g.lockedPlots) {
      const c = plotCenter(p);
      plotPath(c);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const p of g.plots) {
      const c = plotCenter(p);
      plotPath(c);
      let soil;
      if (p.state === 'raw') soil = '#6f8a56';
      else soil = mix('#6b4c33', '#3a2a1c', clamp(p.water / 100, 0, 1) * 0.55);
      ctx.fillStyle = mix(soil, '#101828', 1 - amb);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (p.state !== 'raw' && p.state !== 'tilled') drawCrop(g, p, c, amb);
      if (p.state === 'tilled') {
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(c.x - GRID.ax * 0.6 + i * 12, c.y + GRID.ay * 0.3 + i * 6);
          ctx.lineTo(c.x + GRID.ax * 0.6 + i * 12, c.y - GRID.ay * 0.3 + i * 6);
          ctx.stroke();
        }
      }

      // water / rot readouts
      if (p.crop) {
        const bw = 34;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(c.x - bw / 2, c.y + GRID.ay - 4, bw, 3);
        ctx.fillStyle = p.water < 25 ? '#e0625a' : '#59a6e8';
        ctx.fillRect(c.x - bw / 2, c.y + GRID.ay - 4, bw * clamp(p.water / 100, 0, 1), 3);
        if (p.rot > 30) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(c.x - bw / 2, c.y + GRID.ay, bw, 3);
          ctx.fillStyle = '#c78b3d';
          ctx.fillRect(c.x - bw / 2, c.y + GRID.ay, bw * clamp(p.rot / 100, 0, 1), 3);
        }
      }

      if (p.i === hover || p.i === selected) {
        plotPath(c);
        ctx.strokeStyle = p.i === selected ? '#ffe08a' : 'rgba(255,255,255,0.75)';
        ctx.lineWidth = p.i === selected ? 2.5 : 1.5;
        ctx.stroke();
      }
    }
  }

  function drawCrop(g, p, c, amb) {
    const crop = C.CROPS[p.crop];
    const prog = p.state === 'ripe' ? 1 : clamp(p.growth / crop.growTicks, 0.05, 1);
    const n = 5;
    const tint = mix(crop.tint, '#0d1424', 1 - amb);
    const stem = mix('#4f8b45', '#101c2c', 1 - amb);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + p.i;
      const px = c.x + Math.cos(a) * GRID.ax * 0.44;
      const py = c.y + Math.sin(a) * GRID.ay * 0.5;
      const h = 6 + prog * 22;
      const sway = Math.sin(time * 1.6 + i + p.i) * (1 + prog * 2);
      ctx.strokeStyle = stem;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + sway * 0.5, py - h * 0.6, px + sway, py - h);
      ctx.stroke();
      if (prog > 0.55) {
        const r = (prog - 0.55) / 0.45 * 3.6 + 1;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(px + sway, py - h, r, 0, 7);
        ctx.fill();
      }
    }
    if (p.state === 'ripe') {
      const pulse = 0.4 + 0.35 * Math.sin(time * 3 + p.i);
      ctx.save();
      ctx.globalAlpha = pulse * (p.rot > 55 ? 0.4 : 1);
      ctx.fillStyle = p.rot > 55 ? '#c78b3d' : '#fff3c0';
      ctx.beginPath();
      ctx.arc(c.x, c.y - 30, 3.2, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }

  // --- structures --------------------------------------------------------
  function drawTrees(sky) {
    const amb = sky.amb;
    for (let i = 0; i < 7; i++) {
      const x = WOOD.x + Math.sin(i * 2.1) * 44;
      const y = WOOD.y + Math.cos(i * 1.4) * 30;
      const s = 0.8 + hashNoise(31, i) * 0.5;
      ctx.fillStyle = mix('#4a3524', '#15111c', 1 - amb);
      ctx.fillRect(x - 2 * s, y - 14 * s, 4 * s, 16 * s);
      ctx.fillStyle = mix(i % 2 ? '#3f7a42' : '#4e8f4a', '#111c2a', 1 - amb);
      ctx.beginPath();
      ctx.arc(x, y - 22 * s, 13 * s, 0, 7);
      ctx.arc(x - 9 * s, y - 15 * s, 9 * s, 0, 7);
      ctx.arc(x + 9 * s, y - 16 * s, 10 * s, 0, 7);
      ctx.fill();
    }
  }

  function drawHuts(g, sky) {
    const amb = sky.amb;
    const n = Math.min(g.village.huts, 14);
    for (let i = 0; i < n; i++) {
      const a = i * 1.9;
      const x = VILLAGE.x + Math.cos(a) * (18 + i * 8.5);
      const y = VILLAGE.y + Math.sin(a) * (11 + i * 4.4);
      const s = 0.9;
      ctx.fillStyle = mix('#c9b08c', '#1d1b2a', 1 - amb);
      ctx.fillRect(x - 11 * s, y - 12 * s, 22 * s, 14 * s);
      ctx.fillStyle = mix('#8c5f42', '#171320', 1 - amb);
      ctx.beginPath();
      ctx.moveTo(x - 14 * s, y - 12 * s);
      ctx.lineTo(x, y - 25 * s);
      ctx.lineTo(x + 14 * s, y - 12 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x - 3 * s, y - 6 * s, 6 * s, 8 * s);
    }
  }

  function drawVillagers(g, sky) {
    const amb = sky.amb;
    const n = Math.min(g.village.villagers, 18);
    const scared = g.village.unrest > 45;
    for (let i = 0; i < n; i++) {
      const sp = 0.25 + hashNoise(37, i) * 0.3 + (scared ? 0.5 : 0);
      const r = 28 + hashNoise(41, i) * 62;
      const a = time * sp + i * 2.4;
      const x = VILLAGE.x - 20 + Math.cos(a) * r;
      const y = VILLAGE.y + 10 + Math.sin(a) * r * 0.42;
      const bob = Math.abs(Math.sin(time * 5 + i)) * 1.6;
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.beginPath(); ctx.ellipse(x, y + 1, 4, 1.8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = mix(['#c85b52', '#4a6ea8', '#caa24e', '#6d9a5a'][i % 4], '#181528', 1 - amb);
      ctx.fillRect(x - 2.2, y - 8 - bob, 4.4, 7);
      ctx.fillStyle = mix('#e8c6a0', '#201c30', 1 - amb);
      ctx.beginPath(); ctx.arc(x, y - 10.5 - bob, 2.6, 0, 7); ctx.fill();
    }
  }

  function drawShrine(g, sky) {
    const amb = sky.amb;
    const tier = g.shrine;
    const x = SHRINE.x, y = SHRINE.y + 44;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x, y + 3, 26 + tier * 6, 8 + tier * 2, 0, 0, 7); ctx.fill();
    const stone = mix('#b9b3a6', '#242238', 1 - amb);
    const stoneD = mix('#8d8779', '#191828', 1 - amb);
    if (tier === 0) {
      ctx.fillStyle = stone;
      ctx.beginPath(); ctx.ellipse(x, y - 4, 16, 7, 0, 0, 7); ctx.fill();
      return;
    }
    // stacked cairn / pillars
    const pillars = Math.min(tier, 4);
    for (let i = 0; i < pillars; i++) {
      const px = x + (i - (pillars - 1) / 2) * (17 + tier * 1.6);
      const h = 20 + tier * 9 - Math.abs(i - (pillars - 1) / 2) * 6;
      ctx.fillStyle = i % 2 ? stone : stoneD;
      ctx.fillRect(px - 5.5, y - h, 11, h);
      ctx.fillStyle = stone;
      ctx.fillRect(px - 7.5, y - h - 5, 15, 5);
    }
    if (tier >= 3) {
      ctx.fillStyle = stone;
      ctx.fillRect(x - (pillars * 10), y - 30 - tier * 9, pillars * 20, 6);
    }
    if (tier >= 2) {
      // votive light
      const p = 0.6 + 0.4 * Math.sin(time * 2);
      const gl = ctx.createRadialGradient(x, y - 26 - tier * 6, 1, x, y - 26 - tier * 6, 26 + tier * 5);
      gl.addColorStop(0, `rgba(255,225,150,${0.55 * p})`);
      gl.addColorStop(1, 'rgba(255,225,150,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(x, y - 26 - tier * 6, 26 + tier * 5, 0, 7); ctx.fill();
    }
  }

  // --- the creature ------------------------------------------------------
  function drawCreature(g, sky) {
    const c = g.creature;
    const L = Cr.look(g);
    const amb = sky.amb;
    const s = clamp(L.size, 0.6, 3.2) * 1.3;
    const x = c.x, y = c.y;
    const moving = c.act && c.act.phase === 'travel';
    const stride = moving ? Math.sin(time * 7) : Math.sin(time * 1.6) * 0.25;
    const bob = moving ? Math.abs(Math.sin(time * 7)) * 2.2 * s : Math.sin(time * 1.6) * 1.1 * s;
    const asleep = c.act && c.act.id === 'rest' && c.act.phase !== 'travel';

    const hide = mix(L.hide, '#141a2c', 1 - amb);
    const belly = mix(L.belly, '#1a2038', 1 - amb);
    const mark = mix(L.mark, '#0e1424', 1 - amb);

    ctx.save();
    ctx.translate(x, y);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0, 2, 26 * s, 9 * s, 0, 0, 7); ctx.fill();

    // bond aura
    if (L.glow > 0.02) {
      const gl = ctx.createRadialGradient(0, -18 * s, 2, 0, -18 * s, 54 * s);
      gl.addColorStop(0, `rgba(255,236,170,${0.30 * L.glow})`);
      gl.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(0, -18 * s, 54 * s, 0, 7); ctx.fill();
    }

    ctx.translate(0, -bob);
    if (asleep) ctx.translate(0, 5 * s);
    const lean = asleep ? 0 : (1 - L.posture) * 5 * s;

    // hind + fore legs
    ctx.strokeStyle = mix(hide, '#000000', 0.22);
    ctx.lineCap = 'round';
    ctx.lineWidth = 5.4 * s;
    const legY = asleep ? -4 * s : 0;
    for (const [lx, ph] of [[-14, 0], [-8, Math.PI], [11, Math.PI * 0.6], [17, Math.PI * 1.6]]) {
      const sw = stride * 5 * s * Math.cos(ph);
      ctx.beginPath();
      ctx.moveTo(lx * s, -14 * s);
      ctx.lineTo(lx * s + sw, legY);
      ctx.stroke();
    }

    // tail
    ctx.strokeStyle = hide;
    ctx.lineWidth = 4.5 * s;
    ctx.beginPath();
    ctx.moveTo(-18 * s, -20 * s);
    ctx.quadraticCurveTo(-32 * s, (-26 + Math.sin(time * 3) * 3) * s, -38 * s, (-34 + Math.sin(time * 3) * 5) * s);
    ctx.stroke();

    // body
    const plump = 1 + L.plump * 0.28;
    ctx.fillStyle = hide;
    ctx.beginPath();
    ctx.ellipse(-2 * s, (-22 + lean * 0.4) * s, 21 * s * plump, 14 * s * plump, -0.06, 0, 7);
    ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(-2 * s, (-17 + lean * 0.4) * s, 15 * s * plump, 8 * s * plump, -0.04, 0, 7);
    ctx.fill();

    // back ridge — spikes when cruel, blossoms when kind
    if (L.spikes > 0.08) {
      ctx.fillStyle = mark;
      for (let i = 0; i < 4; i++) {
        const bx = (-14 + i * 9) * s;
        const h = (5 + L.spikes * 11) * s;
        ctx.beginPath();
        ctx.moveTo(bx - 3.4 * s, -33 * s);
        ctx.lineTo(bx, -33 * s - h);
        ctx.lineTo(bx + 3.4 * s, -33 * s);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (L.bloom > 0.08) {
      for (let i = 0; i < 3; i++) {
        const bx = (-12 + i * 11) * s;
        ctx.fillStyle = mark;
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * Math.PI * 2 + time * 0.4;
          ctx.beginPath();
          ctx.arc(bx + Math.cos(a) * 3.2 * s, -35 * s + Math.sin(a) * 3.2 * s, 2.1 * s * L.bloom + 0.6, 0, 7);
          ctx.fill();
        }
      }
    }

    // neck + head
    const headX = (18 + lean * 0.2) * s, headY = (-38 + lean) * s + (asleep ? 12 * s : 0);
    ctx.strokeStyle = hide;
    ctx.lineWidth = 9 * s;
    ctx.beginPath();
    ctx.moveTo(8 * s, -28 * s);
    ctx.quadraticCurveTo(15 * s, -36 * s, headX, headY);
    ctx.stroke();

    ctx.fillStyle = hide;
    ctx.beginPath();
    ctx.ellipse(headX, headY, 11 * s, 9 * s, 0.12, 0, 7);
    ctx.fill();
    // snout / beak
    ctx.fillStyle = L.lineage === 'thistlebeak' ? mark : hide;
    ctx.beginPath();
    ctx.moveTo(headX + 6 * s, headY - 1 * s);
    ctx.lineTo(headX + (L.lineage === 'thistlebeak' ? 20 : 15) * s, headY + 2 * s);
    ctx.lineTo(headX + 6 * s, headY + 5 * s);
    ctx.closePath();
    ctx.fill();

    // horns / ears
    ctx.strokeStyle = mark;
    ctx.lineWidth = 2.6 * s;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(headX - 3 * s, headY - 6 * s);
      const len = (7 + L.spikes * 9) * s;
      ctx.quadraticCurveTo(headX - 6 * s + dir * 2 * s, headY - 6 * s - len, headX - 9 * s + dir * 5 * s, headY - 6 * s - len * 1.1);
      ctx.stroke();
    }

    // eye
    if (asleep || L.eye === 'sad') {
      ctx.strokeStyle = '#20222e';
      ctx.lineWidth = 1.6 * s;
      ctx.beginPath();
      ctx.arc(headX + 3 * s, headY - 1 * s, 2.4 * s, asleep ? 0.2 : 3.4, asleep ? 2.9 : 6.1);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(headX + 3 * s, headY - 1.5 * s, 2.9 * s, 0, 7); ctx.fill();
      ctx.fillStyle = c.kind < -40 ? '#c0342c' : '#20222e';
      const look = moving ? 1 : Math.sin(time * 0.9) * 0.9;
      ctx.beginPath(); ctx.arc(headX + (3 + look) * s, headY - 1.5 * s, L.eye === 'bright' ? 1.7 * s : 1.3 * s, 0, 7); ctx.fill();
    }

    ctx.restore();

    // name plate
    ctx.save();
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const label = c.name;
    const wLab = ctx.measureText(label).width + 12;
    ctx.fillRect(x - wLab / 2, y - 66 * s - 14, wLab, 16);
    ctx.fillStyle = '#f2f5ff';
    ctx.fillText(label, x, y - 66 * s - 2);
    ctx.restore();

    // the praise/scold window, drawn on the creature so your eyes stay here
    if (c.pending) {
      const left = 1 - c.pending.t / Cr.PRAISE_WINDOW;
      const bw = 62, bx = x - bw / 2, by = y - 66 * s - 26;
      ctx.fillStyle = 'rgba(10,12,20,0.6)';
      ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = left > 0.35 ? '#7ee787' : '#e0a33d';
      ctx.fillRect(bx, by, bw * clamp(left, 0, 1), 5);
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(C.ACTS[c.pending.act].icon + ' judge it', x, by - 4);
    }
  }

  function moveCreature(g, dt) {
    const c = g.creature;
    const a = anchorPoint(g, c.act && c.act.anchor);
    c.tx = a.x; c.ty = a.y;
    const k = clamp(dt * 2.2, 0, 1);
    c.x += (c.tx - c.x) * k;
    c.y += (c.ty - c.y) * k;
  }

  // --- effects -----------------------------------------------------------
  function drawFx(g, dt) {
    const c = g.creature;
    for (let i = g.fx.length - 1; i >= 0; i--) {
      const f = g.fx[i];
      f.t += dt;
      const life = f.life || 1.5;
      if (f.t >= life) { g.fx.splice(i, 1); continue; }
      const k = f.t / life;
      if (f.at === 'creature') {
        ctx.save();
        ctx.globalAlpha = 1 - k * k;
        ctx.font = '700 20px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = f.tone === 'good' ? '#8ff0a4' : f.tone === 'bad' ? '#ff8e8e' : '#dfe7ff';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        const fy = c.y - 78 - k * 42;
        ctx.strokeText(f.text, c.x, fy);
        ctx.fillText(f.text, c.x, fy);
        ctx.restore();
      } else if (f.at === 'banner') {
        ctx.save();
        const inK = clamp(f.t / 0.4, 0, 1) * clamp((life - f.t) / 0.7, 0, 1);
        ctx.globalAlpha = inK;
        ctx.font = '800 30px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(8,10,18,0.55)';
        ctx.fillRect(W / 2 - 250, 62, 500, 46);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(f.text, W / 2, 94);
        ctx.restore();
      } else if (f.at === 'sky') {
        if (f.kind === 'rain') {
          ctx.save();
          ctx.globalAlpha = 0.45 * clamp((life - f.t) / 1.2, 0, 1);
          ctx.strokeStyle = '#bcd8f5';
          ctx.lineWidth = 1.2;
          for (let n = 0; n < 220; n++) {
            const rx = -W + ((n * 61 + f.t * 620) % (W * 3));
            const ry = -H + ((n * 137 + f.t * 900) % (H * 3));
            ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 13); ctx.stroke();
          }
          ctx.restore();
        } else if (f.kind === 'storm') {
          const flash = Math.sin(f.t * 22) > 0.85 ? 0.55 : 0;
          if (flash) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(-W, -H, W * 3, H * 3); }
          ctx.save();
          ctx.globalAlpha = 0.35 * clamp((life - f.t) / 1.2, 0, 1);
          ctx.fillStyle = '#1b2036';
          ctx.fillRect(-W, -H, W * 3, H * 3);
          ctx.restore();
        } else if (f.kind === 'shine') {
          ctx.save();
          ctx.globalAlpha = 0.5 * clamp((life - f.t) / life, 0, 1);
          ctx.fillStyle = '#fff4c2';
          ctx.fillRect(-W, -H, W * 3, H * 3);
          ctx.restore();
        }
      }
    }
  }

  // --- overlay HUD on canvas --------------------------------------------
  function drawSceneLabels(g, sky) {
    ctx.save();
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('WOODLAND', WOOD.x, WOOD.y + 46);
    ctx.fillText('VILLAGE · ' + g.village.villagers, VILLAGE.x, VILLAGE.y + 62);
    ctx.fillText(C.SHRINE_TIERS[g.shrine].name.toUpperCase(), SHRINE.x, SHRINE.y + 66);
    ctx.restore();
  }

  // --- main --------------------------------------------------------------
  function frame(g, dt) {
    if (!ctx) return;
    time += dt;
    const t = (g.dayTick % C.TICKS_PER_DAY) / C.TICKS_PER_DAY;
    const sky = skyAt(t);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#080b14';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // The visible world rectangle, which is wider or taller than the 960x540
    // design frame whenever the stage aspect differs. The sky is painted over
    // all of it so the scene never letterboxes to black.
    const vw = {
      x0: -offX / scale, y0: -offY / scale,
      x1: (canvas.width / dpr - offX) / scale,
      y1: (canvas.height / dpr - offY) / scale
    };
    drawSky(g, sky, t, vw);
    drawIsland(g, sky);
    drawTrees(sky);
    drawPlots(g, sky);
    drawShrine(g, sky);
    drawHuts(g, sky);
    drawVillagers(g, sky);
    moveCreature(g, dt);
    drawCreature(g, sky);
    drawSceneLabels(g, sky);
    drawFx(g, dt);

    ctx.restore();
  }

  // --- hit testing -------------------------------------------------------
  function hitPlot(g, wx, wy) {
    for (const p of g.plots) {
      const c = plotCenter(p);
      if (Math.abs(wx - c.x) / GRID.ax + Math.abs(wy - c.y) / GRID.ay <= 1) return p;
    }
    return null;
  }
  function hitLockedPlot(g, wx, wy) {
    for (const p of g.lockedPlots) {
      const c = plotCenter(p);
      if (Math.abs(wx - c.x) / GRID.ax + Math.abs(wy - c.y) / GRID.ay <= 1) return p;
    }
    return null;
  }
  function hitCreature(g, wx, wy) {
    const c = g.creature;
    return Math.hypot(wx - c.x, wy - (c.y - 26 * c.size)) < 40 * clamp(c.size, 0.7, 2.4);
  }
  const setHover = i => { hover = i; };
  const setSelected = i => { selected = i; };
  const getSelected = () => selected;

  SW.render = {
    W, H, attach, resize, frame, toWorld, toScreen, hitPlot, hitLockedPlot, hitCreature,
    setHover, setSelected, getSelected, plotCenter, anchorPoint,
    WOOD, VILLAGE, SHRINE, DEN
  };
})(window.SW = window.SW || {});
