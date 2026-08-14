/* Coremind — the underground. A colony's second body.
 *
 * Every chamber here answers a pressure the surface game already applies:
 * thirst inland, temperature extremes, predation, the Core's storage
 * ceiling, slow research. Nothing is a generic "+10% building" — if a
 * chamber did not solve a problem the player has actually felt, it would
 * just be a button.
 *
 * The network is modular and grows outward: a Shaft can be sunk anywhere,
 * and everything else must be placed within reach of something already
 * built. That is what makes an underground a *shape* the player designs
 * rather than a list of upgrades they buy.
 */
(function (CM) {
  'use strict';
  const K = CM.core;
  const W = CM.world;

  /* How far a new chamber may sit from the nearest existing one of the same
   * colony. Also the length of the tunnel drawn between them. */
  const LINK_RANGE = 14;
  const MIN_SPACING = 4.5;        // chambers cannot be stacked on each other
  const SHAFT_SPACING = 26;       // ...and independent shafts must be genuinely apart

  const TYPES = {
    SHAFT: {
      key: 'SHAFT', name: 'Access Shaft', icon: '\u{1F573}',
      blurb: 'Sinks a new entrance. The only chamber that can be dug away from an existing network.',
      cost: { biomass: 24, energy: 14 }, work: 26, radius: 5,
      minDigging: 0, standalone: true
    },
    WARREN: {
      key: 'WARREN', name: 'Warren', icon: '\u{1F3E0}',
      blurb: 'Shelter. Organisms inside are hidden from predators and shielded from temperature extremes.',
      cost: { biomass: 30, energy: 18 }, work: 34, radius: 7,
      minDigging: 10, standalone: false
    },
    CISTERN: {
      key: 'CISTERN', name: 'Cistern', icon: '\u{1F4A7}',
      blurb: 'Taps groundwater. Organisms can drink here, which makes dry inland ground survivable.',
      cost: { biomass: 28, energy: 22 }, work: 40, radius: 6,
      minDigging: 14, standalone: false
    },
    GRANARY: {
      key: 'GRANARY', name: 'Granary', icon: '\u{1F33E}',
      blurb: 'Cold storage. Raises how much biomass the Core can hold.',
      cost: { biomass: 34, energy: 16 }, work: 38, radius: 6,
      storageBonus: 180,
      minDigging: 10, standalone: false
    },
    NURSERY: {
      key: 'NURSERY', name: 'Nursery', icon: '\u{1F423}',
      blurb: 'Protected breeding. Organisms nearby recover and come off reproduction cooldown faster.',
      cost: { biomass: 36, energy: 20 }, work: 42, radius: 7,
      minDigging: 16, standalone: false
    },
    VAULT: {
      key: 'VAULT', name: 'Analysis Vault', icon: '\u{1F52C}',
      blurb: 'A buried laboratory. Speeds up how fast observations turn into discoveries.',
      cost: { biomass: 40, energy: 30 }, work: 48, radius: 9,
      researchBonus: 1.6,
      minDigging: 20, standalone: false
    },
    REDOUBT: {
      key: 'REDOUBT', name: 'Redoubt', icon: '\u{1F6E1}',
      blurb: 'A fortified bolt-hole. Organisms near it fight harder and the ground itself resists sieges.',
      cost: { biomass: 44, energy: 26 }, work: 52, radius: 8,
      defenseBonus: 0.45,
      minDigging: 24, standalone: false
    }
  };
  const TYPE_KEYS = Object.keys(TYPES);

  function newState() {
    return { list: [], nextId: 1 };
  }

  function all(game) { return game.structures ? game.structures.list : []; }
  function ofColony(game, colonyId) { return all(game).filter(s => s.colonyId === colonyId); }
  function completed(game, colonyId) { return all(game).filter(s => s.colonyId === colonyId && s.done); }

  /* Can this colony put `typeKey` at (x,y)? Returns {ok, reason, linkTo}.
   * The reason strings are shown directly in the build UI — a refusal the
   * player cannot interpret is worse than no refusal at all. */
  function canPlace(game, colony, typeKey, x, y) {
    const type = TYPES[typeKey];
    if (!type) return { ok: false, reason: 'Unknown chamber.' };
    if (!colony || !colony.alive) return { ok: false, reason: 'No Coremind to build it.' };

    if (x < 2 || y < 2 || x > game.world.size - 2 || y > game.world.size - 2) {
      return { ok: false, reason: 'Outside the world.' };
    }
    if (W.isWaterAt(game.world, x, y)) return { ok: false, reason: 'Cannot dig under open water.' };
    const biome = W.biomeAt(game.world, x, y);
    if (biome === W.BIOME.MOUNTAIN) return { ok: false, reason: 'The rock here is too hard to cut.' };

    const mine = ofColony(game, colony.id);
    for (const s of mine) {
      if (K.dist(s.x, s.y, x, y) < MIN_SPACING) return { ok: false, reason: 'Too close to an existing chamber.' };
    }

    if (type.standalone) {
      // A shaft may go anywhere, but not right beside another shaft — that is
      // what stops the network being a blob and makes expansion directional.
      for (const s of mine) {
        if (s.type === 'SHAFT' && K.dist(s.x, s.y, x, y) < SHAFT_SPACING) {
          return { ok: false, reason: 'Another shaft already serves this area.' };
        }
      }
      return { ok: true, linkTo: null };
    }

    // Everything else must connect to a *finished* chamber: a colony cannot
    // build a warren off a warren that is itself still a hole in the ground.
    let linkTo = null, bestD = LINK_RANGE;
    for (const s of mine) {
      if (!s.done) continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d <= bestD) { bestD = d; linkTo = s; }
    }
    if (!linkTo) return { ok: false, reason: 'Must connect to a finished chamber — sink a shaft first.' };
    return { ok: true, linkTo };
  }

  function cost(typeKey) {
    const t = TYPES[typeKey];
    return t ? { biomass: t.cost.biomass, energy: t.cost.energy } : { biomass: 0, energy: 0 };
  }

  /* Queues a build site. Resources are spent up front, so a half-dug chamber
   * represents a real commitment the player can lose. */
  function queue(game, bus, colony, typeKey, x, y) {
    const check = canPlace(game, colony, typeKey, x, y);
    if (!check.ok) return { ok: false, reason: check.reason };
    const c = cost(typeKey);
    if (colony.biomass < c.biomass || colony.energy < c.energy) {
      return { ok: false, reason: 'Not enough biomass or energy.' };
    }
    colony.biomass -= c.biomass;
    colony.energy -= c.energy;

    const site = {
      id: 'st_' + (game.structures.nextId++),
      colonyId: colony.id,
      type: typeKey,
      x, y,
      work: 0,
      workNeeded: TYPES[typeKey].work,
      done: false,
      linkId: check.linkTo ? check.linkTo.id : null
    };
    game.structures.list.push(site);
    if (colony.isPlayer && bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'system', icon: TYPES[typeKey].icon,
        message: `${TYPES[typeKey].name} marked for excavation.`,
        x, y, structureId: site.id
      });
    }
    return { ok: true, site };
  }

  /* Digging progress. Rate scales with the organism's digging stat, so the
   * trait is what makes a colony able to build at all — a colony with no
   * burrowers can queue chambers but will crawl through them. */
  function addWork(game, bus, site, org, dt) {
    if (site.done) return false;
    const rate = 0.5 + (org.stats.digging || 0) * 0.055;
    site.work += rate * dt;
    if (site.work < site.workNeeded) return false;
    site.done = true;
    site.work = site.workNeeded;
    const colony = game.coloniesById[site.colonyId];
    if (colony && colony.isPlayer && bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'discovery', icon: TYPES[site.type].icon,
        message: `${TYPES[site.type].name} complete. ${TYPES[site.type].blurb}`,
        x: site.x, y: site.y, structureId: site.id
      });
    }
    return true;
  }

  function nearestSite(game, colonyId, x, y, maxDist) {
    let best = null, bestD = maxDist || Infinity;
    for (const s of all(game)) {
      if (s.done || s.colonyId !== colonyId) continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /* --- effects -------------------------------------------------------------
   * Queried by the simulation. Each is a plain lookup over finished chambers
   * of the right type in range, so a chamber's benefit is always tied to
   * *where* the player chose to put it. */
  function nearestOfType(game, colonyId, typeKey, x, y) {
    let best = null, bestD = Infinity;
    for (const s of all(game)) {
      if (!s.done || s.type !== typeKey || s.colonyId !== colonyId) continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d < bestD && d <= TYPES[typeKey].radius) { bestD = d; best = s; }
    }
    return best;
  }

  /* Two different questions, deliberately kept apart:
   *   shelterAt  — am I *inside* a chamber right now? (effect radius)
   *   findShelter — is there one I could walk to? (search radius)
   * Conflating them meant an organism only recognised a warren once it was
   * already standing in it, so the SHELTER order could never move anyone. */
  function shelterAt(game, org) {
    return nearestOfType(game, org.ownerId, 'WARREN', org.x, org.y)
        || nearestOfType(game, org.ownerId, 'REDOUBT', org.x, org.y);
  }

  function findShelter(game, colonyId, x, y, searchRadius) {
    let best = null, bestD = searchRadius;
    for (const s of all(game)) {
      if (!s.done || s.colonyId !== colonyId) continue;
      if (s.type !== 'WARREN' && s.type !== 'REDOUBT') continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  function cisternAt(game, org) { return nearestOfType(game, org.ownerId, 'CISTERN', org.x, org.y); }
  function nurseryAt(game, org) { return nearestOfType(game, org.ownerId, 'NURSERY', org.x, org.y); }
  function redoubtAt(game, org) { return nearestOfType(game, org.ownerId, 'REDOUBT', org.x, org.y); }

  function findNearestCistern(game, colonyId, x, y, radius) {
    let best = null, bestD = radius;
    for (const s of all(game)) {
      if (!s.done || s.type !== 'CISTERN' || s.colonyId !== colonyId) continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  function storageBonus(game, colonyId) {
    let bonus = 0;
    for (const s of all(game)) {
      if (s.done && s.colonyId === colonyId && TYPES[s.type].storageBonus) bonus += TYPES[s.type].storageBonus;
    }
    return bonus;
  }

  /* Research multiplier from vaults covering the observing organism. */
  function researchMultiplier(game, org) {
    const vault = nearestOfType(game, org.ownerId, 'VAULT', org.x, org.y);
    return vault ? TYPES.VAULT.researchBonus : 1;
  }

  /* Where a colony should dig next if it is expanding on its own. Picks a
   * point at the edge of the current network, biased toward ground the
   * colony actually wants: water for cisterns, open land otherwise. */
  function suggestExpansion(game, colony) {
    const mine = completed(game, colony.id);
    if (!mine.length) {
      // No network yet: the first thing is always a shaft near the Core.
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 8;
        const x = colony.x + Math.cos(a) * r, y = colony.y + Math.sin(a) * r;
        if (canPlace(game, colony, 'SHAFT', x, y).ok) return { typeKey: 'SHAFT', x, y };
      }
      return null;
    }
    const anchor = mine[Math.floor(Math.random() * mine.length)];
    const wanted = pickWantedType(game, colony);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, r = MIN_SPACING + Math.random() * (LINK_RANGE - MIN_SPACING);
      const x = anchor.x + Math.cos(a) * r, y = anchor.y + Math.sin(a) * r;
      if (canPlace(game, colony, wanted, x, y).ok) return { typeKey: wanted, x, y };
    }
    return null;
  }

  /* What this colony is short of. Deliberately reads live state rather than
   * a fixed build order, so an inland colony digs cisterns and a besieged
   * one digs redoubts. */
  function pickWantedType(game, colony) {
    const have = {};
    for (const s of completed(game, colony.id)) have[s.type] = (have[s.type] || 0) + 1;

    const dry = !W.findNearestWater(game.world, colony.x, colony.y, 30);
    if (dry && !have.CISTERN) return 'CISTERN';
    if (!have.WARREN) return 'WARREN';
    if (colony.biomass >= colony.biomassCap * 0.95 && !have.GRANARY) return 'GRANARY';
    if (colony.losses > 6 && !have.REDOUBT) return 'REDOUBT';
    if (!have.NURSERY) return 'NURSERY';
    if (!have.VAULT) return 'VAULT';
    const pool = ['WARREN', 'CISTERN', 'GRANARY', 'NURSERY', 'REDOUBT'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function removeStructuresOf(game, colonyId) {
    game.structures.list = all(game).filter(s => s.colonyId !== colonyId);
  }

  function serialize(game) {
    return { nextId: game.structures.nextId, list: all(game).map(s => Object.assign({}, s)) };
  }
  function hydrate(game, data) {
    game.structures = newState();
    if (!data) return;
    game.structures.nextId = data.nextId || 1;
    game.structures.list = (data.list || []).map(s => Object.assign({}, s));
  }

  CM.structures = {
    TYPES, TYPE_KEYS, LINK_RANGE, MIN_SPACING,
    newState, all, ofColony, completed, canPlace, cost, queue, addWork, nearestSite,
    shelterAt, findShelter, cisternAt, nurseryAt, redoubtAt, findNearestCistern,
    storageBonus, researchMultiplier, suggestExpansion, pickWantedType,
    removeStructuresOf, serialize, hydrate
  };
})(window.CM = window.CM || {});
