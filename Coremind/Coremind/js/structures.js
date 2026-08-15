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

  /* --- depth ---------------------------------------------------------------
   * Ten strata. A chamber may only link to one within a single depth level
   * of itself, so the stack is a campaign: you cannot jump to the Veil.
   * Layer 10 is shared ground (see js/layers.js). Layer 9's Gate is the lock
   * on the entire burrow. */
  const DEPTHS = [
    null,
    { level: 1,  key: 'SHALLOW',  name: 'Shallow Works',   rock: [116, 94, 70],  tempShift: 2,  tint: '#c69a63' },
    { level: 2,  key: 'GALLERY',  name: 'Deep Galleries',  rock: [88, 78, 92],   tempShift: 8,  tint: '#a294c4' },
    { level: 3,  key: 'ABYSSAL',  name: 'Abyssal Reach',   rock: [72, 54, 78],   tempShift: 16, tint: '#d07aa4' },
    { level: 4,  key: 'SPORE',    name: 'Spore March',     rock: [70, 88, 64],   tempShift: 18, tint: '#7dce7a' },
    { level: 5,  key: 'RESONANT', name: 'Resonant Clefts', rock: [64, 82, 102],  tempShift: 20, tint: '#6ec0d4' },
    { level: 6,  key: 'BASTION',  name: 'Bastion Deeps',   rock: [86, 70, 70],   tempShift: 22, tint: '#d4896a' },
    { level: 7,  key: 'MANTLE',   name: 'Mantle Hearth',   rock: [110, 62, 48],  tempShift: 26, tint: '#e07a4a' },
    { level: 8,  key: 'HOLLOW',   name: 'Hollow Abyss',    rock: [62, 48, 78],   tempShift: 28, tint: '#b07ad0' },
    { level: 9,  key: 'GATE',     name: 'Gateworks',       rock: [52, 44, 70],   tempShift: 30, tint: '#9a7cff' },
    { level: 10, key: 'NEXUS',    name: 'The Veil',        rock: [42, 32, 68],   tempShift: 32, tint: '#c88cff' }
  ];
  const MAX_DEPTH = 10;

  const TYPES = {
    // -- depth 1: shallow works ------------------------------------------
    SHAFT: {
      key: 'SHAFT', name: 'Access Shaft', icon: '\u{1F573}', depth: 1,
      blurb: 'Sinks a new entrance. The only chamber that can be dug away from an existing network.',
      cost: { biomass: 24, energy: 14 }, work: 26, radius: 5,
      minDigging: 0, standalone: true, spine: true
    },
    WARREN: {
      key: 'WARREN', name: 'Warren', icon: '\u{1F3E0}', depth: 1,
      blurb: 'Shelter. Organisms inside are hidden from predators and shielded from temperature extremes.',
      cost: { biomass: 30, energy: 18 }, work: 34, radius: 7,
      minDigging: 10, standalone: false
    },
    CISTERN: {
      key: 'CISTERN', name: 'Cistern', icon: '\u{1F4A7}', depth: 1,
      blurb: 'Taps groundwater. Organisms can drink here, which makes dry inland ground survivable.',
      cost: { biomass: 28, energy: 22 }, work: 40, radius: 6,
      minDigging: 14, standalone: false
    },
    GRANARY: {
      key: 'GRANARY', name: 'Granary', icon: '\u{1F33E}', depth: 1,
      blurb: 'Cold storage. Raises how much biomass the Core can hold.',
      cost: { biomass: 34, energy: 16 }, work: 38, radius: 6,
      storageBonus: 180,
      minDigging: 10, standalone: false
    },

    // -- depth 2: deep galleries -------------------------------------------
    DESCENT: {
      key: 'DESCENT', name: 'Descent', icon: '\u{2B07}', depth: 2,
      blurb: 'Cuts down into the deep galleries. Everything at this depth hangs off one.',
      cost: { biomass: 46, energy: 34 }, work: 62, radius: 6,
      minDigging: 22, standalone: false, spine: true
    },
    NURSERY: {
      key: 'NURSERY', name: 'Nursery', icon: '\u{1F423}', depth: 2,
      blurb: 'Protected breeding. Organisms nearby recover and come off reproduction cooldown faster.',
      cost: { biomass: 36, energy: 20 }, work: 42, radius: 7,
      minDigging: 16, standalone: false
    },
    VAULT: {
      key: 'VAULT', name: 'Analysis Vault', icon: '\u{1F52C}', depth: 2,
      blurb: 'A buried laboratory. Speeds up how fast observations turn into discoveries.',
      cost: { biomass: 40, energy: 30 }, work: 48, radius: 9,
      researchBonus: 1.6,
      minDigging: 20, standalone: false
    },
    REDOUBT: {
      key: 'REDOUBT', name: 'Redoubt', icon: '\u{1F6E1}', depth: 2,
      blurb: 'A fortified bolt-hole. Organisms near it fight harder and the ground itself resists sieges.',
      cost: { biomass: 44, energy: 26 }, work: 52, radius: 8,
      defenseBonus: 0.45,
      minDigging: 24, standalone: false
    },
    FUNGARIUM: {
      key: 'FUNGARIUM', name: 'Fungarium', icon: '\u{1F344}', depth: 2,
      blurb: 'Cultivated fungus. Feeds organisms underground, so a colony can live without the surface.',
      cost: { biomass: 42, energy: 24 }, work: 50, radius: 7,
      feedsRate: 9,
      minDigging: 20, standalone: false
    },

    // -- depth 3: the abyssal reach — endgame ------------------------------
    GEOTHERMAL: {
      key: 'GEOTHERMAL', name: 'Geothermal Tap', icon: '\u{1F30B}', depth: 3,
      blurb: 'Draws heat from the deep rock. A large, permanent energy income.',
      cost: { biomass: 60, energy: 46 }, work: 84, radius: 8,
      energyRate: 3.2,
      minDigging: 30, standalone: false
    },
    VEINWORKS: {
      key: 'VEINWORKS', name: 'Veinworks', icon: '\u{26CF}', depth: 3,
      blurb: 'Mines an abyssal biomass vein. Must be cut directly onto one.',
      cost: { biomass: 66, energy: 40 }, work: 96, radius: 7,
      requiresVein: true,
      minDigging: 34, standalone: false
    },
    SANCTUM: {
      key: 'SANCTUM', name: 'Deep Sanctum', icon: '\u{1F52E}', depth: 3,
      blurb: 'A second seat for the Coremind, buried beyond reach. Completing one secures the colony permanently.',
      cost: { biomass: 140, energy: 120 }, work: 190, radius: 10,
      endgame: true,
      minDigging: 40, standalone: false
    },

    // -- depth 3 spine -----------------------------------------------------
    WELL: {
      key: 'WELL', name: 'Well', icon: '\u{2B07}', depth: 3,
      blurb: 'Cuts from the galleries into the abyssal reach. Everything at this depth hangs off one.',
      cost: { biomass: 52, energy: 38 }, work: 70, radius: 6,
      minDigging: 26, standalone: false, spine: true
    },

    // -- depth 4: spore march ----------------------------------------------
    GALLERY: {
      key: 'GALLERY', name: 'Spore Stair', icon: '\u{2B07}', depth: 4,
      blurb: 'Cuts into the spore march. The first layer that can feed the stack on its own.',
      cost: { biomass: 56, energy: 40 }, work: 74, radius: 6,
      minDigging: 28, standalone: false, spine: true
    },
    SPOREWELL: {
      key: 'SPOREWELL', name: 'Sporewell', icon: '\u{1F344}', depth: 4,
      blurb: 'A cultivated bloom. Feeds whoever stands in it and, if you dominate this layer, slowly stocks the Core.',
      cost: { biomass: 50, energy: 30 }, work: 58, radius: 7,
      feedsRate: 11,
      minDigging: 24, standalone: false
    },
    AQUEDUCT: {
      key: 'AQUEDUCT', name: 'Aqueduct', icon: '\u{1F4A7}', depth: 4,
      blurb: 'Carries groundwater this far down. Organisms can drink here.',
      cost: { biomass: 44, energy: 32 }, work: 52, radius: 6,
      minDigging: 22, standalone: false
    },

    // -- depth 5: resonant clefts ------------------------------------------
    CLEFT: {
      key: 'CLEFT', name: 'Cleft', icon: '\u{2B07}', depth: 5,
      blurb: 'Cuts into the resonant clefts — the colony\'s early-warning net.',
      cost: { biomass: 60, energy: 44 }, work: 80, radius: 6,
      minDigging: 30, standalone: false, spine: true
    },
    RESONATOR: {
      key: 'RESONATOR', name: 'Resonator', icon: '\u{1F50A}', depth: 5,
      blurb: 'A listening chamber. Dominating this layer stretches threat sense for the whole colony.',
      cost: { biomass: 48, energy: 36 }, work: 56, radius: 8,
      minDigging: 26, standalone: false
    },
    RELIQUARY: {
      key: 'RELIQUARY', name: 'Reliquary', icon: '\u{1F52C}', depth: 5,
      blurb: 'A deeper vault. Speeds observations into discoveries.',
      cost: { biomass: 52, energy: 40 }, work: 60, radius: 9,
      researchBonus: 1.8,
      minDigging: 28, standalone: false
    },

    // -- depth 6: bastion deeps --------------------------------------------
    CHASM: {
      key: 'CHASM', name: 'Chasm', icon: '\u{2B07}', depth: 6,
      blurb: 'Cuts into the bastion deeps. Hold this or 7–9 are a corridor, not a home.',
      cost: { biomass: 66, energy: 48 }, work: 86, radius: 6,
      minDigging: 32, standalone: false, spine: true
    },
    BASTION: {
      key: 'BASTION', name: 'Bastion', icon: '\u{1F3F0}', depth: 6,
      blurb: 'A fortress chamber. Hardens this layer and the one above it.',
      cost: { biomass: 70, energy: 44 }, work: 78, radius: 9,
      defenseBonus: 0.7,
      minDigging: 30, standalone: false
    },

    // -- depth 7: mantle hearth --------------------------------------------
    MANTLE: {
      key: 'MANTLE', name: 'Mantle Cut', icon: '\u{2B07}', depth: 7,
      blurb: 'Cuts into the mantle. Late-game income lives here.',
      cost: { biomass: 74, energy: 54 }, work: 94, radius: 6,
      minDigging: 34, standalone: false, spine: true
    },
    HEARTH: {
      key: 'HEARTH', name: 'Mantle Hearth', icon: '\u{1F30B}', depth: 7,
      blurb: 'A deeper geothermal draw. Large permanent energy income.',
      cost: { biomass: 72, energy: 52 }, work: 90, radius: 8,
      energyRate: 4.4,
      minDigging: 34, standalone: false
    },
    SEAM: {
      key: 'SEAM', name: 'Deep Seam', icon: '\u{26CF}', depth: 7,
      blurb: 'Mines a buried biomass seam. Must be cut directly onto one.',
      cost: { biomass: 76, energy: 48 }, work: 100, radius: 7,
      requiresVein: true,
      minDigging: 36, standalone: false
    },

    // -- depth 8: hollow abyss ---------------------------------------------
    ABYSS: {
      key: 'ABYSS', name: 'Abyss Stair', icon: '\u{2B07}', depth: 8,
      blurb: 'Cuts into the hollow abyss — the last private redoubt before the Gate.',
      cost: { biomass: 82, energy: 60 }, work: 104, radius: 6,
      minDigging: 36, standalone: false, spine: true
    },
    CITADEL: {
      key: 'CITADEL', name: 'Citadel', icon: '\u{1F6E1}', depth: 8,
      blurb: 'The last fortress before the Gate. Defenders here count for more.',
      cost: { biomass: 88, energy: 56 }, work: 96, radius: 10,
      defenseBonus: 0.85,
      minDigging: 36, standalone: false
    },
    CRYPT: {
      key: 'CRYPT', name: 'Hollow Crypt', icon: '\u{1F52E}', depth: 8,
      blurb: 'A second seat, deeper than the first. Completing one secures the colony.',
      cost: { biomass: 160, energy: 130 }, work: 200, radius: 10,
      endgame: true,
      minDigging: 42, standalone: false
    },

    // -- depth 9: gateworks ------------------------------------------------
    GATE: {
      key: 'GATE', name: 'Gate', icon: '\u{1F6AA}', depth: 9,
      blurb: 'Opens onto the Veil. Lose this chamber and you lose the entire burrow.',
      cost: { biomass: 110, energy: 90 }, work: 140, radius: 8,
      minDigging: 40, standalone: false, spine: true
    },
    MUSTER: {
      key: 'MUSTER', name: 'Mustering Hall', icon: '\u{1F396}', depth: 9,
      blurb: 'Stages a raid. Organisms here recover quickly before stepping onto the Veil.',
      cost: { biomass: 70, energy: 48 }, work: 72, radius: 8,
      minDigging: 34, standalone: false
    },
    KEEP: {
      key: 'KEEP', name: 'Gate Keep', icon: '\u{1F3F0}', depth: 9,
      blurb: 'A redoubt built around the Gate. Hold this or the lock on the burrow is a hallway.',
      cost: { biomass: 84, energy: 54 }, work: 88, radius: 9,
      defenseBonus: 0.75,
      minDigging: 36, standalone: false
    },

    // -- depth 10: the Veil (opened by completing a Gate, never sited) -----
    NEXUS: {
      key: 'NEXUS', name: 'Veil Gate', icon: '\u{1F52E}', depth: 10,
      blurb: 'A door on the Veil. Walk to another colony\'s door to enter their burrow.',
      cost: { biomass: 0, energy: 0 }, work: 1, radius: 9,
      minDigging: 0, standalone: true, hidden: true
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
    if (type.hidden) return { ok: false, reason: 'That chamber cannot be sited by hand.' };
    if (!colony || !colony.alive) return { ok: false, reason: 'No Coremind to build it.' };
    if (colony.burrowLost && !type.standalone) {
      return { ok: false, reason: 'The burrow is lost. Sink a new shaft, or reclaim the Gate.' };
    }
    if (CM.layers) {
      if (type.standalone && type.key === 'SHAFT') {
        const foothold = CM.layers.surfaceReady(game, colony);
        if (!foothold.ok) return foothold;
      } else if (type.spine && type.depth > 1 && type.depth <= 9) {
        const ready = CM.layers.layerReady(game, colony, type.depth - 1);
        if (!ready.ok) return ready;
      }
    }

    if (x < 2 || y < 2 || x > game.world.size - 2 || y > game.world.size - 2) {
      return { ok: false, reason: 'Outside the world.' };
    }
    if (W.isWaterAt(game.world, x, y)) return { ok: false, reason: 'Cannot dig under open water.' };
    const biome = W.biomeAt(game.world, x, y);
    if (biome === W.BIOME.MOUNTAIN) return { ok: false, reason: 'The rock here is too hard to cut.' };

    const depth = type.depth;
    const mine = ofColony(game, colony.id);
    // Spacing is per-depth: two chambers on different strata are not in each
    // other's way, which is what lets a network stack rather than sprawl.
    for (const s of mine) {
      if (s.depth === depth && K.dist(s.x, s.y, x, y) < MIN_SPACING) {
        return { ok: false, reason: 'Too close to an existing chamber on this level.' };
      }
    }

    // A vein chamber has to sit on an actual vein — the deep resource is a
    // place on the map, not a purchase.
    if (type.requiresVein) {
      const vein = nearestVein(game, x, y, VEIN_REACH);
      if (!vein) return { ok: false, reason: 'No abyssal vein here — find one first.' };
      if (vein.claimedBy && vein.claimedBy !== colony.id) return { ok: false, reason: 'That vein is already being worked.' };
    }

    if (colony.layerPermit && colony.layerPermit[depth] && colony.layerPermit[depth][typeKey] === false) {
      return { ok: false, reason: 'This layer forbids that chamber.' };
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

    /* Everything else must connect to a *finished* chamber within one depth
     * level of itself. That single rule is what makes depth a campaign: to
     * put anything in the abyssal reach you must already hold deep galleries
     * above it, and to hold those you need shallow works above them. */
    let linkTo = null, bestD = LINK_RANGE;
    let sawNearer = false;
    const pinned = game.buildFromId && mine.find(s => s.id === game.buildFromId && s.done);
    if (pinned && Math.abs(pinned.depth - depth) <= 1) {
      const pd = K.dist(pinned.x, pinned.y, x, y);
      if (pd <= LINK_RANGE) {
        return { ok: true, linkTo: pinned };
      }
    }
    for (const s of mine) {
      if (!s.done) continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d > LINK_RANGE) continue;
      sawNearer = true;
      if (Math.abs(s.depth - depth) > 1) continue;
      if (d <= bestD) { bestD = d; linkTo = s; }
    }
    if (!linkTo) {
      if (sawNearer) {
        const above = DEPTHS[depth - 1];
        return { ok: false, reason: `Nothing at a workable depth here — cut ${above ? above.name.toLowerCase() : 'shallower works'} first.` };
      }
      return { ok: false, reason: 'Must connect to a finished chamber — sink a shaft first.' };
    }
    return { ok: true, linkTo };
  }

  /* --- abyssal veins --------------------------------------------------------
   * Buried biomass seams, placed at world generation and only findable by
   * digging. They are the reason to go deep at all, and being fixed points on
   * the map means the deep tier is contested ground rather than a menu. */
  const VEIN_REACH = 3.2;
  function nearestVein(game, x, y, radius) {
    let best = null, bestD = radius;
    for (const v of (game.world.veins || [])) {
      const d = K.dist(v.x, v.y, x, y);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }
  /* Veins are only revealed once a colony has dug deep nearby — until then
   * the player is prospecting, not shopping from a list. */
  function revealVeinsNear(game, x, y, radius) {
    let found = null;
    for (const v of (game.world.veins || [])) {
      if (v.known) continue;
      if (K.dist(v.x, v.y, x, y) <= radius) { v.known = true; found = v; }
    }
    return found;
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
      depth: TYPES[typeKey].depth,
      work: 0,
      workNeeded: TYPES[typeKey].work,
      done: false,
      integrity: 100,
      controlled: true,
      fortified: false,
      fortHp: 0,
      linkId: check.linkTo ? check.linkTo.id : null,
      tier: 0,
      upgradingTo: 0,
      upgradeWork: 0,
      crewIds: [],
      priority: 0,
      entrenched: false
    };
    if (TYPES[typeKey].requiresVein) {
      const vein = nearestVein(game, x, y, VEIN_REACH);
      if (vein) { vein.claimedBy = colony.id; site.veinId = vein.id; }
    }
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
  const MAX_TIER = 3;
  function tierMul(site) { return 1 + 0.28 * ((site && site.tier) || 0); }
  function radiusOf(site) {
    const t = TYPES[site.type];
    return t ? t.radius * tierMul(site) : 6;
  }

  const UPGRADE_TITLES = {
    SHAFT: ['Reinforced collar', 'Climb ladders', 'Gatehouse'],
    WARREN: ['Lined cells', 'Deep den', 'Hive hall'],
    CISTERN: ['Settling basin', 'Pressure well', 'Aquifer heart'],
    GRANARY: ['Cold pit', 'Sealed silo', 'Deep stores'],
    DESCENT: ['Cut braces', 'Switchback', 'Grand stair'],
    NURSERY: ['Brood alcove', 'Warm hall', 'Queen chamber'],
    VAULT: ['Lens bench', 'Catalog', 'Oracle loft'],
    REDOUBT: ['Slit walls', 'Murder holes', 'Iron keep'],
    FUNGARIUM: ['Spawn beds', 'Spore loft', 'Mother bloom'],
    GEOTHERMAL: ['Steam flue', 'Heat well', 'Mantle throat'],
    VEINWORKS: ['Pick face', 'Ore hall', 'Deep cut'],
    SANCTUM: ['Inner seat', 'Relic vault', 'Second mind'],
    WELL: ['Ring stair', 'Drop shaft', 'Abyss well'],
    GALLERY: ['Spore stair', 'Bloom ramp', 'March hall'],
    SPOREWELL: ['Cultured ring', 'Bloom cistern', 'Mother well'],
    AQUEDUCT: ['Lined run', 'Pressure run', 'Deep river'],
    CLEFT: ['Listen cut', 'Echo stair', 'Resonant well'],
    RESONATOR: ['Drum skin', 'Long ear', 'Warning choir'],
    RELIQUARY: ['Deep bench', 'Bone library', 'Thought vault'],
    CHASM: ['Brace cut', 'Drop hall', 'Bastion stair'],
    BASTION: ['Outer works', 'Kill yard', 'Crown wall'],
    MANTLE: ['Heat stair', 'Cinder ramp', 'Hearth cut'],
    HEARTH: ['Coal bed', 'Forge well', 'Mantle heart'],
    SEAM: ['Deep face', 'Rich cut', 'Mother seam'],
    ABYSS: ['Hollow stair', 'Last ramp', 'Night well'],
    CITADEL: ['Outer court', 'Inner wall', 'Crown keep'],
    CRYPT: ['Lower seat', 'Bone throne', 'Third mind'],
    GATE: ['Door braces', 'Kill gallery', 'Veil lock'],
    MUSTER: ['Staging floor', 'Raid hall', 'War court'],
    KEEP: ['Gate yard', 'Inner keep', 'Last wall']
  };
  const UPGRADE_COST_F = [0, 0.65, 1.05, 1.55];
  const UPGRADE_WORK_F = [0, 0.55, 0.85, 1.20];

  function upgradeName(typeKey, tier) {
    const list = UPGRADE_TITLES[typeKey];
    if (list && list[tier - 1]) return list[tier - 1];
    return ['Shoring', 'Expansion', 'Masterwork'][tier - 1] || ('Tier ' + tier);
  }
  function upgradeCost(site) {
    const next = ((site && site.tier) || 0) + 1;
    const c = cost(site.type);
    const f = UPGRADE_COST_F[next] || 1.6;
    return { biomass: Math.round(c.biomass * f), energy: Math.round(c.energy * f) };
  }
  function upgradeWorkNeeded(site) {
    const next = ((site && site.tier) || 0) + 1;
    const t = TYPES[site.type];
    return Math.round((t ? t.work : 40) * (UPGRADE_WORK_F[next] || 1.2));
  }
  function canUpgrade(game, colony, site) {
    if (!site || !site.done || site.colonyId !== colony.id) return { ok: false, reason: 'Finish a chamber you own first.' };
    if (site.type === 'NEXUS') return { ok: false, reason: 'A Veil door cannot be raised.' };
    if (site.controlled === false) return { ok: false, reason: 'Reclaim the chamber first.' };
    if (site.upgradingTo) return { ok: false, reason: 'Already being raised.' };
    if ((site.tier || 0) >= MAX_TIER) return { ok: false, reason: 'This chamber is finished — masterwork.' };
    const c = upgradeCost(site);
    if (colony.biomass < c.biomass || colony.energy < c.energy) {
      return { ok: false, reason: `Needs ${c.biomass} biomass and ${c.energy} energy.` };
    }
    return { ok: true, cost: c, name: upgradeName(site.type, (site.tier || 0) + 1) };
  }
  function startUpgrade(game, bus, colony, site) {
    const check = canUpgrade(game, colony, site);
    if (!check.ok) return check;
    const c = check.cost;
    colony.biomass -= c.biomass;
    colony.energy -= c.energy;
    site.upgradingTo = (site.tier || 0) + 1;
    site.upgradeWork = 0;
    site.upgradeNeeded = upgradeWorkNeeded(site);
    if (colony.isPlayer && bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'system', icon: '\u{26A1}',
        message: `${TYPES[site.type].name}: raising ${check.name}. Diggers will finish it.`,
        x: site.x, y: site.y, structureId: site.id
      });
    }
    return { ok: true };
  }
  function finishUpgrade(game, bus, site) {
    site.tier = site.upgradingTo || ((site.tier || 0) + 1);
    site.upgradingTo = 0;
    site.upgradeWork = 0;
    site.upgradeNeeded = 0;
    site.integrity = Math.max(site.integrity || 100, 100 + site.tier * 12);
    const colony = game.coloniesById[site.colonyId];
    if (colony && colony.isPlayer && bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'discovery', icon: TYPES[site.type].icon,
        message: `${TYPES[site.type].name} raised to ${upgradeName(site.type, site.tier)}.`,
        x: site.x, y: site.y, structureId: site.id
      });
    }
    if (colony && colony.isPlayer && CM.progress) CM.progress.note(game, 'upgrade');
    return true;
  }

  function addWork(game, bus, site, org, dt) {
    const infl = CM.influence ? CM.influence.digMul(game, site) : 1;
    const rate = (0.5 + (org.stats.digging || 0) * 0.055) * infl;
    if (site.done && site.upgradingTo) {
      site.upgradeWork = (site.upgradeWork || 0) + rate * dt;
      if (site.upgradeWork < (site.upgradeNeeded || upgradeWorkNeeded(site))) return false;
      return finishUpgrade(game, bus, site);
    }
    if (site.done) return false;
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
    /* Cutting deep is how veins are found. Prospecting is a *consequence* of
     * digging rather than a separate action, so the reward for pushing the
     * network downward arrives on its own — and the deeper the chamber, the
     * further through the rock the colony can sense. */
    if (site.depth >= 2) {
      const found = revealVeinsNear(game, site.x, site.y, 8 + site.depth * 7);
      if (found && colony && colony.isPlayer && bus) {
        CM.discovery.pushEvent(game, bus, {
          kind: 'discovery', icon: '\u{1F48E}',
          message: 'Abyssal vein struck. Cut a Veinworks or Deep Seam onto it to work it.',
          x: found.x, y: found.y
        });
      }
    }
    if (CM.layers) CM.layers.onCompleted(game, bus, site);
    return true;
  }

  /* How much the buried works themselves resist being chewed open. A redoubt
   * hardens the ground around it, which is what makes it worth putting one in
   * the middle of a network rather than at its edge. */
  function defenseAt(game, colonyId, x, y, depth) {
    let bonus = 0;
    for (const s of all(game)) {
      if (!s.done || s.controlled === false || s.colonyId !== colonyId) continue;
      const type = TYPES[s.type];
      if (!type || !type.defenseBonus) continue;
      if (depth != null) {
        const sd = s.depth || 0;
        if (sd !== depth && sd !== depth - 1) continue;
      }
      if (K.dist(s.x, s.y, x, y) <= radiusOf(s) * 1.5) {
        bonus += type.defenseBonus * tierMul(s) * (s.entrenched ? 1.35 : 1);
      }
    }
    return bonus;
  }

  function nearestSite(game, colonyId, x, y, maxDist, org) {
    if (org && org.assignedSiteId) {
      const assigned = all(game).find(s => s.id === org.assignedSiteId);
      if (assigned && assigned.colonyId === colonyId && (!assigned.done || assigned.upgradingTo)) {
        return assigned;
      }
    }
    let best = null, bestScore = -Infinity;
    const cap = maxDist || Infinity;
    for (const s of all(game)) {
      if (s.colonyId !== colonyId) continue;
      if (s.done && !s.upgradingTo) continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d > cap) continue;
      const score = (s.priority || 0) * 1000 - d;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  function setPriority(game, site, on) {
    if (!site) return;
    if (on) {
      let hi = 1;
      for (const s of all(game)) if ((s.priority || 0) >= hi) hi = s.priority + 1;
      site.priority = hi;
    } else site.priority = 0;
  }

  function demolish(game, bus, colony, site) {
    if (!site || site.colonyId !== colony.id) return { ok: false, reason: 'That chamber is not yours.' };
    if (site.type === 'NEXUS') return { ok: false, reason: 'A Veil door cannot be pulled up.' };
    if (site.done && site.type === 'GATE' && !colony.burrowLost) {
      return { ok: false, reason: 'Pulling the Gate drops the burrow. Reclaim or lose it first.' };
    }
    const type = TYPES[site.type];
    const c = cost(site.type);
    if (!site.done) {
      colony.biomass = Math.min(colony.biomassCap, colony.biomass + c.biomass * 0.5);
      colony.energy = Math.min(colony.energyCap, colony.energy + c.energy * 0.5);
    }
    destroy(game, site);
    if (colony.isPlayer && bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'system', icon: '\u{1F5D1}',
        message: site.done
          ? `${type.name} pulled down.`
          : `${type.name} cancelled. Half the cost returned.`,
        x: site.x, y: site.y
      });
    }
    return { ok: true };
  }

  const ENTRENCH_COST = { biomass: 36, energy: 24 };
  function canEntrench(game, colony, site) {
    if (!site || !site.done || site.colonyId !== colony.id) return { ok: false, reason: 'Finish a chamber you own first.' };
    if (site.entrenched) return { ok: false, reason: 'Already entrenched.' };
    if (colony.biomass < ENTRENCH_COST.biomass || colony.energy < ENTRENCH_COST.energy) {
      return { ok: false, reason: `Needs ${ENTRENCH_COST.biomass} biomass and ${ENTRENCH_COST.energy} energy.` };
    }
    return { ok: true };
  }
  function entrench(game, bus, colony, site) {
    const check = canEntrench(game, colony, site);
    if (!check.ok) return check;
    colony.biomass -= ENTRENCH_COST.biomass;
    colony.energy -= ENTRENCH_COST.energy;
    site.entrenched = true;
    site.integrity = Math.max(site.integrity || 100, 140);
    if (colony.isPlayer && bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'system', icon: '\u{1F6E1}',
        message: `${TYPES[site.type].name} entrenched. Harder to chew, stronger in a fight.`,
        x: site.x, y: site.y, structureId: site.id
      });
    }
    return { ok: true };
  }

  /* --- effects -------------------------------------------------------------
   * Queried by the simulation. Each is a plain lookup over finished chambers
   * of the right type in range, so a chamber's benefit is always tied to
   * *where* the player chose to put it. */
  function nearestOfType(game, colonyId, typeKey, x, y) {
    let best = null, bestD = Infinity;
    for (const s of all(game)) {
      if (!s.done || s.controlled === false || s.type !== typeKey || s.colonyId !== colonyId) continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d < bestD && d <= radiusOf(s)) { bestD = d; best = s; }
    }
    return best;
  }

  /* Is there a chamber this organism could walk to for shelter? Kept separate
   * from the effect-radius lookups above: searching within a chamber's *effect*
   * radius meant an organism only recognised a warren once it was already
   * standing in one, so the SHELTER order could never move anybody. */
  function findShelter(game, colonyId, x, y, searchRadius) {
    let best = null, bestD = searchRadius;
    for (const s of all(game)) {
      if (!s.done || s.controlled === false || s.colonyId !== colonyId) continue;
      if (s.type !== 'WARREN' && s.type !== 'REDOUBT' && s.type !== 'BASTION' && s.type !== 'CITADEL' && s.type !== 'KEEP' && s.type !== 'MUSTER') continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  function nurseryAt(game, org) {
    return nearestOfType(game, org.ownerId, 'NURSERY', org.x, org.y)
        || nearestOfType(game, org.ownerId, 'MUSTER', org.x, org.y);
  }

  function findNearestCistern(game, colonyId, x, y, radius) {
    let best = null, bestD = radius;
    for (const s of all(game)) {
      if (!s.done || s.controlled === false || s.colonyId !== colonyId) continue;
      if (s.type !== 'CISTERN' && s.type !== 'AQUEDUCT') continue;
      const d = K.dist(s.x, s.y, x, y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /* Fungus feeds whoever stands in it. This is the chamber that severs a
   * colony from the surface: with one, organisms no longer have to walk out
   * into the weather and the predators to eat, which is the precondition for
   * living in the abyssal reach at all. */
  function fungariumFeed(game, org) {
    let best = 0;
    for (const key of TYPE_KEYS) {
      if (!TYPES[key].feedsRate) continue;
      const site = nearestOfType(game, org.ownerId, key, org.x, org.y);
      if (site) {
        const mul = (CM.influence ? CM.influence.incomeMul(game, site) : 1) * tierMul(site);
        best = Math.max(best, TYPES[key].feedsRate * mul);
      }
    }
    return best;
  }

  /* Everything a colony's finished chambers pay out per second, gathered in
   * one pass so the simulation does not walk the list once per effect. */
  function colonyIncome(game, colonyId) {
    let biomass = 0, energy = 0;
    for (const s of all(game)) {
      if (!s.done || s.colonyId !== colonyId || s.controlled === false) continue;
      const type = TYPES[s.type];
      const mul = tierMul(s) * (CM.influence ? CM.influence.incomeMul(game, s) : 1);
      if (type.energyRate) energy += type.energyRate * mul;
      if (type.requiresVein && s.veinId) {
        const vein = (game.world.veins || []).find(v => v.id === s.veinId);
        if (vein && vein.remaining > 0) {
          // A vein is finite: the abyssal economy is a windfall to be used,
          // not a permanent fountain.
          const rate = 2.4 * mul;
          biomass += rate;
          vein.remaining = Math.max(0, vein.remaining - rate);
        }
      }
    }
    return { biomass, energy };
  }

  function hasSanctum(game, colonyId) {
    return all(game).some(s => s.done && s.controlled !== false && s.colonyId === colonyId && TYPES[s.type].endgame);
  }
  function sanctumProgress(game, colonyId) {
    let best = 0;
    for (const s of all(game)) {
      if (s.colonyId !== colonyId || !TYPES[s.type].endgame) continue;
      best = Math.max(best, s.done ? 1 : s.work / s.workNeeded);
    }
    return best;
  }

  function deepestOf(game, colonyId) {
    let d = 0;
    for (const s of all(game)) {
      if (s.done && s.controlled !== false && s.colonyId === colonyId && s.type !== 'NEXUS' && s.depth > d) d = s.depth;
    }
    return d;
  }

  function storageBonus(game, colonyId) {
    let bonus = 0;
    for (const s of all(game)) {
      if (s.done && s.controlled !== false && s.colonyId === colonyId && TYPES[s.type].storageBonus) {
        bonus += TYPES[s.type].storageBonus * tierMul(s);
      }
    }
    return bonus;
  }

  /* Research multiplier from vaults covering the observing organism. */
  function researchMultiplier(game, org) {
    const vault = nearestOfType(game, org.ownerId, 'VAULT', org.x, org.y)
               || nearestOfType(game, org.ownerId, 'RELIQUARY', org.x, org.y);
    let m = vault ? (1 + (TYPES[vault.type].researchBonus - 1) * tierMul(vault)) : 1;
    if (CM.layers) m *= CM.layers.researchMul(game, org);
    return m;
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
    const wanted = pickWantedType(game, colony);
    const wantedType = TYPES[wanted];
    let pool = mine;
    if (wantedType && wantedType.depth) {
      const same = mine.filter(s => Math.abs(s.depth - wantedType.depth) <= 1);
      if (same.length) pool = same;
    }
    const anchor = pool[Math.floor(Math.random() * pool.length)];
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2, r = MIN_SPACING + Math.random() * (LINK_RANGE - MIN_SPACING);
      const x = anchor.x + Math.cos(a) * r, y = anchor.y + Math.sin(a) * r;
      if (canPlace(game, colony, wanted, x, y).ok) return { typeKey: wanted, x, y };
    }
    return null;
  }

  /* What this colony is short of. Deliberately reads live state rather than
   * a fixed build order, so an inland colony digs cisterns and a besieged
   * one digs redoubts. */
  const STANCES = {
    SETTLE: { label: 'Settle', hint: 'Fill this layer. No next stair until it is ready.' },
    FORTIFY: { label: 'Fortify', hint: 'Defense rooms and posts. Hold what you have.' },
    HARVEST: { label: 'Harvest', hint: 'Water, food, heat, veins. Income first.' },
    BREED: { label: 'Breed', hint: 'Nurseries and mustering halls.' },
    PUSH: { label: 'Push', hint: 'Cut the next spine the moment this layer is settled.' },
    QUIET: { label: 'Quiet', hint: 'No auto-expand on this layer.' }
  };
  const STANCE_ORDER = ['SETTLE', 'FORTIFY', 'HARVEST', 'BREED', 'PUSH', 'QUIET'];

  function stanceOf(colony, depth) {
    if (!colony.layerStance) colony.layerStance = {};
    return colony.layerStance[depth] || 'SETTLE';
  }
  function setStance(colony, depth, stance) {
    if (!colony.layerStance) colony.layerStance = {};
    if (!STANCES[stance]) return;
    colony.layerStance[depth] = stance;
  }
  function setLayerRally(colony, depth, x, y, siteId) {
    if (!colony.layerRally) colony.layerRally = {};
    if (x == null) { delete colony.layerRally[depth]; return; }
    colony.layerRally[depth] = { x, y, siteId: siteId || null };
  }

  function stancePick(game, colony, depth) {
    const stance = stanceOf(colony, depth);
    if (stance === 'QUIET') return null;
    const have = {};
    for (const s of completed(game, colony.id)) {
      if (s.depth === depth) have[s.type] = (have[s.type] || 0) + 1;
    }
    const missing = (keys) => {
      for (const k of keys) {
        if (TYPES[k] && TYPES[k].depth === depth && !have[k] && isPermitted(colony, k, depth)) return k;
      }
      return null;
    };
    if (stance === 'FORTIFY') {
      return missing(['REDOUBT', 'BASTION', 'CITADEL', 'KEEP', 'WARREN', 'MUSTER']) || missing(['REDOUBT']);
    }
    if (stance === 'HARVEST') {
      return missing(['CISTERN', 'GRANARY', 'FUNGARIUM', 'SPOREWELL', 'AQUEDUCT', 'GEOTHERMAL', 'VEINWORKS', 'HEARTH', 'SEAM']);
    }
    if (stance === 'BREED') return missing(['NURSERY', 'MUSTER']);
    if (stance === 'PUSH') {
      if (CM.layers && CM.layers.layerReady(game, colony, depth).ok && depth < 9) {
        const spines = [null, 'SHAFT', 'DESCENT', 'WELL', 'GALLERY', 'CLEFT', 'CHASM', 'MANTLE', 'ABYSS', 'GATE'];
        return spines[depth + 1];
      }
      return CM.layers ? CM.layers.wantedOnLayer(game, colony, depth) : null;
    }
    return CM.layers ? CM.layers.wantedOnLayer(game, colony, depth) : null;
  }

  function pickWantedType(game, colony) {
    const have = {};
    for (const s of completed(game, colony.id)) have[s.type] = (have[s.type] || 0) + 1;
    const deepest = deepestOf(game, colony.id);

    if (deepest >= 1) {
      const stance = stanceOf(colony, deepest);
      if (stance === 'QUIET') {
        // Quiet deepest: only fill a critical shallow need, never push.
      } else {
        const pick = stancePick(game, colony, deepest);
        if (pick && isPermitted(colony, pick)) return pick;
      }
    }

    // Shallow needs first — a colony that cannot drink has no business
    // sinking a descent.
    const dry = !W.findNearestWater(game.world, colony.x, colony.y, 30);
    if (dry && !have.CISTERN && isPermitted(colony, 'CISTERN')) return 'CISTERN';
    if (!have.WARREN && isPermitted(colony, 'WARREN')) return 'WARREN';
    if (colony.biomass >= colony.biomassCap * 0.95 && !have.GRANARY && isPermitted(colony, 'GRANARY')) return 'GRANARY';

    // Fill the current layer before cutting the next spine. Rushing the
    // ladder is how a colony arrives at a Gate with nothing to hold.
    if (CM.layers && deepest >= 1 && deepest < 9) {
      const fill = CM.layers.wantedOnLayer(game, colony, deepest);
      if (fill) return fill;
      const ready = CM.layers.layerReady(game, colony, deepest);
      if (!ready.ok) {
        const more = CM.layers.wantedOnLayer(game, colony, deepest);
        if (more) return more;
      }
    }

    const spines = [null, 'SHAFT', 'DESCENT', 'WELL', 'GALLERY', 'CLEFT', 'CHASM', 'MANTLE', 'ABYSS', 'GATE'];
    if (deepest >= 1 && deepest < 9 && !have[spines[deepest + 1]]) {
      if (!CM.layers || CM.layers.layerReady(game, colony, deepest).ok) return spines[deepest + 1];
    }

    if (deepest >= 2) {
      if (colony.losses > 6 && !have.REDOUBT) return 'REDOUBT';
      if (!have.NURSERY) return 'NURSERY';
      if (!have.FUNGARIUM) return 'FUNGARIUM';
      if (!have.VAULT) return 'VAULT';
    }
    if (deepest >= 3) {
      if (!have.GEOTHERMAL) return 'GEOTHERMAL';
      if (nearestVein(game, colony.x, colony.y, 40) && !have.VEINWORKS) return 'VEINWORKS';
    }
    if (deepest >= 4 && !have.SPOREWELL) return 'SPOREWELL';
    if (deepest >= 5 && !have.RESONATOR) return 'RESONATOR';
    if (deepest >= 6 && (colony.losses > 4 || !have.BASTION) && !have.BASTION) return 'BASTION';
    if (deepest >= 7 && !have.HEARTH) return 'HEARTH';
    if (deepest >= 8 && !have.CITADEL) return 'CITADEL';
    if (deepest >= 9 && !have.KEEP) return 'KEEP';
    if (deepest >= 3 && !have.SANCTUM && colony.biomass > 150) return 'SANCTUM';
    if (deepest >= 8 && !have.CRYPT && colony.biomass > 200) return 'CRYPT';

    const pool = deepest >= 6
      ? ['BASTION', 'CITADEL', 'FUNGARIUM', 'SPOREWELL', 'REDOUBT']
      : deepest >= 2
        ? ['WARREN', 'CISTERN', 'GRANARY', 'NURSERY', 'REDOUBT', 'FUNGARIUM']
        : ['WARREN', 'CISTERN', 'GRANARY'];
    const allowed = pool.filter(k => isPermitted(colony, k));
    const pick = allowed.length ? allowed : pool;
    return pick[Math.floor(Math.random() * pick.length)];
  }

  const LABOR_KEYS = ['dig', 'guard', 'harvest', 'breed'];
  const LABOR_LABEL = { dig: 'Dig', guard: 'Guard', harvest: 'Forage', breed: 'Breed' };
  function laborOf(colony, depth) {
    if (!colony.layerLabor) colony.layerLabor = {};
    const cur = colony.layerLabor[depth];
    if (cur) return cur;
    return { dig: 1, guard: 1, harvest: 1, breed: 1 };
  }
  function bumpLabor(colony, depth, key) {
    if (!LABOR_KEYS.includes(key)) return laborOf(colony, depth);
    const cur = Object.assign({}, laborOf(colony, depth));
    cur[key] = ((cur[key] || 0) + 1) % 5;
    if (!colony.layerLabor) colony.layerLabor = {};
    colony.layerLabor[depth] = cur;
    return cur;
  }

  function isPermitted(colony, typeKey, depth) {
    const d = depth != null ? depth : (TYPES[typeKey] && TYPES[typeKey].depth);
    if (!colony || !colony.layerPermit || !d || !colony.layerPermit[d]) return true;
    return colony.layerPermit[d][typeKey] !== false;
  }
  function togglePermit(colony, depth, typeKey) {
    if (!colony.layerPermit) colony.layerPermit = {};
    if (!colony.layerPermit[depth]) colony.layerPermit[depth] = {};
    if (colony.layerPermit[depth][typeKey] === false) delete colony.layerPermit[depth][typeKey];
    else colony.layerPermit[depth][typeKey] = false;
    return isPermitted(colony, typeKey, depth);
  }

  function assignCrew(game, site, orgIds) {
    if (!site) return [];
    const prev = site.crewIds || [];
    for (let i = 0; i < prev.length; i++) {
      const o = game.byId[prev[i]];
      if (o && o.assignedSiteId === site.id) o.assignedSiteId = null;
    }
    const ids = (orgIds || []).slice();
    site.crewIds = ids;
    for (let i = 0; i < ids.length; i++) {
      const o = game.byId[ids[i]];
      if (o && o.alive) o.assignedSiteId = site.id;
    }
    return ids;
  }
  function clearCrew(game, site) { return assignCrew(game, site, []); }

  function destroy(game, site) {
    if (CM.layers) CM.layers.onDestroyed(game, game.__bus, site);
    const i = game.structures.list.indexOf(site);
    if (i >= 0) game.structures.list.splice(i, 1);
    // Anything that hung off it is orphaned rather than silently kept alive:
    // a network severed above ground does not keep working below it.
    for (const s of all(game)) if (s.linkId === site.id) s.linkId = null;
    if (site.veinId) {
      const vein = (game.world.veins || []).find(v => v.id === site.veinId);
      if (vein) vein.claimedBy = null;
    }
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
    DEPTHS, MAX_DEPTH, VEIN_REACH, nearestVein, revealVeinsNear,
    findShelter, nurseryAt, fungariumFeed, findNearestCistern, defenseAt,
    colonyIncome, hasSanctum, sanctumProgress, deepestOf,
    storageBonus, researchMultiplier, suggestExpansion, pickWantedType,
    destroy, removeStructuresOf, serialize, hydrate,
    setPriority, demolish, canEntrench, entrench, ENTRENCH_COST,
    STANCES, STANCE_ORDER, stanceOf, setStance, setLayerRally, stancePick,
    MAX_TIER, tierMul, radiusOf, upgradeName, upgradeCost, upgradeWorkNeeded,
    canUpgrade, startUpgrade, finishUpgrade,
    LABOR_KEYS, LABOR_LABEL, laborOf, bumpLabor,
    isPermitted, togglePermit, assignCrew, clearCrew
  };
})(window.CM = window.CM || {});
