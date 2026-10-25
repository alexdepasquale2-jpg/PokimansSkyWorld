/* Coremind — diegetic vision. You are not a god with a map.
 * You see through bodies. Unseen ground is rumor: a fading stain where
 * something living once stood, then dark again. The Veil (depth 10) is
 * always lit — it is shared thought-space, and hiding it would lie.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const CELL = 8;
  const SIZE = 32;
  const MEMORY = 16;   // seconds a cell stays in memory after last lit
  const NEVER = 99;

  function playerId() {
    return (CM.colony && CM.colony.PLAYER_ID) || 'player';
  }

  function gridSize(game) {
    const w = game && game.world && game.world.size;
    return w ? Math.ceil(w / CELL) : SIZE;
  }

  function makeGrid(n) {
    const g = {
      cover: new Uint8Array(n * n),
      memory: new Float32Array(n * n)
    };
    g.memory.fill(NEVER);
    return g;
  }

  function activateGrid(s, depth, n) {
    if (!s.grids) s.grids = {};
    let g = s.grids[depth];
    if (!g || g.cover.length !== n * n) {
      g = s.grids[depth] = makeGrid(n);
    }
    s.cover = g.cover;
    s.memory = g.memory;
    s.depth = depth;
    return g;
  }

  function ensure(game) {
    if (!game) return null;
    const n = gridSize(game);
    let s = game.sense;
    if (!s || !s.grids || s.size !== n) {
      s = game.sense = {
        depth: game.viewDepth || 0,
        size: n,
        cover: null,
        memory: null,
        chem: false,
        grids: {}
      };
    }
    activateGrid(s, game.viewDepth || 0, n);
    return s;
  }

  function cellIndex(x, y, n) {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return -1;
    return cy * n + cx;
  }

  /* A seer is a living player body. On a raid we still see through the
   * bodies we sent (owner is the Core), not through the host. */
  function isSeer(game, org) {
    if (!org || !org.alive) return false;
    const pid = playerId();
    if (org.ownerId === pid) return true;
    if (org.raidColonyId && game.core && org.ownerId === game.core.id) return true;
    return false;
  }

  function traitId(t) {
    if (!t) return '';
    if (typeof t === 'string') return t;
    return t.id || t.name || '';
  }

  function hasChemTrait(org) {
    const traits = org && org.traits;
    if (!traits) return false;
    for (let i = 0; i < traits.length; i++) {
      const id = traitId(traits[i]).toLowerCase();
      if (!id) continue;
      if (id === 'chemsense' || id === 'chemical' || id === 'chemical_sensing') return true;
      if (id.indexOf('chem') >= 0) return true;
    }
    return false;
  }

  function scanChem(game, depth) {
    const orgs = game.organisms;
    if (!orgs) return false;
    for (let i = 0; i < orgs.length; i++) {
      const org = orgs[i];
      if (!isSeer(game, org)) continue;
      if ((org.depth || 0) !== depth) continue;
      if (hasChemTrait(org)) return true;
    }
    return false;
  }

  function ageMemory(s, dt) {
    const mem = s.memory;
    const n = mem.length;
    for (let i = 0; i < n; i++) {
      const v = mem[i] + dt;
      mem[i] = v > NEVER ? NEVER : v;
    }
  }

  function paintSeers(game, s, depth) {
    const orgs = game.organisms;
    if (!orgs) return;
    const n = s.size;
    const cover = s.cover;
    const mem = s.memory;
    let chem = false;
    for (let i = 0; i < orgs.length; i++) {
      const org = orgs[i];
      if (!isSeer(game, org)) continue;
      if ((org.depth || 0) !== depth) continue;
      if (hasChemTrait(org)) chem = true;
      let senseR = 8;
      if (org.stats) senseR = Math.max(org.stats.vision || 0, org.stats.sense_radius || 0, 6);
      const r2 = senseR * senseR;
      const x0 = Math.max(0, Math.floor((org.x - senseR) / CELL));
      const y0 = Math.max(0, Math.floor((org.y - senseR) / CELL));
      const x1 = Math.min(n - 1, Math.floor((org.x + senseR) / CELL));
      const y1 = Math.min(n - 1, Math.floor((org.y + senseR) / CELL));
      for (let cy = y0; cy <= y1; cy++) {
        const wy = (cy + 0.5) * CELL;
        const row = cy * n;
        for (let cx = x0; cx <= x1; cx++) {
          const wx = (cx + 0.5) * CELL;
          if (K.dist2(org.x, org.y, wx, wy) > r2) continue;
          const idx = row + cx;
          cover[idx] = 1;
          mem[idx] = 0;
        }
      }
    }
    s.chem = chem;
  }

  function tick(game, dt) {
    if (!game) return;
    const s = ensure(game);
    if (!s) return;
    dt = dt || 0;

    /* Off switch: full vision, no darkening. Memory still ages so
     * flipping sight back on does not gift a free remembered map. */
    if (game.senseSight === false) {
      s.cover.fill(1);
      ageMemory(s, dt);
      return;
    }

    const depth = game.viewDepth || 0;
    if (s.depth !== depth) {
      // Swap the active grid; keep prior depths' memory intact.
      activateGrid(s, depth, s.size);
      s.chem = false;
    }

    if (depth === 10) {
      s.cover.fill(1);
      s.memory.fill(0);
      s.chem = false;
      return;
    }

    s.cover.fill(0);
    ageMemory(s, dt);
    paintSeers(game, s, depth);
  }

  function lit(game, x, y, depth) {
    if (!game || game.senseSight === false) return true;
    if (depth === 10) return true;
    if (depth !== (game.viewDepth || 0)) return false;
    const s = game.sense;
    if (!s) return false;
    const i = cellIndex(x, y, s.size || SIZE);
    if (i < 0) return false;
    return s.cover[i] === 1;
  }

  function memory(game, x, y, depth) {
    if (!game) return NEVER;
    if (depth === 10) return 0;
    if (depth !== (game.viewDepth || 0)) return NEVER;
    const s = game.sense;
    if (!s) return NEVER;
    const i = cellIndex(x, y, s.size || SIZE);
    if (i < 0) return NEVER;
    return s.memory[i];
  }

  function auraHot(game, x, y, depth) {
    const A = CM.aura;
    if (!A || !A.sample) return false;
    return A.sample(game, x, y, depth, 'war') > 0.35
        || A.sample(game, x, y, depth, 'dread') > 0.35
        || A.sample(game, x, y, depth, 'hunger') > 0.35;
  }

  /* Render should skip drawOrganism when !visibleOrg(game, org).
   * Unseen bodies are not drawn; peel motes handle other depths.
   * Selection must not land on what the colony has not tasted. */
  function visibleOrg(game, org) {
    if (!org || !org.alive) return false;
    if (!game || game.senseSight === false) return true;
    const depth = org.depth || 0;
    if (depth !== (game.viewDepth || 0)) return false;
    if (depth === 10) return true;
    if (lit(game, org.x, org.y, depth)) return true;
    const s = game.sense;
    const chem = s && s.depth === depth ? s.chem : scanChem(game, depth);
    const mem = memory(game, org.x, org.y, depth);
    if (chem && (mem === NEVER || mem < MEMORY) &&
        (auraHot(game, org.x, org.y, depth) || lit(game, org.x, org.y, depth))) {
      return true;
    }
    return false;
  }

  function drawUnknown(game, ctx, w, h, zoom, dpr, depth) {
    if (!ctx || !game || game.senseSight === false) return;
    if (depth === 10) return;
    if (depth !== (game.viewDepth || 0)) return;
    const s = game.sense;
    if (!s) return;
    const cam = game.camera;
    if (!cam) return;
    const n = s.size || SIZE;
    const cover = s.cover;
    const mem = s.memory;
    const cx = cam.x, cy = cam.y;
    const halfW = w / (2 * zoom), halfH = h / (2 * zoom);
    const x0 = Math.max(0, Math.floor((cx - halfW) / CELL));
    const y0 = Math.max(0, Math.floor((cy - halfH) / CELL));
    const x1 = Math.min(n - 1, Math.floor((cx + halfW) / CELL));
    const y1 = Math.min(n - 1, Math.floor((cy + halfH) / CELL));
    const cellPx = CELL * zoom;

    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass === 0 ? 'rgba(4,8,13,0.45)' : 'rgba(4,8,13,0.72)';
      for (let j = y0; j <= y1; j++) {
        const row = j * n;
        const sy = (j * CELL - cy) * zoom + h / 2;
        for (let i = x0; i <= x1; i++) {
          const idx = row + i;
          if (cover[idx]) continue;
          const remembered = mem[idx] < MEMORY;
          if (pass === 0 ? !remembered : remembered) continue;
          ctx.fillRect((i * CELL - cx) * zoom + w / 2, sy, cellPx, cellPx);
        }
      }
    }
  }

  CM.sense = {
    CELL, SIZE, MEMORY, NEVER,
    ensure, tick, lit, memory, visibleOrg, drawUnknown
  };
})(window.CM = window.CM || {});
