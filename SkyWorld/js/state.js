/* Skyward Reach — game state shape, new-game construction, save migration. */
(function (SW) {
  'use strict';
  const C = SW.content;
  const { clamp } = SW.core;

  const GRID_W = 6, GRID_H = 6;
  const MAX_PLOTS = GRID_W * GRID_H;   // the full island, once every terrace is up
  const START_PLOTS = 3;

  function makePlot(index) {
    return {
      i: index,
      gx: index % GRID_W,
      gy: Math.floor(index / GRID_W),
      state: 'raw',   // raw | tilled | growing | ripe
      crop: null,
      growth: 0,      // ticks accumulated
      water: 0,       // 0..100
      rot: 0,         // wither pressure 0..100
      soil: 100,      // richness; every harvest takes some out
      last: null,     // last crop sown here, for rotation
      rotated: false
    };
  }

  function newCreature(lineageId, name) {
    const L = C.LINEAGES[lineageId];
    const weights = {};
    for (const id of C.TRAINABLE) weights[id] = 1.0;
    weights.wander = 1.0;
    for (const k in L.instinct) weights[k] = L.instinct[k];
    return {
      lineage: lineageId,
      name: name || L.name,
      hunger: 70,      // 0 starving .. 100 stuffed
      vigor: 90,       // 0 exhausted .. 100 fresh
      mood: 70,        // 0 miserable .. 100 delighted
      bond: 20,        // 0 .. 100
      kind: 0,         // -100 cruel .. +100 kind
      diligence: 0,    // -100 idle .. +100 industrious
      size: 1.0,
      stats: { strength: L.base.strength, cunning: L.base.cunning, grace: L.base.grace },
      weights: weights,
      leash: 'none',
      age: 0,          // days lived
      gen: 1,          // which generation of the line this is
      ingrained: {},   // actId -> 0..1, the only thing that outlives the animal
      ailment: null,   // current illness id
      ailDays: 0,
      techniques: {},  // techId -> repetitions done
      hybrid: null,    // second lineage, if it is a cross
      // transient-ish, but persisted so a reload doesn't eat a pending praise
      act: null,       // { id, tick, target, resolved }
      actCooldown: 0,
      pending: null,   // { act, expires } — the praise/scold window
      // scene position, in the renderer's logical canvas pixels
      x: 470, y: 452, tx: 470, ty: 452,
      fed: 0, praised: 0, scolded: 0, chores: 0
    };
  }

  function newGame(lineageId, creatureName, godName) {
    // Only the first terrace exists at the start; the rest of the grid is
    // added as the island is built outward.
    const plots = [];
    for (let i = 0; i < C.RINGS[0].plots; i++) plots.push(makePlot(i));

    const rivals = C.RIVALS.map((r, i) => ({
      name: r.name, pace: r.pace, spike: r.spike, tone: r.tone,
      renown: 140 + i * 130, seed: 1000 + i * 77
    }));

    const prices = {};
    for (const c of C.CROP_LIST) prices[c.id] = 1;

    return {
      version: 1,
      godName: godName || 'the Nameless',
      tick: 0,
      day: 1,
      dayTick: 0,
      speed: 1,
      paused: false,

      res: { coin: 40, wood: 5, prayer: 0, focus: 24, focusMax: 24, renown: 0 },
      seeds: { sunwheat: 6, glimmerroot: 0, duskberry: 0, aetherbloom: 0 },
      stock: { sunwheat: 0, glimmerroot: 0, duskberry: 0, aetherbloom: 0 },
      prices: prices,

      plots: plots.slice(0, START_PLOTS),
      lockedPlots: plots.slice(START_PLOTS),

      village: { villagers: 3, huts: 3, faith: 20, awe: 5, food: 8, unrest: 0 },
      shrine: 0,

      // frontier
      ring: 0,
      insight: 0,
      features: [],          // { fid, ring, ang, dist, found }
      discovered: {},        // featureId -> day
      effects: {},           // permanent island effects unlocked by examining
      neurons: {},           // neural web nodes bought
      firsts: {},            // one-off novelty awards already collected
      // lineage
      evo: 0,                // evolution tier reached
      gens: 0,               // generation leaps completed
      // mini-games
      mats: { fibre: 0, clay: 0, resin: 0, bone: 0, glass: 0, metal: 0 },
      recipes: {},           // recipeId -> day first made
      crafted: {},           // recipeId -> times made
      deadEnds: {},          // pairKey -> day, pairings known to make nothing
      listen: null,
      listenAt: -9999,

      // weather and season
      weather: { today: 'clear', tomorrow: 'clear' },
      // ground
      // people and structures
      people: [],            // named villagers with roles and traits
      buildings: {},         // buildingId -> tier
      // trade and standing
      caravan: null,
      nextCaravan: 4,
      merchantRep: {},
      diplo: {},
      // relics, titles
      relics: {},            // relicId -> day found
      equipped: [],
      title: 'none',
      titlesSeen: {},
      // techniques
      equippedTech: [],
      mate: null,
      mateOffer: null,
      pedigree: [],
      inbreeding: 0,
      // events and oaths
      event: null,
      eventSeen: {},
      eventLog: [],
      oaths: [],
      oathDay: 0,
      // second wave of mini-games
      fishing: null,
      chant: null,
      fish: {},
      // arena
      arenaChallenge: false,
      arenaResult: null,
      grandeurBonus: 0,
      // ascension
      prestige: { points: 0, boons: {}, runs: 0, best: 0, bestDay: 0 },

      creature: newCreature(lineageId, creatureName),

      rivals: rivals,
      lastStanding: 0,
      feats: {},                 // id -> day earned
      trophies: [],              // { fest, place, day }
      festival: { nextDay: 5, index: 0, lastResult: null },
      log: [],
      chatter: [],
      stats: { harvests: 0, sold: 0, coinEarned: 0, miracles: 0, festivals: 0, festivalWins: 0, days: 0,
               fished: 0, chants: 0, arenaWins: 0, arenaLosses: 0, praisedTotal: 0, choresTotal: 0 },
      fx: [],
      __savedAt: Date.now()
    };
  }

  /* Everything a fresh island needs that isn't a plain field. */
  function startGame(lineageId, creatureName, godName) {
    const g = newGame(lineageId, creatureName, godName);
    SW.discovery.spawnRing(g, 0);
    g.weather.today = SW.world.rollWeather(g);
    g.weather.tomorrow = SW.world.rollWeather(g);
    SW.world.syncPeople(g);
    SW.world.rollOaths(g);
    return g;
  }

  /* Bring an older/partial save up to the current shape without losing progress. */
  function hydrate(g) {
    if (!g || typeof g !== 'object') return null;
    const fresh = newGame('mossback', 'x', 'x');
    const fill = (target, source) => {
      for (const k in source) {
        if (target[k] === undefined) target[k] = source[k];
        else if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k]) &&
                 target[k] && typeof target[k] === 'object') fill(target[k], source[k]);
      }
    };
    fill(g, fresh);
    if (!C.LINEAGES[g.creature.lineage]) g.creature.lineage = 'mossback';
    for (const id of C.TRAINABLE) if (typeof g.creature.weights[id] !== 'number') g.creature.weights[id] = 1;
    if (!g.creature.ingrained) g.creature.ingrained = {};
    g.creature.hunger = clamp(g.creature.hunger, 0, 100);
    g.creature.vigor = clamp(g.creature.vigor, 0, 100);
    // A save from before a terrace existed still has to end up with the right
    // number of plot slots and the right features on the ground.
    const slots = C.RINGS[clamp(g.ring | 0, 0, C.RINGS.length - 1)].plots;
    for (let i = g.plots.length + g.lockedPlots.length; i < slots; i++) g.lockedPlots.push(makePlot(i));
    for (let r = 0; r <= (g.ring | 0); r++) SW.discovery.spawnRing(g, r);
    g.listen = null; g.fishing = null; g.chant = null;
    for (const p of g.plots.concat(g.lockedPlots)) if (p.soil === undefined) p.soil = 100;
    if (!g.weather || !g.weather.today) g.weather = { today: 'clear', tomorrow: 'clear' };
    SW.world.syncPeople(g);
    if (!g.oaths || !g.oaths.length) SW.world.rollOaths(g);
    g.fx = [];
    return g;
  }

  SW.state = { GRID_W, GRID_H, MAX_PLOTS, makePlot, newCreature, newGame, startGame, hydrate };
})(window.SW = window.SW || {});
