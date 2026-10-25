/* Coremind — organism instances: factory, object pool, and the pure stat/
 * comfort math shared by simulation and AI. No per-species behaviour lives
 * here — see ai.js for the reusable state machine every organism runs.
 */
(function (CM) {
  'use strict';
  const K = CM.core;
  const T = CM.traits;

  /* SEEK_WATER is the one state beyond the brief's list. The brief calls that
   * list "possible states", and water_requirement is a required stat — without
   * somewhere for a thirsty organism to go, that stat could only ever be a
   * hidden death sentence rather than a design decision the player can answer. */
  const AI_STATE = {
    IDLE: 'IDLE', EXPLORE: 'EXPLORE', SEEK_FOOD: 'SEEK_FOOD', SEEK_WATER: 'SEEK_WATER',
    FLEE: 'FLEE', HUNT: 'HUNT', ATTACK: 'ATTACK', REST: 'REST',
    RETURN_TO_CORE: 'RETURN_TO_CORE', REPRODUCE: 'REPRODUCE', INVESTIGATE: 'INVESTIGATE',
    // The underground states. EXCAVATE is the work itself; SHELTER is taking
    // cover in something already dug.
    EXCAVATE: 'EXCAVATE', SHELTER: 'SHELTER'
  };

  const DIRECTIVES = ['EXPLORE', 'GATHER', 'HUNT', 'DEFEND', 'REPRODUCE', 'INVESTIGATE', 'RETURN',
    'DIG', 'SHELTER', 'EXPAND'];

  const pool = [];

  function acquire() {
    return pool.pop() || {
      id: null, ownerId: null, speciesId: null, designId: null, name: '',
      generation: 1, age: 0, x: 0, y: 0, heading: 0,
      stats: null, traits: null, behaviors: null, diet: 'herbivore',
      health: 1, energy: 1, hunger: 0, thirst: 0, burrowed: false, burrowTimer: 0,
      state: AI_STATE.IDLE, stateTimer: 0, directive: null,
      target: null, carrying: 0, alive: true, lod: 'near', selected: false,
      visualSeed: 0, lastEventAt: 0, __gx: 0, __gy: 0
    };
  }

  function release(org) {
    org.alive = false;
    org.target = null;
    pool.push(org);
  }

  let nextId = 1;

  /* traitIds: array (nulls for empty slots are fine, filtered here). */
  function create(opts) {
    const org = acquire();
    const traitIds = (opts.traits || []).filter(Boolean);
    const stats = T.resolveStats(traitIds);
    org.id = 'org_' + (nextId++);
    org.ownerId = opts.ownerId || 'wild';
    org.speciesId = opts.speciesId || null;
    org.designId = opts.designId || null;
    org.name = opts.name || (opts.speciesId ? T.WILD_BY_ID[opts.speciesId].name : 'Organism');
    org.generation = opts.generation || 1;
    org.age = 0;
    org.x = opts.x; org.y = opts.y;
    org.px = org.x; org.py = org.y;
    org.heading = opts.heading != null ? opts.heading : Math.random() * Math.PI * 2;
    org.stats = stats;
    org.traits = traitIds;
    org.behaviors = T.behaviorModifiers(traitIds);
    org.diet = opts.diet || (opts.ownerId === 'player' ? 'omnivore' : 'herbivore');
    org.health = stats.health;
    org.energy = stats.energyMax;
    org.hunger = 0;
    org.thirst = 0;
    org.burrowed = false;
    org.burrowTimer = 0;
    org.burrowCooldown = 0;
    org.sheltered = false;
    org.state = AI_STATE.IDLE;
    org.stateTimer = 0;
    org.directive = opts.directive || null;
    org.directiveTarget = null;
    org.rallyPoint = null;
    org.target = null;
    org.actionTarget = null;
    org.depth = opts.depth || 0;
    org.order = null;
    org._orderRef = null;
    org.raidColonyId = null;
    org.carrying = 0;
    // A random maturation delay before an organism is first eligible to
    // reproduce. Without this every organism in the starting population
    // begins at full health/energy with nothing else to do, so they all
    // enter REPRODUCE on their very first AI decision — a synchronized
    // birth spike a few seconds later, rather than a population that grows
    // gradually and staggers itself the way reproCooldown does afterward.
    org.reproCooldown = 5 + Math.random() * 28;
    org.reproTimer = null;
    org.huntTimer = 0;
    org.aiCounter = 0;
    org.__attackedThisTick = false;
    org.alive = true;
    org.lod = 'near';
    org.selected = false;
    org.visualSeed = (opts.visualSeed != null ? opts.visualSeed : Math.floor(Math.random() * 1e9));
    org.color = opts.color || (opts.ownerId === 'player' ? '#8bac0f' : (T.WILD_BY_ID[opts.speciesId] || {}).color || '#cccccc');
    org.xp = 0;
    org.lifeLevel = 1;
    org.lifeTier = 'common';
    org.lifeMarks = {};
    org.lifeFocus = null;
    org.lifeKills = 0;
    org.lifeMaxDepth = org.depth || 0;
    org.lifeBonus = CM.life && CM.life.emptyBonus ? CM.life.emptyBonus() : {};
    org.__lifeFeed = false;
    org.__lifeDrink = false;
    org.lifeDigAt = 0;
    org.lifePopAt = 0;
    org.inv = [];
    org.__dot = 0;
    org.__stun = 0;
    org.__sprint = 0;
    org.__shell = 0;
    org.__hide = 0;
    return org;
  }

  /* 0 (dead center of comfort) .. 1 (right at the edge of tolerance) .. >1
   * (out of range, taking damage). temperature_tolerance is a +/- half-width
   * band around a fixed species-neutral comfort point. Optional depth
   * comfort (0..0.62) softens stress: settled rock is a better home. */
  const COMFORT_TEMP = 19;
  function tempStress(org, worldTemp, comfort) {
    const band = org.stats.temperature_tolerance;
    const d = Math.abs(worldTemp - COMFORT_TEMP);
    let s = d / band; // <=1 fine, >1 stressed
    if (comfort) s *= (1 - comfort * 0.7);
    return s;
  }

  function isAlive(org) { return org.alive && org.health > 0; }

  CM.organism = { AI_STATE, DIRECTIVES, create, release, isAlive, tempStress, COMFORT_TEMP };
})(window.CM = window.CM || {});
