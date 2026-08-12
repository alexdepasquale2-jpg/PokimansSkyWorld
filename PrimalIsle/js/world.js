/* Primal Isle — the island itself.
 *
 * Generated from a seed and never saved: the same seed rebuilds the same
 * coastline, the same river, the same highland. Only the things that change
 * during play (how much of a fern is left, where the bodies are) go in the
 * save.
 */
(function (ISLE) {
  'use strict';
  const C = ISLE.content;
  const { clamp, lerp, fbm, rngFrom, dist } = ISLE.core;

  const CELL = 12;                          // world units per biome cell
  const GN = Math.ceil(C.WORLD / CELL);     // cells per side
  const B = ['ocean', 'shallow', 'beach', 'plains', 'forest', 'swamp', 'river', 'lake', 'highland'];
  const BI = {}; B.forEach((id, i) => { BI[id] = i; });

  /* Named places, so the HUD can say where you are and the map means
   * something. Positions are in fractions of the world. */
  const PLACES = [
    { name: 'The Spine',      fx: 0.50, fy: 0.46, r: 300 },
    { name: 'Redwater Lake',  fx: 0.31, fy: 0.36, r: 250 },
    { name: 'Stillmere',      fx: 0.66, fy: 0.62, r: 230 },
    { name: 'The Fen',        fx: 0.62, fy: 0.30, r: 260 },
    { name: 'Longstrand',     fx: 0.50, fy: 0.90, r: 320 },
    { name: 'North Reach',    fx: 0.50, fy: 0.12, r: 320 },
    { name: 'Blackpine',      fx: 0.26, fy: 0.62, r: 300 },
    { name: 'Sunward Plain',  fx: 0.76, fy: 0.46, r: 300 }
  ];

  function build(seed) {
    const rng = rngFrom(seed);
    const grid = new Uint8Array(GN * GN);
    const cx = C.WORLD / 2, cy = C.WORLD / 2;
    const baseR = C.WORLD * 0.405;

    // Lakes, placed before the terrain so the swamp can hug them.
    const lakes = [
      { x: C.WORLD * 0.31, y: C.WORLD * 0.36, r: 168 },
      { x: C.WORLD * 0.66, y: C.WORLD * 0.62, r: 142 },
      { x: C.WORLD * 0.60, y: C.WORLD * 0.29, r: 96 }
    ];

    /* One river, from the highland down to the south-west coast, as a
     * poly-line the terrain pass carves out. */
    const river = [];
    {
      let x = cx + 40, y = cy + 20, a = 2.35;
      for (let i = 0; i < 70; i++) {
        river.push({ x, y, w: lerp(34, 62, i / 69) });
        a += (rng() - 0.5) * 0.42;
        a = lerp(a, 2.35, 0.22);
        x += Math.cos(a) * 26; y += Math.sin(a) * 26;
      }
    }

    function elevation(x, y) {
      const d = dist(x, y, cx, cy) / baseR;
      const warp = (fbm(seed, x / 620, y / 620, 4) - 0.5) * 0.62;
      return 1 - d + warp;
    }

    for (let gy = 0; gy < GN; gy++) {
      for (let gx = 0; gx < GN; gx++) {
        const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2;
        const e = elevation(x, y);
        let id;
        if (e < -0.06) id = 'ocean';
        else if (e < 0.015) id = 'shallow';
        else if (e < 0.075) id = 'beach';
        else {
          const moist = fbm(seed + 991, x / 340, y / 340, 3);
          if (e > 0.62) id = 'highland';
          else if (moist > 0.56) id = 'forest';
          else id = 'plains';
        }
        grid[gy * GN + gx] = BI[id];
      }
    }

    // Carve the lakes and the marsh collar around them.
    for (const L of lakes) {
      const r2 = L.r + 78;
      for (let gy = Math.max(0, ((L.y - r2) / CELL) | 0); gy < Math.min(GN, ((L.y + r2) / CELL) | 0 + 1); gy++) {
        for (let gx = Math.max(0, ((L.x - r2) / CELL) | 0); gx < Math.min(GN, ((L.x + r2) / CELL) | 0 + 1); gx++) {
          const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2;
          const d = dist(x, y, L.x, L.y);
          const wob = (fbm(seed + 77, x / 130, y / 130, 2) - 0.5) * 60;
          const cur = grid[gy * GN + gx];
          if (cur === BI.ocean || cur === BI.shallow) continue;
          if (d + wob < L.r) grid[gy * GN + gx] = BI.lake;
          else if (d + wob < L.r + 70) grid[gy * GN + gx] = BI.swamp;
        }
      }
    }

    // Carve the river last so it cuts through everything but the sea.
    for (const p of river) {
      const r = p.w;
      for (let gy = Math.max(0, ((p.y - r) / CELL) | 0); gy <= Math.min(GN - 1, ((p.y + r) / CELL) | 0); gy++) {
        for (let gx = Math.max(0, ((p.x - r) / CELL) | 0); gx <= Math.min(GN - 1, ((p.x + r) / CELL) | 0); gx++) {
          const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2;
          const cur = grid[gy * GN + gx];
          if (cur === BI.ocean || cur === BI.shallow) continue;
          const d = dist(x, y, p.x, p.y);
          if (d < r * 0.62) grid[gy * GN + gx] = BI.river;
          else if (d < r && cur !== BI.lake) grid[gy * GN + gx] = BI.swamp;
        }
      }
    }

    const w = { seed, grid, lakes, river, cx, cy, baseR };
    w.nodes = seedNodes(w, rng);
    return w;
  }

  function biomeIdAt(w, x, y) {
    const gx = (x / CELL) | 0, gy = (y / CELL) | 0;
    if (gx < 0 || gy < 0 || gx >= GN || gy >= GN) return 'ocean';
    return B[w.grid[gy * GN + gx]];
  }
  const biomeAt = (w, x, y) => C.BIOMES[biomeIdAt(w, x, y)];

  const isWater = (w, x, y) => !!biomeAt(w, x, y).water;
  const isFresh = (w, x, y) => biomeAt(w, x, y).water === 'fresh';
  const isSalt = (w, x, y) => biomeAt(w, x, y).water === 'salt';
  const isDeep = (w, x, y) => biomeIdAt(w, x, y) === 'ocean';

  function slowAt(w, x, y) { return biomeAt(w, x, y).slow; }
  function coverAt(w, x, y) { return biomeAt(w, x, y).cover; }

  /* Can I drink from here? Standing in fresh water, or on its bank. */
  function drinkableAt(w, x, y) {
    if (isFresh(w, x, y)) return 'fresh';
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const b = biomeAt(w, x + Math.cos(ang) * 26, y + Math.sin(ang) * 26);
      if (b.water === 'fresh') return 'fresh';
    }
    if (isSalt(w, x, y)) return 'salt';
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const b = biomeAt(w, x + Math.cos(ang) * 26, y + Math.sin(ang) * 26);
      if (b.water === 'salt') return 'salt';
    }
    return null;
  }

  function regionName(w, x, y) {
    let best = null, bd = Infinity;
    for (const p of PLACES) {
      const d = dist(x, y, p.fx * C.WORLD, p.fy * C.WORLD);
      if (d < p.r && d < bd) { bd = d; best = p; }
    }
    if (best) return best.name;
    return C.BIOMES[biomeIdAt(w, x, y)].name;
  }

  /* --- food nodes ------------------------------------------------------
   * Scattered once, then depleted and regrown during play. Every entry knows
   * which biome it belongs to so regrowth does not have to re-check.
   */
  function seedNodes(w, rng) {
    const nodes = [];
    const want = 460;
    let guard = 0;
    while (nodes.length < want && guard++ < want * 40) {
      const x = rng() * C.WORLD, y = rng() * C.WORLD;
      const bid = biomeIdAt(w, x, y);
      if (bid === 'ocean') continue;

      const plants = Object.values(C.PLANTS).filter(p => p.biomes.includes(bid));
      const critters = Object.values(C.CRITTERS).filter(p => p.biomes.includes(bid));
      const pool = [];
      for (const p of plants) pool.push({ kind: 'plant', def: p });
      for (const p of critters) pool.push({ kind: 'critter', def: p });
      if (!pool.length) continue;

      const chosen = pool[(rng() * pool.length) | 0];
      nodes.push({
        x, y, kind: chosen.kind, type: chosen.def.id,
        amt: 1,                                  // 0..1 of a full meal
        t: 0,                                    // regrow timer
        seedv: (rng() * 1000) | 0
      });
    }
    return nodes;
  }

  function nodeDef(n) {
    return n.kind === 'plant' ? C.PLANTS[n.type] : C.CRITTERS[n.type];
  }

  function tickNodes(w, dt) {
    for (const n of w.nodes) {
      if (n.amt >= 1) continue;
      const def = nodeDef(n);
      const per = n.kind === 'plant' ? def.regrow : def.respawn;
      n.amt = Math.min(1, n.amt + dt / per);
    }
  }

  /* Everything edible within `r`, for the AI and for the eat button. */
  function nodesNear(w, x, y, r, diet) {
    const out = [];
    const r2 = r * r;
    for (const n of w.nodes) {
      if (n.amt < 0.25) continue;
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy > r2) continue;
      if (diet === 'herbivore' && n.kind !== 'plant') continue;
      if (diet === 'carnivore' && n.kind !== 'critter') continue;
      out.push(n);
    }
    return out;
  }

  /* A spawn point: land, not highland, and preferably under cover. Hatchlings
   * spawn where they have a chance, which is nowhere near the middle. */
  function spawnPoint(w, rng) {
    rng = rng || Math.random;
    for (let i = 0; i < 400; i++) {
      const a = rng() * Math.PI * 2;
      const d = lerp(w.baseR * 0.55, w.baseR * 0.92, rng());
      const x = w.cx + Math.cos(a) * d, y = w.cy + Math.sin(a) * d;
      const bid = biomeIdAt(w, x, y);
      if (bid === 'forest' || bid === 'plains' || bid === 'swamp') return { x, y };
    }
    return { x: w.cx, y: w.cy + w.baseR * 0.7 };
  }

  /* Push a position back onto walkable ground — used when something wanders
   * into deep water it cannot survive. */
  function nudgeAshore(w, x, y) {
    let bx = x, by = y, best = Infinity;
    for (let a = 0; a < 16; a++) {
      for (let d = 40; d <= 260; d += 40) {
        const ang = (a / 16) * Math.PI * 2;
        const nx = x + Math.cos(ang) * d, ny = y + Math.sin(ang) * d;
        if (!isWater(w, nx, ny) && d < best) { best = d; bx = nx; by = ny; }
      }
      if (best < Infinity) break;
    }
    return { x: bx, y: by };
  }

  /* --- day/night -------------------------------------------------------
   * 0 = midnight, 1 = noon. Vision at night is species-dependent, which is
   * the whole reason a nocturnal premium raptor is worth money.
   */
  function daylight(clock) {
    const t = (clock % C.DAY_LENGTH) / C.DAY_LENGTH;
    return clamp(0.5 - 0.5 * Math.cos(t * Math.PI * 2), 0, 1);
  }
  function phaseName(clock) {
    const t = (clock % C.DAY_LENGTH) / C.DAY_LENGTH;
    if (t < 0.16) return 'Night';
    if (t < 0.3) return 'Dawn';
    if (t < 0.66) return 'Day';
    if (t < 0.82) return 'Dusk';
    return 'Night';
  }

  ISLE.world = {
    CELL, GN, build, biomeAt, biomeIdAt, isWater, isFresh, isSalt, isDeep,
    slowAt, coverAt, drinkableAt, regionName, tickNodes, nodesNear, nodeDef,
    spawnPoint, nudgeAshore, daylight, phaseName, PLACES
  };
})(window.ISLE = window.ISLE || {});
