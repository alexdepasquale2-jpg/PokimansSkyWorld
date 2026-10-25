/* Kiln — the drawing format, its renderer, and the peers' hands.
 *
 * A drawing is a list of strokes in normalised 0..1 space, not a bitmap.
 * Three reasons, in order of how much they matter:
 *
 *   It stays sharp at any size, so the same data is the thumbnail and the
 *   full piece. It stays small, so a year of drawing fits in localStorage
 *   next to everything else. And it is legible — a user who opens the Audit
 *   tab sees a list of lines with colours, which is what they drew, rather
 *   than a wall of base64 that could be anything.
 *
 * Peers draw through the exact same format and the exact same renderer.
 * There is no separate "nice art" path for the simulated people, which keeps
 * the feed honest: everything in it was made with the tool you have.
 */
(function (K) {
  'use strict';
  const { seeded, clamp } = K.core;

  /* Twelve colours. A limited palette is the single most reliable way to
   * make a beginner's drawing look composed, and picking from twelve is a
   * decision, where picking from sixteen million is a search. */
  const PALETTE = [
    '#1b1b1e', '#f5f2ea', '#c8453a', '#e2793a', '#e9b93b',
    '#5c9a4a', '#2f7f74', '#3b6fb0', '#6a4fa3', '#c05a8e',
    '#8a6a4f', '#9aa3a8'
  ];

  const PAPERS = ['#f5f2ea', '#e8e3d6', '#1b1b1e', '#22303a', '#f0e4e4'];

  const SIZES = [2, 5, 11, 22];

  function isDarkPaper(paper) {
    const hex = PAPERS[paper] || PAPERS[0];
    const r = parseInt(hex.slice(1, 3), 16),
          g = parseInt(hex.slice(3, 5), 16),
          b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 110;
  }

  function blank() { return { paper: 0, strokes: [] }; }

  /* --- renderer -----------------------------------------------------------
   * One function draws every drawing in the app: yours in the studio, yours
   * on the shelf, the peers' in the feed, and every thumbnail. */
  function render(ctx, art, w, h) {
    ctx.save();
    ctx.fillStyle = PAPERS[art.paper] || PAPERS[0];
    ctx.fillRect(0, 0, w, h);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const scale = Math.min(w, h);

    for (const st of art.strokes || []) {
      const pts = st.pts;
      if (!pts || pts.length < 2) continue;
      ctx.strokeStyle = PALETTE[st.c] || PALETTE[0];
      ctx.lineWidth = Math.max(0.6, (SIZES[st.s] || 5) * scale / 640);
      ctx.globalAlpha = st.a === undefined ? 1 : st.a;

      ctx.beginPath();
      ctx.moveTo(pts[0] * w, pts[1] * h);
      if (pts.length === 2) {
        // A single tap is a dot, which the round cap draws for us.
        ctx.lineTo(pts[0] * w + 0.01, pts[1] * h);
      } else {
        /* Midpoint quadratics: the drawn line follows the finger without the
         * corners that raw lineTo leaves at every sampled point. */
        for (let i = 2; i < pts.length - 2; i += 2) {
          const mx = (pts[i] + pts[i + 2]) / 2, my = (pts[i + 1] + pts[i + 3]) / 2;
          ctx.quadraticCurveTo(pts[i] * w, pts[i + 1] * h, mx * w, my * h);
        }
        ctx.lineTo(pts[pts.length - 2] * w, pts[pts.length - 1] * h);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Fit a canvas to its box at device resolution and render into it. */
  function paint(canvas, art, cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(cssW)), h = Math.max(1, Math.round(cssH));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(ctx, art, w, h);
  }

  /* --- how many colours a piece uses, for the practice constraint --------- */
  function coloursUsed(art) {
    const set = {};
    for (const st of art.strokes || []) set[st.c] = 1;
    return Object.keys(set).length;
  }

  function coverage(art) {
    // Rough: does the work reach all four edges?
    let minx = 1, miny = 1, maxx = 0, maxy = 0;
    for (const st of art.strokes || []) {
      for (let i = 0; i < st.pts.length; i += 2) {
        minx = Math.min(minx, st.pts[i]); maxx = Math.max(maxx, st.pts[i]);
        miny = Math.min(miny, st.pts[i + 1]); maxy = Math.max(maxy, st.pts[i + 1]);
      }
    }
    return { minx, miny, maxx, maxy, area: Math.max(0, maxx - minx) * Math.max(0, maxy - miny) };
  }

  /* --- the peers' hands ---------------------------------------------------
   * Six ways of making marks. Each peer leans on a couple of them, so their
   * work is recognisable across days without ever being the same drawing.
   * Seeded on (day, peer), so a peer's Tuesday is their Tuesday no matter how
   * many times you open it. */

  function line(c, s, pts, a) { return a === undefined ? { c, s, pts } : { c, s, pts, a }; }

  function arc(cx, cy, r, from, to, steps, wob, rng) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = from + (to - from) * (i / steps);
      const rr = r * (1 + (wob ? (rng() - 0.5) * wob : 0));
      pts.push(clamp(cx + Math.cos(t) * rr, 0, 1), clamp(cy + Math.sin(t) * rr * 1.0, 0, 1));
    }
    return pts;
  }

  function wobbly(x1, y1, x2, y2, wob, rng, steps) {
    steps = steps || 6;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(
        clamp(x1 + (x2 - x1) * t + (rng() - 0.5) * wob, 0, 1),
        clamp(y1 + (y2 - y1) * t + (rng() - 0.5) * wob, 0, 1)
      );
    }
    return pts;
  }

  const HANDS = {
    /* Towers that lean. Nour's. */
    architecture(rng, pal) {
      const out = [];
      const n = rng.int(3, 6);
      let x = 0.1;
      for (let i = 0; i < n; i++) {
        const w = rng() * 0.14 + 0.06;
        const top = rng() * 0.45 + 0.12;
        const lean = (rng() - 0.5) * 0.09;
        const c = rng.pick(pal), s = rng.int(0, 2);
        out.push(line(c, s, wobbly(x, 0.88, x + lean, top, 0.012, rng, 5)));
        out.push(line(c, s, wobbly(x + w, 0.88, x + w + lean, top, 0.012, rng, 5)));
        out.push(line(c, s, wobbly(x + lean, top, x + w + lean, top, 0.01, rng, 3)));
        const floors = rng.int(1, 4);
        for (let f = 1; f <= floors; f++) {
          const t = f / (floors + 1);
          const y = 0.88 + (top - 0.88) * t;
          out.push(line(c, 0, wobbly(x + lean * t, y, x + w + lean * t, y, 0.006, rng, 3), 0.7));
        }
        x += w + rng() * 0.08 + 0.02;
        if (x > 0.86) break;
      }
      out.push(line(rng.pick(pal), 1, wobbly(0.02, 0.9, 0.98, 0.9, 0.006, rng, 8)));
      return out;
    },

    /* Soft closed shapes that overlap. Priya's. */
    blobs(rng, pal) {
      const out = [];
      const n = rng.int(2, 5);
      for (let i = 0; i < n; i++) {
        const cx = rng() * 0.7 + 0.15, cy = rng() * 0.6 + 0.2;
        const r = rng() * 0.18 + 0.08;
        out.push(line(rng.pick(pal), rng.int(1, 3),
          arc(cx, cy, r, 0, Math.PI * 2, 22, 0.22, rng), rng() * 0.35 + 0.6));
      }
      const c = rng.pick(pal);
      for (let i = 0; i < rng.int(3, 9); i++) {
        const x = rng(), y = rng();
        out.push(line(c, 0, [x, y, x + 0.001, y]));
      }
      return out;
    },

    /* Everything radiating from one point. */
    burst(rng, pal) {
      const out = [];
      const cx = rng() * 0.5 + 0.25, cy = rng() * 0.4 + 0.3;
      const n = rng.int(9, 26);
      const c1 = rng.pick(pal), c2 = rng.pick(pal);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.1;
        const r = rng() * 0.34 + 0.1;
        out.push(line(rng.chance(0.7) ? c1 : c2, rng.int(0, 2),
          wobbly(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.01, rng, 3)));
      }
      out.push(line(rng.pick(pal), rng.int(1, 3), arc(cx, cy, 0.05, 0, Math.PI * 2, 16, 0.12, rng)));
      return out;
    },

    /* A land and a sky, roughly. */
    horizon(rng, pal) {
      const out = [];
      const hy = rng() * 0.3 + 0.45;
      const sky = rng.pick(pal);
      for (let i = 0; i < rng.int(3, 8); i++) {
        const y = hy - (i + 1) * (hy / 9) - rng() * 0.02;
        out.push(line(sky, rng.int(0, 1), wobbly(0.02, y, 0.98, y, 0.014, rng, 9), 0.55));
      }
      const land = rng.pick(pal);
      const ridge = [];
      let y = hy;
      for (let x = 0; x <= 1.0001; x += 0.08) {
        y = clamp(y + (rng() - 0.5) * 0.07, hy - 0.12, hy + 0.08);
        ridge.push(clamp(x, 0, 1), y);
      }
      out.push(line(land, 2, ridge));
      const solid = rng.pick(pal);
      for (let i = 0; i < rng.int(2, 6); i++) {
        const x = rng() * 0.9 + 0.05;
        const h = rng() * 0.12 + 0.03;
        out.push(line(solid, rng.int(0, 1), wobbly(x, hy + 0.06, x, hy + 0.06 - h, 0.006, rng, 3)));
      }
      return out;
    },

    /* A grid that goes wrong somewhere. */
    grid(rng, pal) {
      const out = [];
      const n = rng.int(4, 8);
      const c = rng.pick(pal), c2 = rng.pick(pal);
      const pad = 0.1, span = 1 - pad * 2;
      const skipR = rng.int(0, n - 1), skipC = rng.int(0, n - 1);
      for (let r = 0; r < n; r++) {
        for (let col = 0; col < n; col++) {
          const x = pad + (col / n) * span, y = pad + (r / n) * span;
          const w = span / n * 0.78;
          const odd = (r === skipR && col === skipC);
          const cc = odd ? c2 : c;
          if (odd && rng.chance(0.5)) {
            out.push(line(cc, 2, arc(x + w / 2, y + w / 2, w / 2, 0, Math.PI * 2, 14, 0.1, rng)));
          } else {
            out.push(line(cc, odd ? 2 : 0, [x, y, x + w, y, x + w, y + w, x, y + w, x, y]));
          }
        }
      }
      return out;
    },

    /* A thing with legs. Always slightly wrong. */
    creature(rng, pal) {
      const out = [];
      const c = rng.pick(pal), c2 = rng.pick(pal);
      const cx = 0.5 + (rng() - 0.5) * 0.15, cy = 0.45 + (rng() - 0.5) * 0.1;
      const rw = rng() * 0.12 + 0.12, rh = rng() * 0.1 + 0.08;
      const body = [];
      for (let i = 0; i <= 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        body.push(clamp(cx + Math.cos(t) * rw * (1 + (rng() - 0.5) * 0.2), 0, 1),
                  clamp(cy + Math.sin(t) * rh * (1 + (rng() - 0.5) * 0.2), 0, 1));
      }
      out.push(line(c, 2, body));
      const legs = rng.int(2, 7);
      for (let i = 0; i < legs; i++) {
        const t = -0.2 + (i / Math.max(1, legs - 1)) * 1.4;
        const x = cx + Math.cos(t * Math.PI) * rw * 0.8;
        out.push(line(c, 1, wobbly(x, cy + rh * 0.7, x + (rng() - 0.5) * 0.1,
          clamp(cy + rh + rng() * 0.25 + 0.05, 0, 0.97), 0.02, rng, 4)));
      }
      const eyes = rng.int(1, 4);
      for (let i = 0; i < eyes; i++) {
        const x = cx + (rng() - 0.5) * rw, y = cy - rh * 0.3 + (rng() - 0.5) * 0.05;
        out.push(line(c2, 2, [x, y, x + 0.001, y]));
      }
      return out;
    }
  };

  const HAND_IDS = Object.keys(HANDS);

  /* Each peer gets a stable pair of hands and a palette bias, so you learn to
   * recognise their work — which is the actual pleasure of a small feed. */
  function peerPalette(peer, rng) {
    const base = [];
    const hue = peer.hue;
    // Pick palette entries near the peer's hue, plus an ink and an accent.
    const order = PALETTE.map((hex, i) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255,
            g = parseInt(hex.slice(3, 5), 16) / 255,
            b = parseInt(hex.slice(5, 7), 16) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let h = 0;
      if (mx !== mn) {
        const d = mx - mn;
        if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      let diff = Math.abs(h - hue); if (diff > 180) diff = 360 - diff;
      return { i, diff, grey: mx - mn < 0.12 };
    }).sort((a, b) => a.diff - b.diff);

    base.push(order[0].i, order[1].i);
    if (rng.chance(0.7)) base.push(order[2].i);
    base.push(0);                       // ink is always available
    return base;
  }

  function generate(peer, day, craftSeed) {
    const rng = seeded('art', peer.id, day, craftSeed || '');
    const handRng = seeded('hand', peer.id);
    const hands = handRng.shuffle(HAND_IDS).slice(0, 2);
    const hand = rng.chance(0.75) ? hands[0] : hands[1];
    const pal = peerPalette(peer, rng);
    const paper = rng.chance(0.75) ? rng.int(0, 1) : rng.int(0, PAPERS.length - 1);
    let strokes = HANDS[hand](rng, isDarkPaper(paper) ? pal.concat([1]) : pal);
    /* Dark paper needs light marks or the piece is a black square, which is
     * a joke the peers are not making. */
    if (isDarkPaper(paper)) {
      strokes = strokes.map(st => (st.c === 0 ? Object.assign({}, st, { c: 1 }) : st));
    }
    return { paper, strokes, hand };
  }

  K.art = {
    PALETTE, PAPERS, SIZES, blank, render, paint, generate,
    coloursUsed, coverage, isDarkPaper
  };
})(window.Kiln = window.Kiln || {});
