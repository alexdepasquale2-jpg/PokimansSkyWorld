/* Resonant — the renderer.
 *
 * The field is drawn in normalised space: the origin is the point of
 * consciousness, and radius 1.0 is the rim. Everything scales off `view.R` so
 * the same code is correct on a phone in portrait and a desktop in landscape.
 *
 * Draw order is deliberate and is itself part of the feedback design:
 *
 *   backdrop     the tier's geometry, faint — this is *where* you are
 *   layer wash   the band's palette bleeding in — this is *what layer* you are in
 *   beat ring    a ring pulsing at the audio beat rate — visual tuning aid
 *   nodes        unresolved smudges → resolved manifestations
 *   reticle      per-dial alignment arcs for the node you are closest to
 *   centre       you
 *   particles    the harvest, arriving
 *   post         flash, vignette, aberration
 *
 * The reticle matters more than it looks. A four-dial lock that fails without
 * telling you *which* dial is wrong is not difficulty, it is noise — so the
 * four arcs around the centre are a permanent readout of exactly how wrong
 * each axis is, and they are the difference between the game feeling precise
 * and feeling arbitrary.
 */
(function (RS) {
  'use strict';
  const { clamp, clamp01, lerp, damp, ease, hsl, TAU, fmt } = RS.core;

  const view = { w: 0, h: 0, dpr: 1, cx: 0, cy: 0, R: 1 };

  /* Smoothed visuals — the renderer never reads a raw game value directly,
   * because every one of them can change instantly and nothing on screen is
   * allowed to. */
  const vis = {
    hue: new RS.core.Spring(205, 60, 15),
    sat: new RS.core.Spring(0.3, 60, 15),
    strength: new RS.core.Spring(0, 70, 16),
    tierMix: new RS.core.Spring(RS.cosmos.ROOT_INDEX, 90, 18),
    beatPhase: 0,
    starT: 0
  };

  function resize(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    view.w = w; view.h = h; view.dpr = dpr;
    view.cx = w / 2;

    /* Centre the world in the space that is actually free, not in the raw
     * viewport. The instrument cluster owns the bottom of the screen and the
     * topbar owns a strip at the top, so the usable band is between them —
     * centring in the viewport buries the world behind the dials on a phone
     * and leaves a dead gap on a tall screen. `clusterTop` comes from the HUD
     * layout, which is the authority on where the instruments start. */
    const top = h * 0.13;
    const bottom = (RS.hud && RS.hud.layout.clusterTop) ? RS.hud.layout.clusterTop : h * 0.78;
    const band = Math.max(120, bottom - top);
    view.cy = top + band * 0.5;
    /* Radius fits the narrower of the two axes, with a little margin so ripples
     * and rim glows are not clipped. */
    view.R = Math.min(w * 0.46, band * 0.46);
    return view;
  }

  const px = v => v * view.R;
  const sx = x => view.cx + x * view.R;
  const sy = y => view.cy + y * view.R;

  // --- backdrops -----------------------------------------------------------

  /* Each tier geometry gets its own faint backdrop. These are cheap on
   * purpose: they must run at 60fps on a phone while everything else is also
   * happening, so none of them allocate and none of them use shadows. */
  function drawBackdrop(ctx, game, geom, hue, alpha, t) {
    if (alpha < 0.004) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(1, px(0.003));

    switch (geom) {
      case 'foam': {
        /* Seething sub-structure: many tiny dots, re-hashed each frame band so
         * it genuinely boils rather than scrolls. */
        const n = 200;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU * 7.3;
          const r = (RS.core.hashF(i, 1) * 0.98);
          const flick = RS.core.noise2(i, t * 3.4, r * 6);
          if (flick < 0.42) continue;
          const rr = r + Math.sin(t * 2 + i) * 0.012;
          ctx.fillStyle = hsl(hue + i % 40, 0.7, 0.55, flick * 0.5);
          const s = px(0.004 + flick * 0.006);
          ctx.fillRect(sx(Math.cos(a) * rr) - s / 2, sy(Math.sin(a) * rr) - s / 2, s, s);
        }
        break;
      }
      case 'orbital': {
        for (let i = 1; i <= 7; i++) {
          const r = i / 7.4;
          ctx.strokeStyle = hsl(hue, 0.55, 0.55, 0.16 * (1 - r * 0.4));
          ctx.beginPath();
          ctx.ellipse(view.cx, view.cy, px(r), px(r * (0.55 + 0.45 * Math.sin(t * 0.3 + i))), t * 0.05 * i, 0, TAU);
          ctx.stroke();
        }
        break;
      }
      case 'chain': {
        for (let s = 0; s < 5; s++) {
          ctx.strokeStyle = hsl(hue + s * 9, 0.5, 0.5, 0.16);
          ctx.beginPath();
          for (let i = 0; i <= 60; i++) {
            const u = i / 60;
            const a = u * TAU + s * 1.25 + t * 0.09;
            const r = 0.18 + u * 0.78 + Math.sin(u * 15 + t) * 0.03;
            const fn = i === 0 ? 'moveTo' : 'lineTo';
            ctx[fn](sx(Math.cos(a) * r), sy(Math.sin(a) * r));
          }
          ctx.stroke();
        }
        break;
      }
      case 'cell': {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + t * 0.05;
          const r = 0.32 + RS.core.hashF(i, 3) * 0.55;
          const rad = 0.09 + RS.core.hashF(i, 4) * 0.13;
          const wob = 1 + Math.sin(t * 0.9 + i) * 0.09;
          ctx.strokeStyle = hsl(hue + i * 5, 0.5, 0.5, 0.18);
          ctx.beginPath();
          ctx.ellipse(sx(Math.cos(a) * r), sy(Math.sin(a) * r), px(rad * wob), px(rad / wob), a, 0, TAU);
          ctx.stroke();
        }
        break;
      }
      case 'body': {
        ctx.strokeStyle = hsl(hue, 0.42, 0.5, 0.2);
        for (let i = 0; i < 4; i++) {
          const r = 0.25 + i * 0.21;
          ctx.beginPath();
          ctx.arc(view.cx, view.cy, px(r), Math.PI * (0.08 + i * 0.03), Math.PI * (0.92 - i * 0.03));
          ctx.stroke();
        }
        break;
      }
      case 'disc': {
        /* Spiral density waves — the root tier's signature, so it gets the
         * most attention of any backdrop. */
        const arms = 4;
        for (let a0 = 0; a0 < arms; a0++) {
          ctx.strokeStyle = hsl(hue + a0 * 7, 0.6, 0.56, 0.2);
          ctx.lineWidth = Math.max(1, px(0.006));
          ctx.beginPath();
          for (let i = 0; i <= 70; i++) {
            const u = i / 70;
            const r = 0.06 + u * 1.02;
            const a = (a0 / arms) * TAU + u * 2.7 + t * 0.045;
            const fn = i === 0 ? 'moveTo' : 'lineTo';
            ctx[fn](sx(Math.cos(a) * r), sy(Math.sin(a) * r * 0.86));
          }
          ctx.stroke();
        }
        break;
      }
      case 'web': {
        /* Filaments between quasi-stable nodes; voids are what is left over. */
        const N = 16;
        ctx.strokeStyle = hsl(hue, 0.45, 0.55, 0.14);
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const ai = RS.core.hashF(i, 5) * TAU + t * 0.02;
          const ri = 0.2 + RS.core.hashF(i, 6) * 0.85;
          for (let j = i + 1; j < N; j++) {
            const aj = RS.core.hashF(j, 5) * TAU + t * 0.02;
            const rj = 0.2 + RS.core.hashF(j, 6) * 0.85;
            const x1 = Math.cos(ai) * ri, y1 = Math.sin(ai) * ri;
            const x2 = Math.cos(aj) * rj, y2 = Math.sin(aj) * rj;
            if (Math.hypot(x2 - x1, y2 - y1) > 0.42) continue;
            ctx.moveTo(sx(x1), sy(y1)); ctx.lineTo(sx(x2), sy(y2));
          }
        }
        ctx.stroke();
        break;
      }
      case 'abstract': {
        /* No spatial metaphor survives up here, so the backdrop stops
         * pretending to be a place and becomes a relation graph. */
        const N = 11;
        for (let i = 0; i < N; i++) {
          const a = (i / N) * TAU;
          const r = 0.72 + Math.sin(t * 0.4 + i) * 0.05;
          const x = sx(Math.cos(a) * r), y = sy(Math.sin(a) * r);
          ctx.fillStyle = hsl(hue, 0.3, 0.7, 0.35);
          ctx.beginPath(); ctx.arc(x, y, px(0.008), 0, TAU); ctx.fill();
          for (let j = i + 1; j < N; j++) {
            if ((i * j + Math.floor(t * 0.4)) % 5 !== 0) continue;
            const b = (j / N) * TAU;
            ctx.strokeStyle = hsl(hue, 0.3, 0.6, 0.09);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(sx(Math.cos(b) * r), sy(Math.sin(b) * r));
            ctx.stroke();
          }
        }
        break;
      }
    }
    ctx.restore();
  }

  // --- manifestations ------------------------------------------------------

  /* An unresolved node: you can see that *something* is there and nothing
   * more. The jitter is deliberate — a still smudge reads as a rendering bug,
   * a jittering one reads as a signal you have not locked. */
  function drawSmudge(ctx, x, y, r, hue, alpha, t, seed) {
    const j = 0.006 * (1 - alpha);
    const jx = Math.sin(t * 9 + seed) * j, jy = Math.cos(t * 11 + seed * 1.7) * j;
    const g = ctx.createRadialGradient(sx(x + jx), sy(y + jy), 0, sx(x + jx), sy(y + jy), px(r * 2.2));
    g.addColorStop(0, hsl(hue, 0.4, 0.6, 0.30 * alpha));
    g.addColorStop(0.5, hsl(hue, 0.4, 0.5, 0.11 * alpha));
    g.addColorStop(1, hsl(hue, 0.4, 0.5, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx(x + jx), sy(y + jy), px(r * 2.2), 0, TAU);
    ctx.fill();
  }

  /* The essence glyphs. Each is drawn from the manifestation's own derived
   * parameters, so two instances of the same essence are recognisably the same
   * shape without being identical drawings. */
  function drawEssence(ctx, man, x, y, r, hue, alpha, t) {
    const cx = sx(x), cy = sy(y), R = px(r);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.15 * man.twist);
    ctx.strokeStyle = hsl(hue, man.sat + 0.15, 0.68, alpha);
    ctx.fillStyle = hsl(hue, man.sat + 0.15, 0.62, alpha * 0.55);
    ctx.lineWidth = Math.max(1, R * 0.09);
    ctx.lineCap = 'round';
    const arms = man.arms;

    switch (man.essence.id) {
      case 'boundary':
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, R * (0.5 + i * 0.26), 0.4 + i * 0.5, Math.PI * 1.6 + i * 0.5);
          ctx.stroke();
        }
        break;
      case 'flow':
        for (let s = 0; s < 3; s++) {
          ctx.beginPath();
          for (let i = 0; i <= 22; i++) {
            const u = i / 22;
            const px2 = (u - 0.5) * R * 2.2;
            const py2 = Math.sin(u * 7 + t * 2.2 + s * 1.5) * R * 0.34 + (s - 1) * R * 0.34;
            i === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
          }
          ctx.stroke();
        }
        break;
      case 'recursion':
        for (let i = 0; i < 4; i++) {
          const rr = R * Math.pow(0.62, i);
          ctx.beginPath();
          ctx.arc(R * (1 - Math.pow(0.62, i)) * 0.5, 0, rr, 0, TAU);
          ctx.stroke();
        }
        break;
      case 'attractor':
        for (let i = 4; i >= 1; i--) {
          ctx.globalAlpha = alpha * (0.2 + i * 0.16);
          ctx.beginPath(); ctx.arc(0, 0, R * i * 0.27, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = alpha;
        break;
      case 'duality':
        ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, R, Math.PI / 2, -Math.PI / 2); ctx.stroke();
        break;
      case 'emergence':
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU + t * 0.4;
          const rr = R * (0.55 + Math.sin(t * 1.6 + i * 0.9) * 0.42);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.11, 0, TAU);
          ctx.fill();
        }
        break;
      case 'threshold':
        ctx.beginPath();
        ctx.moveTo(-R, R * 0.5); ctx.lineTo(0, R * 0.5);
        ctx.lineTo(0, -R * 0.5); ctx.lineTo(R, -R * 0.5);
        ctx.stroke();
        break;
      case 'lattice':
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          ctx.beginPath();
          ctx.arc(i * R * 0.62, j * R * 0.62, R * 0.13, 0, TAU);
          ctx.fill();
        }
        break;
      case 'spiral':
        ctx.beginPath();
        for (let i = 0; i <= 46; i++) {
          const u = i / 46;
          const a = u * TAU * 1.9 * (man.twist > 0 ? 1 : -1);
          const rr = u * R * 1.15;
          i === 0 ? ctx.moveTo(0, 0) : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.stroke();
        break;
      case 'void':
        ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, TAU); ctx.stroke();
        break;
      case 'seed':
        ctx.beginPath(); ctx.arc(0, 0, R * 0.3, 0, TAU); ctx.fill();
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * TAU + t * 0.3;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * R * 0.45, Math.sin(a) * R * 0.45);
          ctx.lineTo(Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05);
          ctx.stroke();
        }
        break;
      case 'weave':
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI + t * 0.1;
          ctx.beginPath();
          ctx.moveTo(-Math.cos(a) * R, -Math.sin(a) * R);
          ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
          ctx.stroke();
        }
        break;
      case 'cascade': {
        const branch = (x0, y0, a, len, d) => {
          if (d <= 0) return;
          const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          branch(x1, y1, a - 0.5, len * 0.62, d - 1);
          branch(x1, y1, a + 0.5, len * 0.62, d - 1);
        };
        branch(0, R, -Math.PI / 2, R * 0.72, 3);
        break;
      }
      case 'memory':
        for (let i = 0; i < 5; i++) {
          ctx.globalAlpha = alpha * (1 - i * 0.17);
          ctx.beginPath();
          ctx.arc(0, R * 0.3 - i * R * 0.22, R * 0.85, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
        ctx.globalAlpha = alpha;
        break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawNode(ctx, game, n, t) {
    const man = n.man;
    const a = n.fade;
    if (a < 0.01) return;
    const hue = man.hue;
    const r = 0.036 * man.size * (1 + n.align * 0.28);

    /* Probabilistic layer: the uncollapsed twin renders as a real, equally
     * convincing node. Half the time you tune the wrong one, which is the
     * entire mechanic. */
    if (n.band.mode === 'superposed' && !n.collapsed) {
      const tx = Math.cos(n.twinAng) * n.rad, ty = Math.sin(n.twinAng) * n.rad;
      drawSmudge(ctx, tx, ty, r, hue, a * 0.5, t, man.seed);
      if (n.resolved > 0.3) drawEssence(ctx, man, tx, ty, r, hue, a * n.resolved * 0.45, t);
    }

    /* Gated layers dim when the window is shut, so the rhythm is visible as
     * well as audible. */
    const gateA = a * (0.28 + 0.72 * n.gate);

    drawSmudge(ctx, n.x, n.y, r, hue, gateA * (1 - n.resolved * 0.55), t, man.seed);

    if (n.resolved > 0.03) {
      /* Glow scales with alignment — approaching a node visibly ignites it. */
      if (n.align > 0.12) {
        const g = ctx.createRadialGradient(sx(n.x), sy(n.y), 0, sx(n.x), sy(n.y), px(r * 3.4));
        g.addColorStop(0, hsl(hue, 0.9, 0.62, 0.4 * n.align * gateA));
        g.addColorStop(1, hsl(hue, 0.9, 0.6, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx(n.x), sy(n.y), px(r * 3.4), 0, TAU); ctx.fill();
      }
      drawEssence(ctx, man, n.x, n.y, r, hue, gateA * n.resolved, t);
    }

    // coherence arc — the hold meter, drawn on the node itself
    if (n.coherence > 0.001) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.5, px(0.008));
      ctx.strokeStyle = hsl(hue + 25, 0.95, 0.66, 0.9 * a);
      ctx.beginPath();
      ctx.arc(sx(n.x), sy(n.y), px(r * 1.9), -Math.PI / 2, -Math.PI / 2 + TAU * n.coherence);
      ctx.stroke();
      /* A leading dot on the arc: it makes the fill read as *motion* rather
       * than as a static percentage, which is most of why progress rings feel
       * good at all. */
      const ea = -Math.PI / 2 + TAU * n.coherence;
      ctx.fillStyle = hsl(hue + 40, 1, 0.78, a);
      ctx.beginPath();
      ctx.arc(sx(n.x) + Math.cos(ea) * px(r * 1.9), sy(n.y) + Math.sin(ea) * px(r * 1.9), px(0.008), 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // blocked marker (causal layer)
    if (n.blocked && n.resolved > 0.3) {
      ctx.strokeStyle = hsl(0, 0.7, 0.6, 0.55 * a);
      ctx.lineWidth = Math.max(1, px(0.004));
      ctx.beginPath();
      ctx.arc(sx(n.x), sy(n.y), px(r * 2.3), 0, TAU);
      ctx.setLineDash([px(0.014), px(0.014)]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // rarity crown
    if (man.rarity > 0 && n.resolved > 0.5) {
      ctx.strokeStyle = hsl(hue + 55, 1, 0.72, 0.75 * a * n.resolved);
      ctx.lineWidth = Math.max(1, px(0.0035));
      for (let i = 0; i < man.rarity; i++) {
        ctx.beginPath();
        ctx.arc(sx(n.x), sy(n.y), px(r * (2.6 + i * 0.34)), t * (0.5 + i * 0.3), t * (0.5 + i * 0.3) + 1.4);
        ctx.stroke();
      }
    }
  }

  // --- the observer --------------------------------------------------------

  function drawCentre(ctx, game, t, spec) {
    const cx = view.cx, cy = view.cy;
    const focus = RS.dials.observerFocus(game.dials);
    const pulse = 1 + Math.sin(t * 2.1) * 0.06;
    const rr = px(0.028) * pulse * (0.75 + focus * 0.5);

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 6);
    g.addColorStop(0, hsl(vis.hue.value, 0.2, 0.98, 0.95));
    g.addColorStop(0.18, hsl(vis.hue.value, 0.7, 0.75, 0.5));
    g.addColorStop(1, hsl(vis.hue.value, 0.8, 0.6, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, rr * 6, 0, TAU); ctx.fill();

    ctx.fillStyle = hsl(vis.hue.value, 0.1, 1, 0.98);
    ctx.beginPath(); ctx.arc(cx, cy, rr * 0.55, 0, TAU); ctx.fill();
  }

  /* Four arcs around the observer, one per dial, each showing how aligned that
   * axis is with the nearest node. Dim = wrong dial. This is the game's
   * diagnostic instrument and it is always on. */
  function drawReticle(ctx, game, t) {
    const n = game.focusNode;
    if (!n || !n.alignParts) return;
    const p = n.alignParts;
    const axes = [
      { v: p.f, d: p.dem.freq, hue: 187, label: 'φ' },
      { v: p.s, d: p.dem.tier, hue: 338, label: 'Σ' },
      { v: p.p, d: p.dem.phase, hue: 268, label: 'Δ' },
      { v: p.r, d: p.dem.rate, hue: 43, label: 'τ' }
    ];
    const R0 = px(0.10);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ax = axes[i];
      const a0 = -Math.PI / 2 + i * (TAU / 4) + 0.10;
      const a1 = a0 + TAU / 4 - 0.20;
      /* An axis this band does not demand is drawn as a hairline — the player
       * can see at a glance which dials are live in this layer. */
      const live = ax.d > 0.02;
      ctx.lineWidth = live ? Math.max(2, px(0.011)) : Math.max(1, px(0.003));
      ctx.strokeStyle = hsl(ax.hue, 0.5, 0.5, live ? 0.18 : 0.10);
      ctx.beginPath(); ctx.arc(view.cx, view.cy, R0, a0, a1); ctx.stroke();
      if (!live) continue;
      const fill = clamp01(ax.v);
      ctx.strokeStyle = hsl(ax.hue, 0.9, lerp(0.42, 0.72, fill), 0.35 + fill * 0.62);
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, R0, a0, a0 + (a1 - a0) * fill);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* The beat ring. Pulses at exactly the audio beat rate: fast strobe when far
   * off tune, slow swell when close, and perfectly still when locked. The
   * player can tune by watching this alone. */
  function drawBeatRing(ctx, game, dt, t) {
    const D = game.dials;
    const focus = RS.dials.focusOf(D.frequency);
    const band = RS.spectrum.nearestBand(D.frequency.value);
    const err = Math.abs(D.frequency.value - band.centre);
    const beat = err * RS.audio.BEAT_SCALE;
    vis.beatPhase += dt * Math.min(beat, 22) * 0.55;
    const res = RS.spectrum.resonanceOf(band, D.frequency.value, focus);
    if (res < 0.02) return;

    const wob = Math.sin(vis.beatPhase * TAU);
    /* When the beat rate reaches zero the ring stops moving entirely — the
     * stillness is the signal. */
    const amp = clamp01(err / 6) * 0.5;
    const r = px(0.135) * (1 + wob * amp);
    const ghost = RS.spectrum.isGhost(band, focus);
    ctx.save();
    ctx.lineWidth = Math.max(1, px(0.004 + res * 0.006));
    ctx.strokeStyle = hsl(band.hue, ghost ? 0.15 : band.sat, ghost ? 0.45 : 0.62,
      res * (ghost ? 0.25 : 0.55) * (0.6 + 0.4 * (1 - amp)));
    if (ghost) ctx.setLineDash([px(0.02), px(0.02)]);
    ctx.beginPath(); ctx.arc(view.cx, view.cy, r, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // --- particles, ripples, floaters ---------------------------------------

  function drawParticles(ctx) {
    const ps = RS.feel.state.particles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const u = p.age / p.life;
      const a = ease.impact(u);
      if (a <= 0.002) continue;
      const s = px(p.size * 0.006) * (p.kind === 'mote' ? 1 : (1 - u * 0.5));
      const X = sx(p.x), Y = sy(p.y);
      if (p.trail) {
        ctx.strokeStyle = hsl(p.hue, p.sat, p.lum, a * 0.55);
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.moveTo(sx(p.px), sy(p.py)); ctx.lineTo(X, Y);
        ctx.stroke();
      }
      ctx.fillStyle = hsl(p.hue, p.sat, p.lum, a);
      ctx.beginPath(); ctx.arc(X, Y, Math.max(0.5, s), 0, TAU); ctx.fill();
    }
  }

  function drawRipples(ctx) {
    const rs = RS.feel.state.ripples;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      const u = clamp01(r.age / r.life);
      const e = ease[r.ease] ? ease[r.ease](u) : u;
      const rad = px(lerp(r.r0, r.r1, e));
      const a = (1 - u) * (1 - u);
      ctx.strokeStyle = hsl(r.hue, r.sat, 0.68, a * 0.8);
      ctx.lineWidth = Math.max(0.6, px(r.width * 0.0022) * (1 - u * 0.6));
      ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), Math.max(0.5, rad), 0, TAU); ctx.stroke();
    }
  }

  function drawFloaters(ctx) {
    const fs = RS.feel.state.floaters;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      const u = clamp01(f.age / f.life);
      const a = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
      const y = f.y - ease.outCubic(u) * f.rise;
      const scale = f.pop.value;
      ctx.font = '' + f.weight + ' ' + Math.round(f.size * scale) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
      const X = sx(f.x + f.drift * u), Y = sy(y);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(f.text, X + 1, Y + 1.5);
      ctx.fillStyle = hsl(f.hue, 0.95, 0.72, a);
      ctx.fillText(f.text, X, Y);
    }
    ctx.restore();
  }

  // --- post ----------------------------------------------------------------

  function drawPost(ctx) {
    const S = RS.feel.state;
    if (S.vignette > 0.004) {
      const g = ctx.createRadialGradient(view.cx, view.cy, px(0.3), view.cx, view.cy, Math.max(view.w, view.h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,' + (S.vignette * 0.75).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (S.flash > 0.004) {
      /* 'lighter' rather than a flat overlay: a flash should *add* light, and
       * an alpha-blended white wash reads as fog instead of impact. */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hsl(S.flashHue, S.flashSat, 0.5, S.flash * 0.5);
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }
  }

  // --- main ----------------------------------------------------------------

  function draw(game, canvas, ctx, dt) {
    resize(canvas);
    const S = RS.feel.state;
    const D = game.dials;
    const t = game.field.t;

    const focus = RS.dials.focusOf(D.frequency);
    const spec = RS.spectrum.sample(D.frequency.value, focus, game.__spec || (game.__spec = []));
    const blend = RS.spectrum.blendVisual(spec);
    const tierHue = RS.cosmos.hueAt(D.space.value);

    /* The palette is a blend of the layer being observed and the scale it is
     * observed at — so the same layer looks different at every tier, which is
     * the whole "local rules" premise rendered as colour. */
    const mixedHue = RS.core.mixHue(tierHue, blend.hue, clamp01(blend.strength * 0.85));
    vis.hue.set(mixedHue).step(dt);
    vis.sat.set(0.22 + blend.sat * 0.55).step(dt);
    vis.strength.set(blend.strength).step(dt);
    vis.tierMix.set(D.space.value).step(dt);

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);

    // deep background
    const bg = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, Math.max(view.w, view.h) * 0.8);
    bg.addColorStop(0, hsl(vis.hue.value, vis.sat.value * 0.6, 0.10, 1));
    bg.addColorStop(0.55, hsl(vis.hue.value - 12, vis.sat.value * 0.5, 0.055, 1));
    bg.addColorStop(1, '#03050a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, view.w, view.h);

    // camera: shake + zoom punch, applied to the field only so the HUD is stable
    ctx.save();
    const zoom = 1 + S.zoomPunch;
    ctx.translate(view.cx, view.cy);
    ctx.rotate(S.shakeRot);
    ctx.scale(zoom, zoom);
    ctx.translate(-view.cx + S.shakeX * px(0.08), -view.cy + S.shakeY * px(0.08));

    /* Scene dispatch. The attunement field, the solar system and a planet
     * surface are three different worlds drawn by three different modules, but
     * they share this camera, these particles and this post pass — so an
     * impact feels identical in all three, which is what keeps them feeling
     * like one game rather than three minigames. */
    const kind = game.scene ? game.scene.kind : 'field';

    if (kind === 'galaxy') {
      RS.galaxy.draw(ctx, game, dt);
    } else if (kind === 'system') {
      RS.worldrender.drawSystem(ctx, game, dt);
    } else if (kind === 'planet') {
      RS.worldrender.drawPlanet(ctx, game, dt);
    } else {
      // tier backdrops, cross-faded between the two rungs the dial straddles
      const tb = RS.cosmos.tierBlend(vis.tierMix.value);
      const upheavalFade = 1 - game.field.upheaval * 0.55;
      drawBackdrop(ctx, game, tb.a.geometry, tb.a.hue, (1 - tb.t) * 0.55 * upheavalFade, t);
      if (tb.b !== tb.a) drawBackdrop(ctx, game, tb.b.geometry, tb.b.hue, tb.t * 0.55 * upheavalFade, t);

      // rim
      ctx.strokeStyle = hsl(vis.hue.value, vis.sat.value, 0.4, 0.20);
      ctx.lineWidth = Math.max(1, px(0.004));
      ctx.beginPath(); ctx.arc(view.cx, view.cy, px(1.0), 0, TAU); ctx.stroke();

      drawBeatRing(ctx, game, dt, t);

      /* Sort by resolution so identified nodes sit above smudges — otherwise
       * the thing you are working on can be occluded by fog. */
      const nodes = game.field.nodes;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].resolved <= 0.5) drawNode(ctx, game, nodes[i], t);
      }
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].resolved > 0.5) drawNode(ctx, game, nodes[i], t);
      }

      drawReticle(ctx, game, t);
      drawCentre(ctx, game, t, spec);
    }

    /* Scene transitions flash the whole frame rather than cross-fading two
     * render targets — cheaper, and it reads as reality being re-rendered
     * around you, which is what is actually happening. */
    if (game.scene && game.scene.transition > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hsl(vis.hue.value, 0.6, 0.5, game.scene.transition * 0.28);
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }

    drawRipples(ctx);
    drawParticles(ctx);
    drawFloaters(ctx);

    ctx.restore();
    drawPost(ctx);
  }

  RS.render = { view, resize, draw, sx, sy, px, vis };
})(typeof window !== 'undefined' ? (window.RS = window.RS || {}) : (globalThis.RS = globalThis.RS || {}));
