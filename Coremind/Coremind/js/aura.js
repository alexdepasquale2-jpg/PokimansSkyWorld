/* Coremind — living weather. Influence is what the architecture did to
 * the rock; this is what the living are feeling right now. Hunger,
 * dread, brood and war stamp a coarse grid the AI and the overlay
 * both read. Hiding the overlay does not stop the weather.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const CHANNELS = ['hunger', 'dread', 'brood', 'war', 'spore', 'mind'];
  const CELL = 8;
  const SIZE = 32;              // world 256 / 8; resized from world.size if present
  const NCHAN = CHANNELS.length;
  const MAX_DEPTH = 10;
  const CAP = 4.0;
  const DRAW_MIN = 0.12;

  const CHANNEL_INDEX = {
    hunger: 0, dread: 1, brood: 2, war: 3, spore: 4, mind: 5
  };
  const CHANNEL_COLOR = {
    hunger: [126, 224, 129],
    dread: [154, 92, 212],
    brood: [208, 122, 164],
    war: [239, 91, 91],
    spore: [80, 196, 168],
    mind: [139, 172, 15]
  };

  function zeros() {
    return { hunger: 0, dread: 0, brood: 0, war: 0, spore: 0, mind: 0 };
  }

  /* World 256 → 32. A non-256 map still fits the same cell size. */
  function sizeOf(game) {
    const w = game && game.world && game.world.size;
    return w ? Math.ceil(w / CELL) : SIZE;
  }

  function chanOf(channel) {
    if (typeof channel === 'number') return channel;
    const i = CHANNEL_INDEX[channel];
    return i == null ? -1 : i;
  }

  function cellOf(x, y, n) {
    return {
      cx: K.clamp(Math.floor(x / CELL), 0, n - 1),
      cy: K.clamp(Math.floor(y / CELL), 0, n - 1)
    };
  }

  function ensure(game) {
    if (!game.aura) game.aura = { grids: {}, gen: 0 };
    return game.aura;
  }

  function gridFor(game, depth) {
    const aura = ensure(game);
    const n = sizeOf(game);
    const need = n * n * NCHAN;
    let g = aura.grids[depth];
    if (!g || g.length !== need) {
      g = new Float32Array(need);
      aura.grids[depth] = g;
    }
    return g;
  }

  function clearViewed(game, depth) {
    const g = gridFor(game, depth);
    g.fill(0);
    return g;
  }

  function stamp(game, depth, x, y, channel, amount, radius) {
    const ch = chanOf(channel);
    if (ch < 0 || ch >= NCHAN || !amount) return;
    const n = sizeOf(game);
    const g = gridFor(game, depth);
    const r = radius == null ? 3 : radius;
    const c = cellOf(x, y, n);
    if (r <= 0) {
      const i = (c.cy * n + c.cx) * NCHAN + ch;
      const v = g[i] + amount;
      g[i] = v > CAP ? CAP : v;
      return;
    }
    const span = Math.ceil(r);
    const x0 = Math.max(0, c.cx - span);
    const x1 = Math.min(n - 1, c.cx + span);
    const y0 = Math.max(0, c.cy - span);
    const y1 = Math.min(n - 1, c.cy + span);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const d = K.dist(gx, gy, c.cx, c.cy);
        if (d >= r) continue;
        const falloff = K.lerp(1, 0, d / r);
        const i = (gy * n + gx) * NCHAN + ch;
        const v = g[i] + amount * falloff;
        g[i] = v > CAP ? CAP : v;
      }
    }
  }

  function at(game, x, y, depth) {
    const out = zeros();
    if (!game || !game.aura || !game.aura.grids) return out;
    const g = game.aura.grids[depth];
    if (!g) return out;
    const n = sizeOf(game);
    const c = cellOf(x, y, n);
    const base = (c.cy * n + c.cx) * NCHAN;
    if (base + NCHAN > g.length) return out;
    out.hunger = g[base];
    out.dread = g[base + 1];
    out.brood = g[base + 2];
    out.war = g[base + 3];
    out.spore = g[base + 4];
    out.mind = g[base + 5];
    return out;
  }

  function sample(game, x, y, depth, channel) {
    const ch = chanOf(channel);
    if (ch < 0 || ch >= NCHAN) return 0;
    if (!game || !game.aura || !game.aura.grids) return 0;
    const g = game.aura.grids[depth];
    if (!g) return 0;
    const n = sizeOf(game);
    const c = cellOf(x, y, n);
    const i = (c.cy * n + c.cx) * NCHAN + ch;
    return i < g.length ? g[i] : 0;
  }

  /* Viewed depth plus peel neighbors. Dream layers keep no weather. */
  function maintainedDepths(game) {
    const view = game.viewDepth || 0;
    const depths = [view];
    if (game.peel !== false) {
      if (view - 1 >= 0 && view - 1 <= MAX_DEPTH) depths.push(view - 1);
      if (view + 1 >= 0 && view + 1 <= MAX_DEPTH) depths.push(view + 1);
    }
    return depths;
  }

  function decayGrid(g, dt) {
    const dec = dt * 0.55;
    for (let i = 0; i < g.length; i++) {
      const v = g[i] - dec;
      g[i] = v > 0 ? v : 0;
    }
  }

  function isSelected(game, org) {
    return !!(game.selectedIds && game.selectedIds.indexOf(org.id) >= 0);
  }

  function isWildPredator(org) {
    if (!org || org.ownerId !== 'wild' || !org.speciesId || !CM.traits) return false;
    const sp = CM.traits.WILD_BY_ID && CM.traits.WILD_BY_ID[org.speciesId];
    return !!(sp && sp.tier === 'predator');
  }

  function stampLiving(game, depth) {
    const orgs = game.organisms;
    const playerBodies = [];
    const wildPreds = [];
    if (orgs) {
      for (let i = 0; i < orgs.length; i++) {
        const org = orgs[i];
        if (!org.alive || (org.depth || 0) !== depth) continue;
        if (org.hunger > 55) {
          stamp(game, depth, org.x, org.y, 'hunger', (org.hunger - 55) / 45 * 0.9, 2);
        }
        if (org.state === 'FLEE') {
          stamp(game, depth, org.x, org.y, 'dread', 0.7, 2);
        } else if (org.state === 'ATTACK') {
          stamp(game, depth, org.x, org.y, 'war', 0.85, 2);
        }
        if (org.state === 'REPRODUCE') {
          stamp(game, depth, org.x, org.y, 'brood', 0.65, 2);
        }
        const fovea = CM.mind && CM.mind.band
          ? CM.mind.band(game, org) === 'fovea'
          : isSelected(game, org);
        if (isSelected(game, org) || fovea) {
          stamp(game, depth, org.x, org.y, 'mind', 1.0, 2);
        }
        if (org.ownerId === 'player') playerBodies.push(org);
        if (isWildPredator(org)) wildPreds.push(org);
      }
    }

    /* Predator within 6 of a player body paints dread on the threatened cell. */
    for (let i = 0; i < playerBodies.length; i++) {
      const body = playerBodies[i];
      for (let j = 0; j < wildPreds.length; j++) {
        const pred = wildPreds[j];
        if (K.dist(body.x, body.y, pred.x, pred.y) <= 6) {
          stamp(game, depth, body.x, body.y, 'dread', 0.75, 2);
          break;
        }
      }
    }

    /* Core is surface attention. Only paint it onto the surface grid. */
    if (game.core && (game.viewDepth || 0) === 0 && depth === 0) {
      stamp(game, 0, game.core.x, game.core.y, 'mind', 1.2, 3);
    }

    /* Empty granary / starved stores — hunger weather at the pit or Core. */
    if (game.core && CM.structures && CM.structures.all) {
      const allSites = CM.structures.all(game);
      const granaries = [];
      for (let i = 0; i < allSites.length; i++) {
        const s = allSites[i];
        if (s.type === 'GRANARY' && s.done && s.colonyId === game.core.id) granaries.push(s);
      }
      if (granaries.length) {
        for (let i = 0; i < granaries.length; i++) {
          const g = granaries[i];
          if ((g.depth || 0) !== depth) continue;
          const store = g.store != null ? g.store : (game.core.biomass || 0);
          if (store <= 8) stamp(game, depth, g.x, g.y, 'hunger', 0.8, 3);
        }
      } else if ((game.core.biomass || 0) < 20 && depth === 0) {
        stamp(game, 0, game.core.x, game.core.y, 'hunger', 0.8, 3);
      }
    }

    /* Breed labor on this stratum paints brood at the Core (surface) or
     * finished player chambers below. */
    if (game.core && CM.structures && CM.structures.laborOf) {
      const labor = CM.structures.laborOf(game.core, depth);
      if ((labor.breed || 0) >= 2) {
        if (depth === 0) {
          stamp(game, 0, game.core.x, game.core.y, 'brood', 0.45, 2);
        } else if (CM.structures.all) {
          const list = CM.structures.all(game);
          for (let i = 0; i < list.length; i++) {
            const site = list[i];
            if (!site.done || (site.depth || 0) !== depth) continue;
            if (site.colonyId !== game.core.id) continue;
            stamp(game, depth, site.x, site.y, 'brood', 0.45, 2);
          }
        }
      }
    }

    /* Layer-4 dominance feeds spore weather across player L4 chambers. */
    if (depth === 4 && CM.layers && CM.layers.dominantOf) {
      const dom = CM.layers.dominantOf(game, 4);
      if (dom && dom.colonyId === 'player' && CM.structures && CM.structures.all) {
        const list = CM.structures.all(game);
        for (let i = 0; i < list.length; i++) {
          const site = list[i];
          if (!site.done || (site.depth || 0) !== 4) continue;
          if (site.colonyId !== 'player') continue;
          stamp(game, 4, site.x, site.y, 'spore', 0.9, 3);
        }
      }
    }

    if (CM.structures && CM.structures.all) {
      const list = CM.structures.all(game);
      for (let i = 0; i < list.length; i++) {
        const site = list[i];
        if ((site.depth || 0) !== depth) continue;
        if (site.type === 'FUNGARIUM' || site.type === 'SPOREWELL') {
          stamp(game, depth, site.x, site.y, 'spore', 0.8, 3);
        }
        if (site.type === 'NURSERY') {
          stamp(game, depth, site.x, site.y, 'brood', 0.5, 3);
        }
        if (site.integrity != null && site.integrity < 70 && site.done) {
          stamp(game, depth, site.x, site.y, 'dread', 0.6, 2);
        }
        /* Hostile standing on a finished chamber paints war. */
        if (site.done && orgs) {
          const r = (CM.structures.radiusOf ? CM.structures.radiusOf(site) : 6) * 0.55;
          for (let j = 0; j < orgs.length; j++) {
            const o = orgs[j];
            if (!o.alive || (o.depth || 0) !== depth) continue;
            if (o.ownerId === site.colonyId) continue;
            if (K.dist(o.x, o.y, site.x, site.y) > r) continue;
            const hostile = o.ownerId === 'wild'
              ? true
              : (CM.colony && CM.colony.areHostile
                ? CM.colony.areHostile(game, o.ownerId, site.colonyId)
                : true);
            if (hostile) {
              stamp(game, depth, site.x, site.y, 'war', 0.9, 2);
              break;
            }
          }
        }
      }
    }
  }

  /* Stripped forage is a surface hunger stain. Stride ~64 cells so the
   * scan stays cheap on a 256² food map. */
  function stampStrippedForage(game) {
    const world = game.world;
    if (!world || !world.food || !world.foodCap) return;
    const food = world.food;
    const cap = world.foodCap;
    const n = food.length;
    const stride = Math.max(1, (n / 64) | 0);
    const size = world.size || 256;
    for (let i = 0; i < n; i += stride) {
      const c = cap[i];
      if (c > 0 && food[i] / c < 0.2) {
        stamp(game, 0, i % size, (i / size) | 0, 'hunger', 0.25, 1);
      }
    }
  }

  function tick(game, dt) {
    if (!game) return;
    /* Overlay hide does not pause weather — AI still reads the field. */
    dt = dt || 0;
    const depths = maintainedDepths(game);
    for (let i = 0; i < depths.length; i++) {
      const depth = depths[i];
      decayGrid(gridFor(game, depth), dt);
      stampLiving(game, depth);
    }
    if (depths.indexOf(0) >= 0) stampStrippedForage(game);
    if (game.aura) game.aura.gen++;
  }

  function aiMul(game, org, stateKey) {
    if (!org) return 1;
    const a = at(game, org.x, org.y, org.depth || 0);
    if (stateKey === 'SEEK_FOOD') return 1 + Math.min(0.55, a.hunger * 0.18);
    if (stateKey === 'FLEE') return 1 + Math.min(0.7, a.dread * 0.22);
    if (stateKey === 'REPRODUCE') return 1 + Math.min(0.4, a.brood * 0.15);
    return 1;
  }

  function draw(game, ctx, w, h, zoom, dpr, depth, worldToScreen) {
    if (!game || !game.showAura || !ctx || !worldToScreen) return;
    if (!game.aura || !game.aura.grids) return;
    const g = game.aura.grids[depth];
    if (!g) return;
    const n = sizeOf(game);
    const cellPx = CELL * zoom;
    const half = cellPx * 0.5;
    ctx.save();
    for (let cy = 0; cy < n; cy++) {
      for (let cx = 0; cx < n; cx++) {
        const base = (cy * n + cx) * NCHAN;
        let best = 0, bi = -1;
        for (let c = 0; c < NCHAN; c++) {
          const v = g[base + c];
          if (v > best) { best = v; bi = c; }
        }
        if (best <= DRAW_MIN || bi < 0) continue;
        const rgb = CHANNEL_COLOR[CHANNELS[bi]];
        const alpha = Math.min(0.38, best * 0.12);
        const p = worldToScreen((cx + 0.5) * CELL, (cy + 0.5) * CELL);
        if (w && h && (p.x + half < 0 || p.y + half < 0 || p.x - half > w || p.y - half > h)) continue;
        ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
        ctx.fillRect(p.x - half, p.y - half, cellPx, cellPx);
      }
    }
    ctx.restore();
  }

  CM.aura = {
    CHANNELS, CELL, SIZE, CHANNEL_INDEX, CHANNEL_COLOR,
    ensure, gridFor, clearViewed, stamp, at, sample, tick, aiMul, draw
  };
})(window.CM = window.CM || {});
