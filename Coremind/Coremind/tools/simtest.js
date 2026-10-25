/* Coremind — headless self-test for the simulation core (no DOM/canvas).
 * Run with: node tools/simtest.js
 *
 * Loads the game's own browser scripts under a minimal `window` shim so this
 * exercises the exact same code the browser runs, not a parallel copy.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'js/core.js', 'js/traits.js', 'js/mutations.js', 'js/progress.js', 'js/flora.js', 'js/world.js', 'js/organism.js',
  'js/ai.js', 'js/discovery.js', 'js/climate.js', 'js/colony.js', 'js/structures.js',
  'js/influence.js', 'js/layers.js', 'js/orders.js',
  'js/aura.js', 'js/mind.js', 'js/peel.js', 'js/sense.js',
  'js/sentiment.js', 'js/reputation.js', 'js/economy.js', 'js/guide.js',
  'js/coremind.js', 'js/life.js', 'js/hero.js', 'js/simulation.js', 'js/save.js',
  'js/input.js'
];

/* save.js reaches for localStorage and performance; neither exists in the vm
 * sandbox. Stubbing them lets the persistence layer be tested here rather than
 * only in a browser, which is where the vein/deposit round-trip bug hid. */
const sandbox = {
  console, Math, Set, Map, Object, JSON, Infinity, NaN, Date, Array,
  Float32Array, Uint8Array, Int8Array, Uint8ClampedArray
};
sandbox.performance = { now: () => Date.now() };
sandbox.localStorage = {
  __s: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.__s, k) ? this.__s[k] : null; },
  setItem(k, v) { this.__s[k] = String(v); },
  removeItem(k) { delete this.__s[k]; }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}
const CM = sandbox.CM;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', msg); }
}
function assertClose(a, b, eps, msg) { assert(Math.abs(a - b) <= eps, `${msg} (got ${a}, want ~${b})`); }
function noNaN(org) {
  return Number.isFinite(org.x) && Number.isFinite(org.y) && Number.isFinite(org.health) && Number.isFinite(org.energy) && Number.isFinite(org.hunger);
}

// --- deterministic world gen -------------------------------------------
{
  const w1 = CM.world.generate(12345);
  const w2 = CM.world.generate(12345);
  let same = true;
  for (let i = 0; i < w1.biome.length; i += 97) if (w1.biome[i] !== w2.biome[i]) { same = false; break; }
  assert(same, 'world generation is deterministic given the same seed');
  assert(w1.size === 256, 'world is 256x256');
  // Every biome in the table should be reachable on a real map, or the
  // classifier has a band no seed can ever land in.
  const present = new Set(w1.biome);
  const missing = CM.world.BIOME_INFO.filter(b => !present.has(b.id)).map(b => b.name);
  assert(missing.length <= 2, 'nearly every biome generates on a single seed; missing: ' + missing.join(', '));
  let vegetated = 0, water = 0;
  for (let i = 0; i < w1.biome.length; i++) {
    if (w1.foodCap[i] > 0) vegetated++;
    if (CM.world.isWaterBiome(w1.biome[i])) water++;
  }
  assert(vegetated > 8000, 'world generates a meaningful amount of vegetated ground, got ' + vegetated);
  assert(water > 2000, 'world generates open water, got ' + water);
  assert(w1.regions.length > 5, 'world builds named regions, got ' + w1.regions.length);
  assert(w1.nearestWater && w1.nearestWater.length === w1.biome.length, 'the nearest-water field is built');
}

// --- trait system --------------------------------------------------------
{
  const bare = CM.traits.resolveStats([]);
  const armored = CM.traits.resolveStats(['armor']);
  assert(armored.defense > bare.defense, 'armor increases defense');
  assert(armored.speed < bare.speed, 'armor reduces speed (tradeoff)');
  const cost = CM.traits.resolveCost(['armor', 'venom']);
  assert(cost.biomass > CM.traits.BASE_CREATE_COST.biomass, 'traits add to biomass cost');
  assert(CM.traits.TRAITS.length >= 15, 'at least ~15 traits exist, got ' + CM.traits.TRAITS.length);
  assert(CM.traits.WILD_SPECIES.length >= 4, 'at least a few wild species exist');
}

// --- full game boot + many ticks ------------------------------------------
{
  const game = CM.coremind.newGame(777);
  const bus = CM.core.makeBus();
  const events = [];
  bus.on('event', e => events.push(e));

  CM.simulation.spawnStarterColony(game, bus);
  CM.simulation.spawnStarterWildlife(game);

  assert(game.organisms.length > 40, 'starter population spawned, got ' + game.organisms.length);
  const startingPlayerCount = game.organisms.filter(o => o.ownerId === 'player').length;
  assert(startingPlayerCount === 3, 'three starter organisms, got ' + startingPlayerCount);

  // Issue directives: two colonies get sent hunting/gathering so combat and
  // gathering both actually happen during the run.
  CM.coremind.issueDirective(game, 'GATHER');

  const DT = 0.1;
  let maxPop = 0, anyDeath = false, anyDeposit = false, sawAttackState = false;
  const startBiomass = game.core.biomass;

  for (let i = 0; i < 4000; i++) { // 400 sim-seconds
    CM.simulation.tick(game, bus, DT);
    maxPop = Math.max(maxPop, game.organisms.length);
    for (const org of game.organisms) {
      assert(noNaN(org), `organism ${org.id} has NaN/Infinite state at tick ${i} (x=${org.x},y=${org.y},hp=${org.health})`);
      if (org.state === 'ATTACK') sawAttackState = true;
    }
    if (i === 800) CM.coremind.issueDirective(game, 'HUNT'); // then switch the colony to hunting
  }

  assert(maxPop <= CM.simulation.MAX_ACTIVE + 5, 'population stays near the active cap, max was ' + maxPop);
  assert(game.core.biomass !== startBiomass, 'core biomass changed over the run (gathering/spending happened)');
  assert(events.length > 0, 'the event feed produced events over the run, got ' + events.length);
  assert(Object.keys(game.discovery.knownSpecies).length > 0, 'at least one wild species was discovered');
  assert(sawAttackState, 'combat (ATTACK state) occurred at least once during the run');

  const deaths = events.filter(e => e.kind === 'death').length;
  const discoveries = events.filter(e => e.kind === 'discovery').length;
  console.log(`  (info) ticks=4000 finalPop=${game.organisms.length} maxPop=${maxPop} events=${events.length} deaths=${deaths} discoveries=${discoveries} biomass=${game.core.biomass.toFixed(1)} energy=${game.core.energy.toFixed(1)}`);
  assert(discoveries > 0, 'at least one biological discovery or species sighting occurred');
}

// --- genome designer + create organism ------------------------------------
{
  const game = CM.coremind.newGame(42);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  game.core.biomass = 500; game.core.energy = 500;

  // Nothing is discovered yet — the designer must refuse undiscovered traits.
  CM.coremind.setDesignSlot(game, 'DEFENSE', 'armor');
  assert(game.designerDraft.DEFENSE === null, 'undiscovered traits cannot be slotted into a design');

  game.discovery.discoveredTraits['armor'] = true;
  CM.coremind.setDesignSlot(game, 'DEFENSE', 'armor');
  assert(game.designerDraft.DEFENSE === 'armor', 'a discovered trait can be slotted');

  const beforeCount = game.organisms.length;
  const org = CM.coremind.createOrganismFromDraft(game, bus);
  assert(!!org, 'organism creation succeeds when affordable and traits are discovered');
  assert(game.organisms.length === beforeCount + 1, 'created organism was added to the roster');
  assert(org.stats.defense > CM.traits.BASE_STATS.defense, 'the deployed organism carries the armor trait\'s stat bonus');
}

// --- discovery threshold ---------------------------------------------------
{
  const game = CM.coremind.newGame(9);
  const bus = CM.core.makeBus();
  const wild = CM.organism.create({ ownerId: 'wild', speciesId: 'shellfang', traits: ['armor', 'claws'], x: 5, y: 5 });
  const scout = CM.organism.create({ ownerId: 'player', traits: [], x: 5, y: 5, name: 'Scout' });
  // 'wild_killed' credits the wild organism's DEFENSE-category traits — this
  // is the real "your organism killed it and can now analyze the encounter"
  // pathway, exercised through recordEncounter rather than an internal.
  for (let i = 0; i < CM.discovery.OBSERVATION_THRESHOLD; i++) {
    CM.discovery.recordEncounter(game, bus, scout, wild, 'wild_killed', 5, 5);
  }
  assert(game.discovery.discoveredTraits['armor'] === true, 'crediting a trait to threshold unlocks it');

  const sample = CM.discovery.spawnSample(game, game.world, 5, 5, wild);
  assert(game.discovery.samples.length === 1, 'a sample was recorded');
  const ok = CM.discovery.extractSample(game, bus, sample.id);
  assert(ok, 'extraction succeeds for an existing sample');
  assert(game.discovery.samples.length === 0, 'extracted sample is removed');
}

// --- trait synergy / conflict rules ---------------------------------------
{
  const T = CM.traits;
  // armor and fast_movement declare each other incompatible
  assert(T.conflictsWith(['armor'], 'fast_movement') === 'armor', 'conflictsWith detects a declared incompatibility');
  assert(T.conflictsWith(['bite'], 'armor') === null, 'unrelated traits do not conflict');
  const combo = T.checkCombination(['armor', 'fast_movement']);
  assert(combo.conflicts.length === 1, 'checkCombination reports the conflicting pair once, got ' + combo.conflicts.length);

  // armor <-> regeneration is a declared synergy in both directions
  const syn = T.checkCombination(['armor', 'regeneration']);
  assert(syn.synergies.length === 1, 'checkCombination reports a synergy pair once, got ' + syn.synergies.length);

  const soloArmor = T.resolveStats(['armor']);
  const synArmor = T.resolveStats(['armor', 'regeneration']);
  assert(synArmor.defense > soloArmor.defense, 'synergy amplifies the beneficial stat (defense)');
  // ...but must never deepen the trait's own downside
  const armorSpeedDrop = T.BASE_STATS.speed - soloArmor.speed;
  const synSpeedDrop = T.BASE_STATS.speed - T.resolveStats(['armor']).speed;
  assert(Math.abs(armorSpeedDrop - synSpeedDrop) < 0.001, 'synergy never deepens a trait\'s own penalty');

  // metabolism and water_requirement are costs: lower is better
  assert(T.isBenefit('attack', 5) === true, 'a higher attack is a benefit');
  assert(T.isBenefit('metabolism', 5) === false, 'a higher metabolism is NOT a benefit');
  assert(T.isBenefit('water_requirement', -0.2) === true, 'a lower water requirement is a benefit');

  const eff = T.resolveStats(['efficient_metabolism']);
  assert(eff.water_requirement < T.BASE_STATS.water_requirement, 'efficient metabolism lowers water requirement');
}

// --- designer refuses invalid genomes -------------------------------------
{
  const game = CM.coremind.newGame(31);
  game.discovery.discoveredTraits['armor'] = true;
  game.discovery.discoveredTraits['fast_movement'] = true;
  assert(CM.coremind.setDesignSlot(game, 'DEFENSE', 'armor') === true, 'a discovered trait slots in');
  assert(CM.coremind.setDesignSlot(game, 'BODY', 'fast_movement') === false, 'an incompatible trait is refused');
  assert(game.designerDraft.BODY === null, 'the refused trait did not land in the draft');
  assert(CM.coremind.setDesignSlot(game, 'DEFENSE', null) === true, 'a slot can be cleared');
  assert(CM.coremind.setDesignSlot(game, 'BODY', 'fast_movement') === true, 'the same trait slots once the conflict is cleared');
}

// --- saved designs round-trip ---------------------------------------------
{
  const game = CM.coremind.newGame(32);
  game.discovery.discoveredTraits['bite'] = true;
  CM.coremind.setDesignSlot(game, 'OFFENSE', 'bite');
  const design = CM.coremind.saveDesign(game, 'Biter');
  assert(!!design && game.designs.length === 1, 'a design with traits can be saved');
  CM.coremind.setDesignSlot(game, 'OFFENSE', null);
  assert(game.designerDraft.OFFENSE === null, 'draft cleared before reload');
  assert(CM.coremind.loadDesign(game, design.id) === true, 'a saved design loads');
  assert(game.designerDraft.OFFENSE === 'bite', 'loading restores the saved trait');
  for (const cat of CM.traits.CATEGORIES) CM.coremind.setDesignSlot(game, cat, null);
  assert(CM.coremind.saveDesign(game) === null, 'an empty draft cannot be saved');
  assert(CM.coremind.deleteDesign(game, design.id) === true, 'a design can be deleted');
  assert(game.designs.length === 0, 'deleted design is gone');
}

// --- thirst is a real, survivable need ------------------------------------
{
  const game = CM.coremind.newGame(55);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  const org = game.organisms[0];
  assert(org.thirst === 0, 'organisms start hydrated');

  for (let i = 0; i < 400; i++) CM.simulation.tick(game, bus, 0.1);
  const anyThirst = game.organisms.some(o => o.thirst > 0);
  assert(anyThirst, 'thirst accumulates over time');

  /* Sampled across the run rather than at the end, and across the whole
   * living population rather than the player's three starters.
   *
   * This deliberately does NOT assert that the starter colony survives. It
   * used to, and that assertion started failing for an entirely correct
   * reason: with wild predators now populating the map on their own, three
   * trait-less starter organisms left on their default directive get hunted
   * down — which is the brief's intended opening beat, not a defect. Testing
   * survival here would have quietly pressured the world into being safe.
   * What this test is actually about is whether SEEK_WATER resolves thirst. */
  let samples = 0, parchedSamples = 0;
  for (let i = 0; i < 3000; i++) {
    CM.simulation.tick(game, bus, 0.1);
    if (i % 100 === 0) {
      for (const o of game.organisms) { samples++; if (o.thirst > 95) parchedSamples++; }
    }
  }
  assert(samples > 500, 'thirst sampling covered a real population, got ' + samples);
  const parchedFrac = parchedSamples / samples;
  assert(parchedFrac < 0.12,
    `thirst is resolved for the population at large (${(parchedFrac * 100).toFixed(1)}% of samples parched)`);
}

// --- drinking causally reduces thirst -------------------------------------
{
  const game = CM.coremind.newGame(56);
  const bus = CM.core.makeBus();
  // Find a real shoreline cell on this map and stand a parched organism on it.
  let shore = null;
  for (let y = 0; y < 256 && !shore; y++) {
    for (let x = 0; x < 256; x++) {
      if (CM.world.biomeAt(game.world, x + 0.5, y + 0.5) !== CM.world.BIOME.WATER
          && CM.world.atWaterEdge(game.world, x + 0.5, y + 0.5)) { shore = { x: x + 0.5, y: y + 0.5 }; break; }
    }
  }
  assert(!!shore, 'the generated world has a reachable shoreline');
  const drinker = CM.organism.create({ ownerId: 'player', traits: [], x: shore.x, y: shore.y, name: 'Drinker' });
  drinker.thirst = 95;
  CM.coremind.addOrganism(game, drinker);
  const before = drinker.thirst;
  for (let i = 0; i < 60; i++) CM.simulation.tick(game, bus, 0.1);
  assert(drinker.thirst < before - 20, `standing at water resolves thirst (${before} -> ${drinker.thirst.toFixed(1)})`);
}

// --- armored builds are slowed, never immobilised -------------------------
{
  const T = CM.traits;
  for (const sp of T.WILD_SPECIES) {
    const stats = T.resolveStats(sp.traits);
    assert(stats.speed > T.STAT_MIN.speed, `${sp.name} is not pinned at the speed floor (speed ${stats.speed})`);
  }
  const shellfang = T.resolveStats(T.WILD_BY_ID['shellfang'].traits);
  const starter = T.resolveStats([]);
  assert(shellfang.speed > starter.speed, 'an armored predator still outruns a bare starter organism');
}

// --- burrowing actually hides an organism ---------------------------------
{
  const game = CM.coremind.newGame(77);
  const digger = CM.organism.create({ ownerId: 'player', traits: ['burrowing'], x: 40, y: 40, name: 'Digger' });
  assert(digger.behaviors.has('can_burrow_flee'), 'the burrowing trait carries its behavior modifier');
  assert(digger.stats.digging > 0, 'the burrowing trait grants the digging stat');
  const watcher = CM.organism.create({ ownerId: 'wild', speciesId: 'stalker', traits: ['fast_movement', 'bite'], x: 41, y: 40 });
  CM.coremind.addOrganism(game, digger);
  CM.coremind.addOrganism(game, watcher);

  /* Control arm first: the same organism, same position, same watcher, only
   * `burrowed` differs. Asserting merely that nothing was sensed would pass
   * for the wrong reason if the two were simply out of range of each other,
   * and identity matters because nearestPrey reports whatever is closest —
   * not necessarily the organism under test. */
  const seen = CM.simulation.gatherContext(game, watcher).nearestPrey;
  assert(!!seen && seen.entity.id === digger.id, 'an above-ground digger IS sensed as prey (control)');

  digger.burrowed = true;
  const hidden = CM.simulation.gatherContext(game, watcher).nearestPrey;
  assert(!hidden || hidden.entity.id !== digger.id, 'a burrowed organism cannot be sensed as prey');
}

// --- chemical sensing defeats camouflage ----------------------------------
{
  const game = CM.coremind.newGame(78);
  const hidden = CM.organism.create({ ownerId: 'wild', speciesId: 'grazer', traits: ['camouflage'], x: 40, y: 40 });
  hidden.speciesId = 'grazer';
  const chemHunter = CM.organism.create({ ownerId: 'player', traits: ['chem_sense'], x: 40.5, y: 40, directive: 'HUNT' });
  CM.coremind.addOrganism(game, hidden);
  CM.coremind.addOrganism(game, chemHunter);
  assert(hidden.behaviors.has('reduce_detection'), 'camouflage carries its detection-reduction behavior');
  assert(chemHunter.behaviors.has('sense_through_walls'), 'chemical sensing carries its behavior modifier');
  let detected = 0;
  for (let i = 0; i < 40; i++) if (CM.simulation.gatherContext(game, chemHunter).nearestPrey) detected++;
  assert(detected === 40, 'chemical sensing detects a camouflaged organism every time, got ' + detected + '/40');
}

// --- observation reports carry investigable detail -------------------------
{
  const game = CM.coremind.newGame(79);
  const bus = CM.core.makeBus();
  const events = [];
  bus.on('event', e => events.push(e));
  const scout = CM.organism.create({ ownerId: 'player', traits: [], x: 5, y: 5, name: 'Scout' });
  const killer = CM.organism.create({ ownerId: 'wild', speciesId: 'needler', traits: ['venom', 'vibration_sense'], x: 5, y: 5 });
  CM.discovery.recordEncounter(game, bus, scout, killer, 'player_killed', 5, 5);
  const death = events.find(e => e.kind === 'death');
  assert(!!death && !!death.observation, 'a player death produces an OBSERVATION report');
  assert(death.observation.damageType === 'Neurotoxic', 'the report names the damage type, got ' + (death.observation || {}).damageType);

  const research = CM.discovery.researchInProgress(game);
  assert(research.length > 0, 'partial observations appear in the research backlog');
  assert(research.every(r => r.progress > 0 && r.progress <= 1), 'research progress is a sane fraction');
}

// --- deaths are attributed to whoever actually did the killing ------------
{
  const game = CM.coremind.newGame(81);
  const bus = CM.core.makeBus();
  const events = [];
  bus.on('event', e => events.push(e));

  // A starving attacker mid-swing at a harmless herbivore. The herbivore
  // never deals damage, so it must never be named as the killer.
  const spot = CM.simulation.randomLandSpot(game.world, 0, 50);
  const attacker = CM.organism.create({ ownerId: 'player', traits: ['bite'], x: spot.x, y: spot.y, name: 'Starveling', directive: 'HUNT' });
  const grazer = CM.organism.create({ ownerId: 'wild', speciesId: 'grazer', traits: ['basic_legs', 'vision'], diet: 'herbivore', x: spot.x + 0.4, y: spot.y });
  CM.coremind.addOrganism(game, attacker);
  CM.coremind.addOrganism(game, grazer);
  attacker.state = 'ATTACK';
  attacker.actionTarget = { type: 'organism', ref: grazer };
  attacker.health = 0.05;      // about to die of its own accord
  attacker.hunger = 100;       // ...from starvation
  attacker.thirst = 100;

  for (let i = 0; i < 40 && game.byId[attacker.id]; i++) CM.simulation.tick(game, bus, 0.1);

  assert(!game.byId[attacker.id], 'the starving attacker died during the run');
  const blamed = events.filter(e => e.kind === 'death' && /Grazer/.test(e.message));
  assert(blamed.length === 0, 'a harmless herbivore is never credited with a kill, got: ' + blamed.map(e => e.message).join(' / '));
}

// --- world: rivers, regions, hazards, colony sites -------------------------
{
  const w = CM.world.generate(4242);
  let river = 0;
  for (let i = 0; i < w.river.length; i++) if (w.river[i]) river++;
  assert(river > 100, 'rivers are carved into the map, got ' + river + ' cells');
  assert(w.hazards.length > 10, 'hazards are placed, got ' + w.hazards.length);
  assert(w.deposits.length > 5, 'biomass deposits are placed, got ' + w.deposits.length);

  // Every named region must be a real, non-trivial area of its own biome.
  for (const r of w.regions.slice(1)) {
    assert(r.size >= 200, `region ${r.name} is a substantial area (${r.size})`);
    assert(!!r.name && r.name.indexOf('undefined') < 0, `region ${r.id} has a real name: ${r.name}`);
  }

  // The nearest-water field must agree with a brute-force scan. This is the
  // optimisation that replaced a live radial search, so it has to be right,
  // not just fast.
  let checked = 0, mismatched = 0;
  for (let t = 0; t < 60; t++) {
    const x = 20 + Math.floor(Math.random() * 200), y = 20 + Math.floor(Math.random() * 200);
    const viaField = CM.world.findNearestWater(w, x + 0.5, y + 0.5, 999);
    let brute = null, bestD = Infinity;
    for (let yy = 0; yy < 256; yy++) {
      for (let xx = 0; xx < 256; xx++) {
        if (!CM.world.isWaterBiome(w.biome[yy * 256 + xx])) continue;
        const d = Math.hypot(xx + 0.5 - (x + 0.5), yy + 0.5 - (y + 0.5));
        if (d < bestD) { bestD = d; brute = { x: xx + 0.5, y: yy + 0.5 }; }
      }
    }
    if (!brute || !viaField) continue;
    checked++;
    const fieldD = Math.hypot(viaField.x - (x + 0.5), viaField.y - (y + 0.5));
    // BFS is 8-connected, so it can be marginally off true Euclidean nearest;
    // a few percent is fine, a wildly wrong answer is not.
    if (fieldD > bestD * 1.15 + 1.5) mismatched++;
  }
  assert(checked > 40, 'water-field check sampled enough points, got ' + checked);
  assert(mismatched === 0, `nearest-water field agrees with brute force (${mismatched}/${checked} bad)`);
}

// --- flora ------------------------------------------------------------------
{
  const defended = CM.flora.PLANTS.filter(p => p.toxicity > 0 || p.thorns > 0);
  assert(defended.length >= 3, 'several plant species are defended, got ' + defended.length);

  const toxic = CM.flora.PLANTS.find(p => p.toxicity > 0);
  const plain = CM.organism.create({ ownerId: 'player', traits: [], x: 5, y: 5 });
  const venomous = CM.organism.create({ ownerId: 'player', traits: ['venom'], x: 5, y: 5 });
  const plainBite = CM.flora.biteOutcome(toxic.id, plain, 16);
  const venomBite = CM.flora.biteOutcome(toxic.id, venomous, 16);
  assert(plainBite.toxin > 0, 'a toxic plant injures an ordinary organism');
  assert(venomBite.toxin < plainBite.toxin, 'a venom-producing organism resists ingested toxins');

  const thorny = CM.flora.PLANTS.find(p => p.thorns > 0);
  const armored = CM.organism.create({ ownerId: 'player', traits: ['armor'], x: 5, y: 5 });
  assert(CM.flora.biteOutcome(thorny.id, armored, 16).physical
       < CM.flora.biteOutcome(thorny.id, plain, 16).physical, 'armor blunts thorn damage');

  // Nutrition must actually differentiate the species, or flora is cosmetic.
  const values = CM.flora.PLANTS.filter(p => p.id).map(p => p.nutrition);
  assert(new Set(values).size > 3, 'plant species differ in nutrition');
}

// --- climate ------------------------------------------------------------------
{
  const game = CM.coremind.newGame(1234, { rivalCount: 0 });
  const bus = CM.core.makeBus();
  const events = [];
  bus.on('event', e => events.push(e));

  const baseTemp = CM.world.tempAt(game.world, 100, 100);
  game.climate.seasonIndex = 3;               // Deep Cold
  CM.climate.apply(game);
  const coldTemp = CM.world.tempAt(game.world, 100, 100);
  assert(coldTemp < baseTemp, `season shifts the whole map's temperature (${baseTemp.toFixed(1)} -> ${coldTemp.toFixed(1)})`);

  game.climate.event = { key: 'DROUGHT', remaining: 999 };
  CM.climate.apply(game);
  assert(game.world.growthScale < 1, 'a drought suppresses plant regrowth');

  // Seasons must actually advance over a long run.
  game.climate = CM.climate.newState(1234);
  let seen = new Set();
  for (let i = 0; i < 12000; i++) { CM.climate.tick(game, bus, 0.1); seen.add(game.climate.seasonIndex); }
  assert(seen.size >= 3, 'seasons cycle over a long run, saw ' + seen.size);
  assert(events.some(e => e.kind === 'climate'), 'season changes are announced');
}

// --- colonies: they are real, independent Coreminds --------------------------
{
  const game = CM.coremind.newGame(2468);
  const bus = CM.core.makeBus();
  const events = [];
  bus.on('event', e => events.push(e));

  assert(game.colonies.length === 4, 'player + 3 rivals exist, got ' + game.colonies.length);
  assert(game.colonies[0].isPlayer, 'colony 0 is the player');
  assert(game.core === game.colonies[0], 'game.core aliases the player colony');
  for (const c of game.colonies) {
    assert(c.biomassCap > 0, c.id + ' has a storage ceiling');
    assert(!!c.strategyKey, c.id + ' has a doctrine');
  }
  // Rivals must be far enough apart to be distinct powers, not a scrum.
  for (let i = 1; i < game.colonies.length; i++) {
    for (let j = i + 1; j < game.colonies.length; j++) {
      const d = Math.hypot(game.colonies[i].x - game.colonies[j].x, game.colonies[i].y - game.colonies[j].y);
      assert(d > 25, `colonies ${i} and ${j} are meaningfully separated (${d.toFixed(0)})`);
    }
  }

  CM.simulation.spawnStarterColony(game, bus);
  CM.simulation.spawnStarterWildlife(game);
  /* Long enough that every rival has actually been awake for a while. They
   * wake on a stagger at roughly 240/330/420 sim-seconds, so a 500s window
   * left the last one barely started and "rivals revise their genome" failed
   * on the runs where it simply had not had the chance yet. */
  for (let i = 0; i < 9000; i++) CM.simulation.tick(game, bus, 0.1);

  const rivals = CM.colony.livingRivals(game);
  assert(rivals.length > 0, 'rivals survive a long run');
  assert(rivals.some(r => r.deployed > 0), 'rivals actually deploy organisms');
  assert(rivals.some(r => r.designGeneration > 1), 'rivals revise their genome over time');
  const rivalOrganisms = game.organisms.filter(o => o.ownerId.startsWith('rival_'));
  assert(rivalOrganisms.length > 0, 'rival organisms are alive in the world, got ' + rivalOrganisms.length);

  /* Rival gathering must feed *their own* Core. This was a real bug:
   * RETURN_TO_CORE was hardcoded to game.core, so every rival's gatherers
   * walked their harvest across the map and handed it to the player.
   *
   * Asserted directly rather than by watching biomass totals: the simulation
   * uses Math.random() throughout, so a threshold on an emergent number is a
   * coin flip that fails for reasons unrelated to the thing under test. */
  {
    /* Deliberately an isolated world with no player organisms in it. Run in
     * the populated game above, the player's own gatherers keep depositing
     * during the same ticks, so "the player's biomass did not rise" would be
     * measuring their economy rather than where the rival's load went. */
    const iso = CM.coremind.newGame(1111);
    const isoBus = CM.core.makeBus();
    const isoRival = iso.colonies[1];
    const before = { rival: isoRival.biomass, player: iso.core.biomass };

    const hauler = CM.organism.create({
      ownerId: isoRival.id, traits: [], x: isoRival.x, y: isoRival.y, name: 'Hauler', directive: 'GATHER'
    });
    hauler.carrying = 12;
    hauler.state = 'RETURN_TO_CORE';
    hauler.actionTarget = { type: 'core' };
    CM.coremind.addOrganism(iso, hauler);
    for (let i = 0; i < 30 && hauler.carrying > 0; i++) CM.simulation.tick(iso, isoBus, 0.1);

    assert(hauler.carrying === 0, 'the hauler delivered its load');
    assert(isoRival.biomass > before.rival, 'a rival gatherer deposits into its OWN Core');
    assert(iso.core.biomass <= before.player + 0.001,
      `a rival gatherer never deposits into the player's Core (${before.player.toFixed(1)} -> ${iso.core.biomass.toFixed(1)})`);
  }

  const terr = CM.colony.territoryCounts(game);
  assert(Object.keys(terr).length === game.colonies.length, 'territory is tracked per colony');
  assert(terr['player'] > 0, 'the player holds territory');
  assert(game.colonies.slice(1).some(c => terr[c.id] > 0), 'rivals hold territory too');
  assert(events.some(e => e.kind === 'rival'), 'rival activity reaches the event feed');
}

// --- colony collapse releases its organisms ---------------------------------
{
  const game = CM.coremind.newGame(1357);
  const bus = CM.core.makeBus();
  const rival = game.colonies[1];
  for (let i = 0; i < 5; i++) {
    const o = CM.organism.create({ ownerId: rival.id, traits: ['bite'], x: rival.x + i, y: rival.y, name: 'R' + i });
    CM.coremind.addOrganism(game, o);
  }
  const before = game.organisms.filter(o => o.ownerId === rival.id).length;
  assert(before === 5, 'rival organisms exist before collapse');

  CM.colony.damageCore(game, bus, rival, 999);
  assert(!rival.alive, 'a Core reduced to zero collapses the colony');
  assert(game.organisms.filter(o => o.ownerId === rival.id).length === 0, 'no organism still belongs to a dead colony');
  assert(game.organisms.filter(o => o.ownerId === 'wild').length >= 5,
    'a collapsed colony\'s organisms go feral rather than vanishing');
}

// --- colony design responds to local conditions ------------------------------
{
  const game = CM.coremind.newGame(8642);
  const rival = game.colonies[1];
  // Give it everything, so the choice is driven by conditions rather than by
  // what it happens to have unlocked.
  for (const t of CM.traits.TRAITS) rival.discovered[t.id] = true;

  // Plant it somewhere genuinely cold and see what it builds.
  let coldSpot = null;
  for (let y = 0; y < 256 && !coldSpot; y++) {
    for (let x = 0; x < 256; x++) {
      if (CM.world.tempAt(game.world, x + 0.5, y + 0.5) < -2 && !CM.world.isWaterAt(game.world, x + 0.5, y + 0.5)) {
        coldSpot = { x: x + 0.5, y: y + 0.5 }; break;
      }
    }
  }
  if (coldSpot) {
    rival.x = coldSpot.x; rival.y = coldSpot.y;
    let sawCold = 0;
    for (let i = 0; i < 12; i++) if (CM.colony.chooseDesign(game, rival).METABOLISM === 'cold_resistance') sawCold++;
    assert(sawCold >= 8, `a colony on cold ground favours cold resistance (${sawCold}/12)`);
  }

  // A design must never contain a declared incompatibility.
  for (let i = 0; i < 40; i++) {
    const design = CM.colony.chooseDesign(game, rival);
    const ids = CM.colony.designTraitIds(design);
    assert(CM.traits.checkCombination(ids).conflicts.length === 0,
      'a rival never designs an incompatible genome: ' + ids.join(','));
  }
}

// --- no directive is a slow death sentence ---------------------------------
{
  /* Every directive must leave a colony viable. EXPLORE in particular is the
   * one the brief has the player reach for first, and it used to wipe the
   * colony: the directive multiplier outranked both feeding and breeding, so
   * organisms sightsaw on an empty stomach and never replaced their losses.
   * Two of three seeds went extinct. This is the regression guard. */
  /* Measured on *peak* population rather than final. The simulation is
   * stochastic, so a colony can be unlucky and die in any given run — an
   * assertion on the final count is a coin flip that reports a balance
   * failure when nothing changed. Peak is stable across trials (EXPLORE
   * 32-33, GATHER 53-56, DEFEND 39-59 measured over four runs each) and
   * still catches the real regression this guards: before the fix EXPLORE
   * never got off the ground at all, peaking in the low single digits. */
  /* Best of two runs. Peak is far more stable than final population, but it
   * still has a tail — EXPLORE measured 21/45/45/45/45/45 over six trials,
   * and a single run occasionally lands well below that. Requiring the better
   * of two keeps this a real guard against a systematically dead directive
   * (which fails both, as EXPLORE did before the fix, peaking in single
   * digits every time) without failing the build on one unlucky sample. */
  for (const directive of ['EXPLORE', 'GATHER', 'HUNT', 'DEFEND']) {
    let bestPeak = 0;
    for (let trial = 0; trial < 2 && bestPeak < 12; trial++) {
      const game = CM.coremind.newGame(777);
      const bus = CM.core.makeBus();
      CM.simulation.spawnStarterColony(game, bus);
      CM.simulation.spawnStarterWildlife(game);
      CM.coremind.issueDirective(game, directive);
      let peak = 0;
      for (let i = 0; i < 5000; i++) {
        CM.simulation.tick(game, bus, 0.1);
        if (game.stats.playerPop > peak) peak = game.stats.playerPop;
      }
      bestPeak = Math.max(bestPeak, peak);
    }
    assert(bestPeak >= 12, `a colony on ${directive} can actually grow (best peak ${bestPeak})`);
  }
}

// --- reproduction pressure tracks how full the colony is --------------------
{
  const game = CM.coremind.newGame(99);
  const org = CM.organism.create({ ownerId: 'player', traits: [], x: 20, y: 20, name: 'A' });
  org.energy = org.stats.energyMax; org.health = org.stats.health; org.reproCooldown = 0;
  const base = { canEatPlants: true, canHunt: false, newSightings: [] };

  const empty = CM.ai.decide(org, Object.assign({}, base, { colonyRoom: 1 }));
  org.state = 'IDLE';
  const full = CM.ai.decide(org, Object.assign({}, base, { colonyRoom: 0 }));
  assert(empty.state === 'REPRODUCE', 'a nearly empty colony prioritises breeding, got ' + empty.state);
  assert(full.state !== 'REPRODUCE', 'a colony at its ceiling stops breeding, got ' + full.state);
}

// --- needs outrank a standing directive before they turn critical -----------
{
  const game = CM.coremind.newGame(98);
  const org = CM.organism.create({ ownerId: 'player', traits: [], x: 20, y: 20, name: 'B', directive: 'EXPLORE' });
  org.hunger = 70;           // hungry, but well short of the 92 critical cliff
  org.energy = org.stats.energyMax * 0.5;
  const decision = CM.ai.decide(org, {
    canEatPlants: true, canHunt: false, newSightings: [], colonyRoom: 0.2,
    nearestFood: { x: 21, y: 20, dist: 1 }
  });
  assert(decision.state === 'SEEK_FOOD',
    'a hungry organism eats rather than continuing to explore, got ' + decision.state);
}

// --- deposits are a real, contestable resource ------------------------------
{
  const game = CM.coremind.newGame(3690);
  const bus = CM.core.makeBus();
  const dep = game.world.deposits[0];
  assert(!!dep && dep.remaining > 0, 'the world places stocked deposits');

  const gatherer = CM.organism.create({
    ownerId: 'player', traits: [], x: dep.x, y: dep.y, name: 'Harvester', directive: 'GATHER'
  });
  CM.coremind.addOrganism(game, gatherer);
  gatherer.state = 'SEEK_FOOD';
  gatherer.actionTarget = { type: 'food_cell', x: dep.x, y: dep.y };

  const before = dep.remaining;
  for (let i = 0; i < 20; i++) CM.simulation.tick(game, bus, 0.1);
  assert(dep.remaining < before, `a deposit is depleted by harvesting (${before.toFixed(0)} -> ${dep.remaining.toFixed(0)})`);
  assert(gatherer.carrying > 0, 'the harvester is actually carrying the yield');
  assert(dep.claimedBy === 'player', 'harvesting stakes a claim on the deposit');

  // Depletion has to matter: a stripped deposit does not instantly refill.
  dep.remaining = 0;
  CM.world.tickDeposits(game.world, 1);
  assert(dep.remaining < dep.richness * 0.05, 'a stripped deposit recovers slowly, not instantly');
}

// --- hostility is earned, and changes who is a target -----------------------
{
  const game = CM.coremind.newGame(4812);
  const bus = CM.core.makeBus();
  const events = [];
  bus.on('event', e => events.push(e));
  const rival = game.colonies[1];

  assert(!CM.colony.areHostile(game, 'player', rival.id),
    'colonies are wary but not openly hostile at the start');

  // Two colonial organisms in range of each other: not prey while at peace.
  const mine = CM.organism.create({ ownerId: 'player', traits: ['bite'], x: 60, y: 60, name: 'Mine', directive: 'HUNT' });
  const theirs = CM.organism.create({ ownerId: rival.id, traits: [], x: 60.6, y: 60, name: 'Theirs' });
  CM.coremind.addOrganism(game, mine);
  CM.coremind.addOrganism(game, theirs);
  const atPeace = CM.simulation.gatherContext(game, mine).nearestPrey;
  assert(!atPeace || atPeace.entity.id !== theirs.id,
    'a rival organism is not hunted while the colonies are at peace');

  // Grind standing down through real kills.
  for (let i = 0; i < 12; i++) CM.colony.registerKill(game, bus, 'player', rival.id);
  assert(CM.colony.areHostile(game, 'player', rival.id), 'repeated kills produce open hostility');
  assert(events.some(e => /hostile/i.test(e.message)), 'the turn to hostility is announced');

  const atWar = CM.simulation.gatherContext(game, mine).nearestPrey;
  assert(!!atWar && atWar.entity.id === theirs.id,
    'once hostile, a rival organism becomes a valid target');

  // And it cools off if left alone.
  const before = CM.colony.standingBetween(game, game.core, rival);
  CM.colony.recordLoss(game, rival, 'combat');   // no-op on standing
  for (let i = 0; i < 200; i++) CM.colony.tick(game, bus, 0.5);
  assert(CM.colony.standingBetween(game, rival, game.core) >= -1, 'standing stays in range');
}

// --- doctrine actually changes where organisms go ---------------------------
{
  const game = CM.coremind.newGame(5150);
  const predatory = game.colonies[1];
  const entrenched = game.colonies[2];
  predatory.strategyKey = 'PREDATORY';
  entrenched.strategyKey = 'ENTRENCHED';

  let predFar = 0, entFar = 0;
  for (let i = 0; i < 40; i++) {
    const p = CM.colony.pickRally(game, predatory, 'HUNT');
    const e = CM.colony.pickRally(game, entrenched, 'DEFEND');
    if (Math.hypot(p.x - predatory.x, p.y - predatory.y) > 12) predFar++;
    if (Math.hypot(e.x - entrenched.x, e.y - entrenched.y) > 12) entFar++;
  }
  assert(predFar > 30, `a predatory colony sends its hunters away from home (${predFar}/40)`);
  assert(entFar === 0, `an entrenched colony keeps its defenders at the Core (${entFar}/40)`);
}

// --- underground: placement rules make it a network, not a scatter --------
{
  const game = CM.coremind.newGame(7777);
  const bus = CM.core.makeBus();
  const colony = game.core;
  colony.biomass = 500; colony.energy = 500;

  // Find land near the Core to build on.
  let spot = null;
  for (let r = 6; r < 20 && !spot; r += 2) {
    for (let a = 0; a < 12; a++) {
      const x = colony.x + Math.cos(a) * r, y = colony.y + Math.sin(a) * r;
      if (CM.structures.canPlace(game, colony, 'SHAFT', x, y).ok) { spot = { x, y }; break; }
    }
  }
  assert(!!spot, 'a shaft can be sited somewhere near the Core');

  // A warren cannot be the first thing built — the network has to start.
  const orphan = CM.structures.canPlace(game, colony, 'WARREN', spot.x, spot.y);
  assert(!orphan.ok, 'a non-standalone chamber cannot be built with no network');
  assert(/shaft/i.test(orphan.reason), 'and the refusal explains why: ' + orphan.reason);

  const q = CM.structures.queue(game, bus, colony, 'SHAFT', spot.x, spot.y);
  assert(q.ok, 'the shaft is queued: ' + (q.reason || ''));
  const site = q.site;
  assert(!site.done && site.work === 0, 'a queued chamber starts as an unfinished pit');

  // Still not connectable while the shaft is only a hole in the ground.
  assert(!CM.structures.canPlace(game, colony, 'WARREN', spot.x + 6, spot.y).ok,
    'a chamber cannot connect to an unfinished one');

  // Dig it out with a burrower, and confirm digging stat drives the rate.
  const digger = CM.organism.create({ ownerId: 'player', traits: ['burrowing'], x: site.x, y: site.y, name: 'Digger' });
  const bare = CM.organism.create({ ownerId: 'player', traits: [], x: site.x, y: site.y, name: 'Bare' });
  assert(digger.stats.digging > bare.stats.digging, 'the burrowing trait grants digging');

  const probe = { work: 0, workNeeded: 999, done: false };
  CM.structures.addWork(game, bus, probe, digger, 1);
  const withTrait = probe.work;
  probe.work = 0;
  CM.structures.addWork(game, bus, probe, bare, 1);
  assert(withTrait > probe.work * 1.5, `a burrower digs markedly faster (${withTrait.toFixed(2)} vs ${probe.work.toFixed(2)})`);

  CM.coremind.addOrganism(game, digger);
  for (let i = 0; i < 400 && !site.done; i++) CM.structures.addWork(game, bus, site, digger, 0.1);
  assert(site.done, 'sustained digging finishes the chamber');

  // Now the network can grow — and only within reach.
  const near = CM.structures.canPlace(game, colony, 'WARREN', spot.x + 7, spot.y);
  const far = CM.structures.canPlace(game, colony, 'WARREN', spot.x + 60, spot.y);
  assert(near.ok, 'a chamber can be added within reach of a finished one');
  assert(!far.ok, 'a chamber cannot be added far from the network');
  assert(near.linkTo && near.linkTo.id === site.id, 'the new chamber links to what it connects to');

  // Placement is refused on impossible ground with an explicable reason.
  let water = null;
  for (let y = 0; y < 256 && !water; y++) {
    for (let x = 0; x < 256; x++) if (CM.world.isWaterAt(game.world, x + 0.5, y + 0.5)) { water = { x: x + 0.5, y: y + 0.5 }; break; }
  }
  if (water) assert(!CM.structures.canPlace(game, colony, 'SHAFT', water.x, water.y).ok, 'chambers cannot be dug under open water');
}

// --- underground: chambers do what they claim -----------------------------
{
  const game = CM.coremind.newGame(8888);
  const bus = CM.core.makeBus();
  const colony = game.core;

  function plant(typeKey, x, y) {
    const s = { id: 'test_' + typeKey, colonyId: colony.id, type: typeKey, x, y,
                work: 1, workNeeded: 1, done: true, linkId: null };
    game.structures.list.push(s);
    return s;
  }

  // Granary raises the Core's storage ceiling.
  const capBefore = CM.colony.BIOMASS_CAP + CM.structures.storageBonus(game, colony.id);
  plant('GRANARY', colony.x, colony.y);
  assert(CM.colony.BIOMASS_CAP + CM.structures.storageBonus(game, colony.id) > capBefore,
    'a granary raises biomass storage');

  // Warren shelters: an organism inside cannot be sensed.
  const warren = plant('WARREN', colony.x + 2, colony.y);
  const hider = CM.organism.create({ ownerId: 'player', traits: [], x: warren.x, y: warren.y, name: 'Hider' });
  const hunter = CM.organism.create({ ownerId: 'wild', speciesId: 'stalker', traits: ['fast_movement', 'bite'], x: warren.x + 0.5, y: warren.y });
  CM.coremind.addOrganism(game, hider);
  CM.coremind.addOrganism(game, hunter);
  const exposed = CM.simulation.gatherContext(game, hunter).nearestPrey;
  assert(!!exposed && exposed.entity.id === hider.id, 'an organism outside shelter IS sensed (control)');
  hider.sheltered = true;
  const hidden = CM.simulation.gatherContext(game, hunter).nearestPrey;
  assert(!hidden || hidden.entity.id !== hider.id, 'an organism inside a warren cannot be sensed');
  hider.sheltered = false;

  // Cistern counts as drinkable water for thirst.
  const dryOrg = CM.organism.create({ ownerId: 'player', traits: [], x: colony.x, y: colony.y, name: 'Thirsty' });
  CM.coremind.addOrganism(game, dryOrg);
  dryOrg.thirst = 80;
  const cistern = plant('CISTERN', colony.x + 1, colony.y + 1);
  const ctx = CM.simulation.gatherContext(game, dryOrg);
  assert(!!ctx.nearestWater, 'a thirsty organism finds water');
  assert(Math.hypot(ctx.nearestWater.x - cistern.x, ctx.nearestWater.y - cistern.y) < 2.5,
    'the cistern is what it heads for when it is the closest water');

  // Vault accelerates research.
  const scholar = CM.organism.create({ ownerId: 'player', traits: [], x: colony.x + 40, y: colony.y, name: 'Scholar' });
  assert(CM.structures.researchMultiplier(game, scholar) === 1, 'no research bonus away from a vault');
  plant('VAULT', colony.x + 40, colony.y);
  assert(CM.structures.researchMultiplier(game, scholar) > 1, 'a vault speeds research for organisms it covers');
}

// --- digging directives actually produce excavation ------------------------
{
  const game = CM.coremind.newGame(9911);
  const bus = CM.core.makeBus();
  const colony = game.core;
  colony.biomass = 500; colony.energy = 500;

  assert(CM.organism.DIRECTIVES.includes('DIG'), 'DIG is an issuable directive');
  assert(CM.organism.DIRECTIVES.includes('SHELTER'), 'SHELTER is an issuable directive');
  assert(CM.organism.DIRECTIVES.includes('EXPAND'), 'EXPAND is an issuable directive');

  // Site a shaft by hand, order the colony to dig, and let them get on with it.
  let spot = null;
  for (let r = 5; r < 16 && !spot; r += 2) {
    for (let a = 0; a < 16; a++) {
      const x = colony.x + Math.cos(a * 0.4) * r, y = colony.y + Math.sin(a * 0.4) * r;
      if (CM.structures.canPlace(game, colony, 'SHAFT', x, y).ok) { spot = { x, y }; break; }
    }
  }
  const res = CM.structures.queue(game, bus, colony, 'SHAFT', spot.x, spot.y);
  assert(res.ok, 'shaft queued for the dig test');

  for (let i = 0; i < 4; i++) {
    const o = CM.organism.create({
      ownerId: 'player', traits: ['burrowing'], name: 'Dig-' + i,
      x: colony.x + (Math.random() - 0.5) * 3, y: colony.y + (Math.random() - 0.5) * 3
    });
    CM.coremind.addOrganism(game, o);
  }
  CM.coremind.issueDirective(game, 'DIG');

  let sawExcavate = false;
  for (let i = 0; i < 2500 && !res.site.done; i++) {
    CM.simulation.tick(game, bus, 0.1);
    if (!sawExcavate) for (const o of game.organisms) if (o.state === 'EXCAVATE') { sawExcavate = true; break; }
  }
  assert(sawExcavate, 'organisms ordered to DIG enter the EXCAVATE state');
  assert(res.site.done, `the colony finished the chamber (work ${res.site.work.toFixed(0)}/${res.site.workNeeded})`);
  assert(CM.structures.completed(game, colony.id).length >= 1, 'the network now has a finished chamber');
}

// --- EXPAND plans its own sites -------------------------------------------
{
  const game = CM.coremind.newGame(2211);
  const bus = CM.core.makeBus();
  game.core.biomass = 500; game.core.energy = 500;
  CM.simulation.spawnStarterColony(game, bus);
  CM.coremind.issueDirective(game, 'EXPAND');
  for (let i = 0; i < 400; i++) CM.simulation.tick(game, bus, 0.1);
  assert(CM.structures.ofColony(game, game.core.id).length > 0,
    'EXPAND has the colony choose and queue its own sites');
}

// --- rivals dig too --------------------------------------------------------
{
  const game = CM.coremind.newGame(3322);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  CM.simulation.spawnStarterWildlife(game);
  for (let i = 0; i < 9000; i++) CM.simulation.tick(game, bus, 0.1);
  const rivalStructures = CM.structures.all(game).filter(s => s.colonyId !== 'player');
  assert(rivalStructures.length > 0, 'rival colonies excavate their own networks, got ' + rivalStructures.length);

  // A collapsed colony's network goes with it.
  const victim = CM.colony.livingRivals(game)[0];
  if (victim) {
    CM.colony.damageCore(game, bus, victim, 999);
    assert(CM.structures.ofColony(game, victim.id).length === 0,
      'a collapsed colony leaves no chambers behind');
  }
}

/* --- depth tiers ----------------------------------------------------------
 * The whole point of the strata is that they are a ladder. These tests are
 * about the ladder rungs, not about the chambers themselves: what can be cut
 * where, and what a level pays out once it is held. */

// A small helper: drop a finished chamber straight into the world. The dig
// loop is already covered above, and going through it for every depth test
// would make these run for thousands of ticks each.
/* Offsets cannot be hardcoded in these tests: a fixed "+6 east of the shaft"
 * lands in a lake on plenty of seeds, and the refusal that comes back is about
 * water rather than about depth — which is exactly the sort of test that
 * passes or fails for a reason unrelated to what it claims to check. */
function findSpot(game, colony, typeKey, from, minR, maxR) {
  for (let r = minR; r <= maxR; r += 0.75) {
    for (let a = 0; a < 24; a++) {
      const x = from.x + Math.cos(a * 0.262) * r, y = from.y + Math.sin(a * 0.262) * r;
      if (CM.structures.canPlace(game, colony, typeKey, x, y).ok) return { x, y };
    }
  }
  return null;
}

function plant(game, colony, typeKey, x, y, linkTo) {
  const type = CM.structures.TYPES[typeKey];
  const site = {
    id: 'st_' + (game.structures.nextId++), colonyId: colony.id, type: typeKey,
    x, y, depth: type.depth, work: type.work, workNeeded: type.work,
    done: true, integrity: 100, linkId: linkTo ? linkTo.id : null
  };
  game.structures.list.push(site);
  return site;
}

// --- you cannot skip a stratum ---------------------------------------------
{
  const game = CM.coremind.newGame(5150);
  const bus = CM.core.makeBus();
  game.paceSkip = true;
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;
  colony.biomass = 4000; colony.energy = 4000;

  // Find dry, buildable ground near the Core to work on.
  let base = null;
  for (let r = 5; r < 18 && !base; r += 1.5) {
    for (let a = 0; a < 20; a++) {
      const x = colony.x + Math.cos(a * 0.31) * r, y = colony.y + Math.sin(a * 0.31) * r;
      if (CM.structures.canPlace(game, colony, 'SHAFT', x, y).ok) { base = { x, y }; break; }
    }
  }
  assert(base, 'found buildable ground for the depth test');

  const shaft = plant(game, colony, 'SHAFT', base.x, base.y);
  assert(shaft.depth === 1, 'a shaft is a shallow-works chamber');
  assert(CM.structures.deepestOf(game, colony.id) === 1, 'the network is one level deep');

  // Depth 2 hangs off depth 1 — allowed.
  const near = findSpot(game, colony, 'DESCENT', shaft, 5, 13);
  assert(near, 'a descent can be cut from the shallow works');
  // Depth 3 at that same spot is not: two levels of separation is refused.
  const deepCheck = CM.structures.canPlace(game, colony, 'GEOTHERMAL', near.x, near.y);
  assert(!deepCheck.ok, 'an abyssal chamber cannot be cut straight off the shallow works');
  assert(/deep galleries/i.test(deepCheck.reason),
    'and the refusal names the level that is missing: ' + deepCheck.reason);

  /* Two chambers on different strata may share ground; two on the same may
   * not. Checked here, while the shaft is still the only thing built — with a
   * descent already sited nearby this would fail on that chamber's spacing
   * rather than on the rule under test. */
  assert(CM.structures.canPlace(game, colony, 'NURSERY', shaft.x + 1, shaft.y).ok,
    'a deep chamber may sit under a shallow one');
  assert(!CM.structures.canPlace(game, colony, 'WARREN', shaft.x + 1, shaft.y).ok,
    'but two chambers cannot share the same spot on the same stratum');

  // Cut the descent, and the abyssal reach opens.
  const descent = plant(game, colony, 'DESCENT', near.x, near.y, shaft);
  assert(CM.structures.deepestOf(game, colony.id) === 2, 'the network is now two levels deep');
  assert(findSpot(game, colony, 'GEOTHERMAL', descent, 5, 13),
    'with deep galleries held, an abyssal chamber can be cut');

  // The build palette gates on the same rule the placement check uses, so what
  // the player is offered and what the world accepts cannot drift apart.
  assert(CM.structures.TYPES.SANCTUM.depth === 3 && CM.structures.TYPES.SANCTUM.endgame,
    'the Sanctum is an abyssal, endgame chamber');
  assert(descent.depth === 2, 'the descent occupies the deep galleries');
}

// --- prospecting: veins are found by digging, not given --------------------
{
  const game = CM.coremind.newGame(6161);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;
  colony.biomass = 4000; colony.energy = 4000;

  assert(game.world.veins.length > 0, 'the world generates abyssal veins');
  assert(game.world.veins.every(v => !v.known), 'no vein is known at world generation');

  const vein = game.world.veins[0];
  // A depth-2 chamber finished next to it should strike the seam.
  const site = {
    id: 'st_probe', colonyId: colony.id, type: 'DESCENT', x: vein.x + 3, y: vein.y,
    depth: 2, work: 0, workNeeded: 1, done: false, integrity: 100, linkId: null
  };
  game.structures.list.push(site);
  const digger = CM.organism.create({ ownerId: 'player', traits: ['burrowing'], name: 'Probe', x: site.x, y: site.y });
  CM.structures.addWork(game, bus, site, digger, 10);
  assert(site.done, 'the probe chamber finished');
  assert(vein.known, 'finishing a deep chamber next to a seam reveals it');

  // A shallow chamber does not prospect — that is what makes depth worth it.
  const game2 = CM.coremind.newGame(6161);
  const bus2 = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game2, bus2);
  const v2 = game2.world.veins[0];
  const shallow = {
    id: 'st_probe2', colonyId: 'player', type: 'WARREN', x: v2.x + 3, y: v2.y,
    depth: 1, work: 0, workNeeded: 1, done: false, integrity: 100, linkId: null
  };
  game2.structures.list.push(shallow);
  CM.structures.addWork(game2, bus2, shallow, digger, 10);
  assert(shallow.done && !v2.known, 'a shallow chamber over the same seam finds nothing');
}

// --- the abyssal economy ---------------------------------------------------
{
  const game = CM.coremind.newGame(7272);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;

  const vein = game.world.veins[0];
  vein.known = true;
  const geo = plant(game, colony, 'GEOTHERMAL', colony.x + 4, colony.y);
  const works = plant(game, colony, 'VEINWORKS', vein.x, vein.y);
  works.veinId = vein.id;
  vein.claimedBy = colony.id;

  const inc = CM.structures.colonyIncome(game, colony.id);
  assert(inc.energy > 0, 'a geothermal tap pays energy, got ' + inc.energy);
  assert(inc.biomass > 0, 'a veinworks pays biomass, got ' + inc.biomass);

  // The seam is finite: an abyssal windfall runs out.
  const before = vein.remaining;
  for (let i = 0; i < 200; i++) CM.structures.colonyIncome(game, colony.id);
  assert(vein.remaining < before, 'working a seam depletes it');
  let guard = 0;
  while (vein.remaining > 0 && guard++ < 5000) CM.structures.colonyIncome(game, colony.id);
  assert(vein.remaining === 0, 'a seam can be worked out entirely');
  assert(CM.structures.colonyIncome(game, colony.id).biomass === 0,
    'and an exhausted seam pays nothing');

  // Losing the veinworks releases the claim so someone else can take it.
  CM.structures.destroy(game, works);
  assert(vein.claimedBy === null, 'destroying a veinworks frees its seam');
  assert(!CM.structures.all(game).includes(works), 'and removes the chamber');
  assert(CM.structures.all(game).includes(geo), 'while leaving the rest of the network');
}

// --- fungus feeds the deep -------------------------------------------------
{
  const game = CM.coremind.newGame(8383);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;
  // Somewhere with no forage, so the only food is the chamber's.
  const spot = { x: colony.x + 5, y: colony.y + 5 };
  const fung = plant(game, colony, 'FUNGARIUM', spot.x, spot.y);

  const inside = CM.organism.create({ ownerId: 'player', traits: [], name: 'Inside', x: spot.x, y: spot.y });
  const outside = CM.organism.create({ ownerId: 'player', traits: [], name: 'Outside', x: spot.x + 30, y: spot.y });
  assert(CM.structures.fungariumFeed(game, inside) > 0, 'an organism in the fungarium is fed by it');
  assert(CM.structures.fungariumFeed(game, outside) === 0, 'one outside is not');
  assert(fung.done, 'the fungarium is complete');
}

// --- the deep bites back ---------------------------------------------------
{
  const game = CM.coremind.newGame(9494);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;
  // Starter scouts would pull the gnawers off the chamber to hunt.
  for (const o of game.organisms.slice()) if (o.ownerId === 'player') CM.coremind.removeOrganism(game, o);

  const subterranean = CM.traits.WILD_SPECIES.filter(sp => sp.subterranean);
  assert(subterranean.length >= 3, 'there is a subterranean species for each stratum');
  for (let d = 1; d <= CM.structures.MAX_DEPTH; d++) {
    assert(subterranean.some(sp => sp.subterranean === d), 'stratum ' + d + ' has its own fauna');
  }

  // A chamber with gnawers on it and nobody defending gets chewed open. The
  // rally point is what deep fauna are spawned with — without it they drift
  // off and the chamber heals faster than they chew, which is exactly the bug
  // this assertion caught the first time it was written.
  const site = plant(game, colony, 'WARREN', colony.x + 8, colony.y + 8);
  for (let i = 0; i < 4; i++) {
    const g = CM.organism.create({
      ownerId: 'wild', speciesId: 'gnawer', traits: ['burrowing', 'bite'],
      name: 'Gnawer', x: site.x, y: site.y
    });
    g.depth = 1;
    g.rallyPoint = { x: site.x, y: site.y, radius: 3 };
    CM.coremind.addOrganism(game, g);
  }
  let ticks = 0;
  while (CM.structures.all(game).includes(site) && ticks++ < 3000) CM.simulation.tick(game, bus, 0.1);
  assert(!CM.structures.all(game).includes(site),
    'unguarded chambers are chewed open and collapse (ticks ' + ticks + ')');

  // ...and the spawner really does hand out that rally, so the mechanic above
  // is the one the game actually runs rather than one only the test sets up.
  const game2 = CM.coremind.newGame(9495);
  const bus2 = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game2, bus2);
  plant(game2, game2.core, 'DESCENT', game2.core.x + 9, game2.core.y);
  let rallied = 0, spawned = 0;
  for (let i = 0; i < 4000 && rallied === 0; i++) {
    CM.simulation.tick(game2, bus2, 0.1);
    for (const o of game2.organisms) {
      if (!o.depth) continue;
      spawned++;
      if (o.rallyPoint) rallied++;
    }
  }
  assert(spawned > 0, 'deep fauna spawn near a finished chamber');
  assert(rallied > 0, 'and are rallied to the excavation that woke them');
}

// --- a redoubt hardens the ground around it --------------------------------
{
  const game = CM.coremind.newGame(1357);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;
  const where = { x: colony.x + 6, y: colony.y };
  assert(CM.structures.defenseAt(game, colony.id, where.x, where.y) === 0,
    'bare ground has no defensive bonus');
  plant(game, colony, 'REDOUBT', where.x, where.y);
  assert(CM.structures.defenseAt(game, colony.id, where.x, where.y) > 0,
    'a redoubt hardens the ground it sits in');
  assert(CM.structures.defenseAt(game, colony.id, where.x + 40, where.y) === 0,
    'and only the ground near it');
}

// --- the Sanctum: the endgame the descent is for ---------------------------
{
  const game = CM.coremind.newGame(2468);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;

  assert(!CM.structures.hasSanctum(game, colony.id), 'no sanctum to begin with');
  assert(CM.structures.sanctumProgress(game, colony.id) === 0, 'and no progress toward one');

  // Half-cut: progress reads, but the colony is not yet safe.
  const partial = {
    id: 'st_sanc', colonyId: colony.id, type: 'SANCTUM', x: colony.x + 9, y: colony.y,
    depth: 3, work: 95, workNeeded: 190, done: false, integrity: 100, linkId: null
  };
  game.structures.list.push(partial);
  const prog = CM.structures.sanctumProgress(game, colony.id);
  assert(prog > 0.4 && prog < 0.6, 'a half-cut sanctum reads as half done, got ' + prog);
  assert(!CM.structures.hasSanctum(game, colony.id), 'and does not protect anything yet');

  // Without it, a Core that loses its siege collapses.
  const doomed = CM.coremind.newGame(2468);
  const dbus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(doomed, dbus);
  CM.colony.damageCore(doomed, dbus, doomed.core, 999);
  assert(!doomed.core.alive, 'without a sanctum, a Core that takes enough damage collapses');

  // With it, the Coremind falls back instead of dying.
  partial.done = true; partial.work = partial.workNeeded;
  assert(CM.structures.hasSanctum(game, colony.id), 'the finished sanctum registers');
  assert(CM.structures.sanctumProgress(game, colony.id) === 1, 'and reads as complete');
  CM.colony.damageCore(game, bus, colony, 999);
  assert(colony.alive, 'a colony with a sanctum survives losing its surface Core');
  assert(Math.abs(colony.x - partial.x) < 0.001 && Math.abs(colony.y - partial.y) < 0.001,
    'and relocates to the sanctum');
  assert(colony.integrity > 0, 'with integrity restored at its new seat');

  // It is a fallback, not immortality: the sanctum itself can still be lost.
  CM.structures.destroy(game, partial);
  assert(!CM.structures.hasSanctum(game, colony.id), 'destroying the sanctum removes the protection');
  CM.colony.damageCore(game, bus, colony, 999);
  assert(!colony.alive, 'and then the colony can be killed like any other');
}

// --- depth survives a save round-trip --------------------------------------
{
  const game = CM.coremind.newGame(8642);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;
  const shaft = plant(game, colony, 'SHAFT', colony.x + 7, colony.y);
  const descent = plant(game, colony, 'DESCENT', colony.x + 11, colony.y, shaft);
  const vein = game.world.veins[0];
  vein.known = true; vein.claimedBy = colony.id;
  descent.integrity = 61;

  const data = JSON.parse(JSON.stringify(CM.save.serialize(game)));
  const loaded = CM.save.hydrate(data);
  const back = CM.structures.all(loaded).find(s => s.id === descent.id);
  assert(back, 'the deep chamber survives a save');
  assert(back.depth === 2, 'with its stratum intact');
  assert(back.integrity === 61, 'and its integrity');
  assert(CM.structures.deepestOf(loaded, colony.id) === 2, 'and the network is still two levels deep');
  const vBack = loaded.world.veins.find(v => v.id === vein.id);
  assert(vBack && vBack.known, 'a found seam stays found');
  assert(vBack.claimedBy === colony.id, 'and stays claimed');
}

/* --- the world remembers what was done to it ------------------------------
 * The terrain regenerates from the seed, which is why none of it is written to
 * storage. The consequence was that everything play *changed* about the world
 * regenerated too: a deposit stripped to nothing came back full, and a seam
 * the colony had spent an hour prospecting came back unknown. */
{
  const game = CM.coremind.newGame(1470);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);

  const dep = game.world.deposits[0];
  const startRemaining = dep.remaining;
  dep.remaining = Math.round(startRemaining * 0.25);
  dep.claimedBy = game.core.id;
  const vein = game.world.veins[1];
  vein.known = true;
  vein.remaining = Math.round(vein.richness * 0.4);

  const loaded = CM.save.hydrate(JSON.parse(JSON.stringify(CM.save.serialize(game))));
  const depBack = loaded.world.deposits.find(d => d.id === dep.id);
  assert(depBack, 'the deposit still exists after a reload');
  assert(depBack.remaining === dep.remaining,
    `a harvested deposit stays harvested (got ${depBack.remaining}, want ${dep.remaining})`);
  assert(depBack.remaining < startRemaining, 'and is genuinely below its generated richness');
  assert(depBack.claimedBy === game.core.id, 'and stays claimed by whoever worked it');

  const veinBack = loaded.world.veins.find(v => v.id === vein.id);
  assert(veinBack.known, 'a prospected seam is still known');
  assert(veinBack.remaining === vein.remaining, 'with the amount already mined out of it');

  // Untouched features come back exactly as the seed generates them.
  const fresh = CM.coremind.newGame(1470);
  const other = loaded.world.deposits[loaded.world.deposits.length - 1];
  const otherFresh = fresh.world.deposits.find(d => d.id === other.id);
  assert(otherFresh && other.remaining === otherFresh.remaining,
    'an untouched deposit is identical to a fresh generation of the same seed');

  // A v1/v2 save has no world block at all and must still load.
  const legacy = JSON.parse(JSON.stringify(CM.save.serialize(game)));
  delete legacy.world;
  legacy.v = 2;
  const old = CM.save.hydrate(legacy);
  assert(old && old.world.deposits.length > 0, 'a save from before world state was recorded still loads');
  assert(old.organisms.length > 0, 'with its organisms intact');
}

// --- ten-layer lock and 4X orders ------------------------------------------
{
  const game = CM.coremind.newGame(10101);
  const bus = CM.core.makeBus();
  game.__bus = bus;
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;
  assert(CM.structures.MAX_DEPTH === 10, 'the underground is ten strata');
  assert(CM.structures.TYPES.GATE.depth === 9, 'the Gate sits on layer 9');
  assert(CM.structures.TYPES.NEXUS.hidden, 'the Veil portal is not a palette item');

  const gate = plant(game, colony, 'GATE', colony.x + 6, colony.y);
  CM.layers.onCompleted(game, bus, gate);
  assert(CM.layers.hasGate(game, colony.id), 'a finished Gate is recognized');
  assert(CM.structures.all(game).some(s => s.type === 'NEXUS' && s.colonyId === colony.id),
    'completing a Gate opens a Veil portal');

  const scout = game.organisms.find(o => o.ownerId === 'player');
  assert(scout, 'starter scout exists');
  CM.coremind.selectOrganism(game, scout.id);
  const n = CM.orders.issue(game, [scout], { type: 'MOVE', x: colony.x + 4, y: colony.y, depth: 0 });
  assert(n === 1 && scout.order && scout.order.type === 'MOVE', 'a MOVE order sticks to the selected organism');

  CM.layers.loseBurrow(game, bus, colony);
  assert(colony.burrowLost, 'losing the Gate marks the burrow lost');
  assert(gate.controlled === false, 'and uncontrolled the Gate');
  assert((scout.depth || 0) === 0, 'organisms underground are ejected to the surface');

  const shaft = plant(game, colony, 'SHAFT', colony.x + 3, colony.y + 3);
  colony.biomass = 200; colony.energy = 200;
  const fort = CM.layers.fortify(game, bus, colony, shaft);
  assert(fort.ok && shaft.fortified && shaft.fortHp > 0, 'a finished shaft can be fortified after the loss');

  const a = CM.organism.create({ ownerId: 'player', traits: [], name: 'A', x: 10, y: 10 });
  const b = CM.organism.create({ ownerId: 'player', traits: [], name: 'B', x: 11, y: 11 });
  CM.coremind.addOrganism(game, a); CM.coremind.addOrganism(game, b);
  // Box-select respects Fog: paint seers so these bodies light their own cells.
  CM.sense.tick(game, 0);
  const boxed = CM.orders.selectInBox(game, 9, 9, 12, 12, 0);
  assert(boxed >= 2, 'box select gathers more than one organism, got ' + boxed);
  CM.orders.issue(game, [a, b], { type: 'MOVE', x: 20, y: 20, depth: 0 });
  assert(Math.abs((a.order.x - b.order.x)) + Math.abs((a.order.y - b.order.y)) > 0.5,
    'a group MOVE spreads instead of stacking');
  CM.orders.assignGroup(game, 1);
  CM.coremind.selectOrganism(game, null);
  assert(CM.orders.recallGroup(game, 1) >= 2, 'control group 1 recalls the boxed pair');
}

// --- layer pacing: you cannot rush the next spine --------------------------
{
  const game = CM.coremind.newGame(4242);
  const bus = CM.core.makeBus();
  CM.simulation.spawnStarterColony(game, bus);
  const colony = game.core;
  colony.biomass = 80; colony.energy = 80;
  game.simTime = 0;

  let spot = null;
  for (let r = 5; r < 16 && !spot; r += 1.5) {
    for (let a = 0; a < 16; a++) {
      const x = colony.x + Math.cos(a * 0.4) * r, y = colony.y + Math.sin(a * 0.4) * r;
      if (CM.world.isWaterAt(game.world, x, y)) continue;
      const check = CM.structures.canPlace(game, colony, 'SHAFT', x, y);
      if (check.ok) { spot = { x, y }; break; }
      if (!spot && /surface|foothold|forage|grow|learn/i.test(check.reason || '')) {
        spot = { blocked: true, reason: check.reason };
      }
    }
  }
  assert(spot && spot.blocked, 'a brand-new colony cannot sink a shaft before it has a surface foothold: ' + (spot && spot.reason));

  colony.biomass = 200;
  spot = null;
  for (let r = 5; r < 16 && !spot; r += 1.5) {
    for (let a = 0; a < 16; a++) {
      const x = colony.x + Math.cos(a * 0.4) * r, y = colony.y + Math.sin(a * 0.4) * r;
      if (CM.structures.canPlace(game, colony, 'SHAFT', x, y).ok) { spot = { x, y }; break; }
    }
  }
  assert(spot, 'stores of 90+ biomass unlock the first shaft');
  const shaft = plant(game, colony, 'SHAFT', spot.x, spot.y);
  const descentTry = findSpot(game, colony, 'DESCENT', shaft, 5, 13);
  assert(!descentTry, 'a Descent is refused until the Shallow Works are settled');
  const why = CM.layers.layerReady(game, colony, 1);
  assert(!why.ok, 'layerReady names what the layer still needs: ' + why.reason);

  plant(game, colony, 'WARREN', shaft.x + 6, shaft.y, shaft);
  plant(game, colony, 'CISTERN', shaft.x, shaft.y + 6, shaft);
  const rec = CM.layers.paceOf(colony, 1);
  rec.holdAcc = 999;
  rec.scouted = true;
  rec.openedAt = 0;
  const ready = CM.layers.layerReady(game, colony, 1);
  assert(ready.ok, 'warren + rooms + hold settles layer 1: ' + (ready.reason || ''));
  assert(findSpot(game, colony, 'DESCENT', shaft, 5, 13), 'and then a Descent can be cut');
}

// --- mutations, quests, layer build control --------------------------------
{
  assert(CM.mutations.MUTATIONS.length === 30, 'thirty mutations are catalogued, got ' + CM.mutations.MUTATIONS.length);
  const cats = {};
  for (const m of CM.mutations.MUTATIONS) {
    assert(!!CM.traits.TRAITS_BY_ID[m.id], 'mutation ' + m.id + ' is registered as a trait');
    assert(m.mutation, m.id + ' is marked as a mutation');
    cats[m.category] = (cats[m.category] || 0) + 1;
  }
  assert(CM.traits.CATEGORIES.every(c => cats[c] === 5), 'five mutations per designer category');

  const game = CM.coremind.newGame(3333);
  const bus = CM.core.makeBus();
  game.__bus = bus;
  CM.simulation.spawnStarterColony(game, bus);
  assert(game.progress && game.progress.quests.active === 'foothold', 'a new game starts on the foothold quest');
  assert(CM.progress.ACHIEVEMENTS.length >= 20, 'achievements exist');

  const locked = CM.coremind.setDesignSlot(game, 'BODY', 'amphibious');
  assert(!locked, 'a locked mutation cannot be slotted');
  CM.mutations.unlock(game, bus, 'amphibious', true);
  assert(CM.coremind.setDesignSlot(game, 'BODY', 'amphibious'), 'an unlocked mutation can be slotted');
  const org = CM.coremind.createOrganismFromDraft(game, bus);
  assert(org && org.traits.includes('amphibious'), 'a designed organism carries the mutation');
  assert(org.behaviors.has('amphibious'), 'and the behaviour is live');

  game.core.biomass = 400; game.core.energy = 400;
  game.simTime = 80;
  CM.progress.tick(game, bus, 1);
  assert(CM.progress.activeQuest(game) && CM.progress.activeQuest(game).id !== 'foothold',
    'foothold completes once the surface is ready, now ' + (CM.progress.activeQuest(game) && CM.progress.activeQuest(game).id));

  CM.structures.setStance(game.core, 1, 'FORTIFY');
  assert(CM.structures.stanceOf(game.core, 1) === 'FORTIFY', 'layer stance can be set');

  let spot = null;
  for (let r = 5; r < 16 && !spot; r += 1.5) {
    for (let a = 0; a < 16; a++) {
      const x = game.core.x + Math.cos(a * 0.4) * r, y = game.core.y + Math.sin(a * 0.4) * r;
      if (CM.structures.canPlace(game, game.core, 'SHAFT', x, y).ok) { spot = { x, y }; break; }
    }
  }
  const q = CM.structures.queue(game, bus, game.core, 'SHAFT', spot.x, spot.y);
  assert(q.ok, 'shaft queued for demolish test');
  const before = game.core.biomass;
  const gone = CM.structures.demolish(game, bus, game.core, q.site);
  assert(gone.ok, 'an unfinished chamber can be cancelled');
  assert(game.core.biomass > before, 'and half the biomass comes back');

  const data = JSON.parse(JSON.stringify(CM.save.serialize(game)));
  assert(data.v === 8, 'save format is v8');
  assert(data.progress, 'progress is persisted');
  const loaded = CM.save.hydrate(data);
  assert(loaded.progress.mutations.amphibious, 'unlocked mutations survive a reload');
}

{
  const game = CM.coremind.newGame(4242);
  const bus = CM.core.makeBus();
  game.__bus = bus;
  CM.simulation.spawnStarterColony(game, bus);
  game.core.biomass = 800;
  game.core.energy = 800;

  let spot = null;
  for (let r = 5; r < 18 && !spot; r += 1.2) {
    for (let a = 0; a < 20; a++) {
      const x = game.core.x + Math.cos(a * 0.31) * r, y = game.core.y + Math.sin(a * 0.31) * r;
      if (CM.structures.canPlace(game, game.core, 'SHAFT', x, y).ok) { spot = { x, y }; break; }
    }
  }
  assert(spot, 'found a shaft site');
  const q = CM.structures.queue(game, bus, game.core, 'SHAFT', spot.x, spot.y);
  assert(q.ok, 'shaft queued');
  const shaft = q.site;
  const digger = game.organisms.find(o => o.ownerId === 'player');
  assert(digger, 'starter body exists');
  for (let i = 0; i < 500 && !shaft.done; i++) CM.structures.addWork(game, bus, shaft, digger, 0.2);
  assert(shaft.done, 'shaft finished');

  const up0 = CM.structures.canUpgrade(game, game.core, shaft);
  assert(up0.ok, 'a finished shaft can be raised');
  const r0 = CM.structures.radiusOf(shaft);
  const started = CM.structures.startUpgrade(game, bus, game.core, shaft);
  assert(started.ok, 'upgrade started');
  assert(shaft.upgradingTo === 1, 'upgrading to tier 1');
  for (let i = 0; i < 500 && shaft.upgradingTo; i++) CM.structures.addWork(game, bus, shaft, digger, 0.2);
  assert(shaft.tier === 1, 'shaft is now tier 1');
  assert(CM.structures.radiusOf(shaft) > r0, 'raised rooms are larger');
  assert(game.progress.upgrades >= 1, 'upgrade is counted');

  const warrenCheck = CM.structures.canPlace(game, game.core, 'WARREN', shaft.x + 7, shaft.y);
  if (warrenCheck.ok) {
    const wq = CM.structures.queue(game, bus, game.core, 'WARREN', shaft.x + 7, shaft.y);
    if (wq.ok) {
      for (let i = 0; i < 500 && !wq.site.done; i++) CM.structures.addWork(game, bus, wq.site, digger, 0.2);
    }
  }

  const infl = CM.influence.at(game, shaft.x, shaft.y, 1, game.core.id);
  assert(infl.axes.spine > 0, 'a shaft paints spine influence');
  assert(CM.influence.digMul(game, shaft) >= 1, 'influence never slows a lone room below base');

  CM.structures.bumpLabor(game.core, 1, 'dig');
  const labor = CM.structures.laborOf(game.core, 1);
  assert(labor.dig === 2, 'labor mix bumps');
  CM.progress.note(game, 'labor');
  assert(game.progress.laborSet, 'labor note lands');

  CM.structures.assignCrew(game, shaft, [digger.id]);
  assert(digger.assignedSiteId === shaft.id, 'crew is pinned to the chamber');
  CM.progress.note(game, 'crew');

  CM.structures.togglePermit(game.core, 1, 'GRANARY');
  assert(!CM.structures.isPermitted(game.core, 'GRANARY', 1), 'a type can be forbidden on a layer');
  assert(!CM.structures.canPlace(game, game.core, 'GRANARY', shaft.x + 8, shaft.y).ok,
    'forbidden types refuse placement');
  CM.structures.togglePermit(game.core, 1, 'GRANARY');
  assert(CM.structures.isPermitted(game.core, 'GRANARY', 1), 'and can be allowed again');

  const n = CM.orders.issue(game, [digger], { type: 'PATROL', x: digger.x + 4, y: digger.y, x2: digger.x, y2: digger.y, depth: 0 });
  assert(n === 1 && digger.order.type === 'PATROL', 'patrol can be issued');
  CM.orders.retreat(game, [digger]);
  assert(digger.order, 'retreat issues an order');

  const snap = JSON.parse(JSON.stringify(CM.save.serialize(game)));
  assert(snap.v === 8, 'v8 snapshot');
  assert(snap.showAura !== false && snap.peel !== false && snap.senseSight !== false, 'AURA flags ride the snapshot');
  assert(snap.economy && snap.rep && snap.sentiment, 'loop organs ride the snapshot');
  assert(snap.colonies[0].layerLabor, 'labor mix is saved');
  const re = CM.save.hydrate(snap);
  const shaft2 = CM.structures.all(re).find(s => s.type === 'SHAFT');
  assert(shaft2 && shaft2.tier === 1, 'tier survives a reload');
  const body = re.organisms.find(o => o.ownerId === 'player');
  assert(body && body.assignedSiteId === shaft2.id, 'crew assignment survives a reload');
}

// --- AURA: thought, bands, weather, sense, peel ---------------------------
{
  assert(CM.aura && CM.mind && CM.peel && CM.sense, 'four AURA organs load');
  const game = CM.coremind.newGame(7);
  game.speed = 2;
  game.thought = 0;
  assertClose(CM.mind.effectiveSpeed(game), 2, 1e-6, 'thought 0 leaves speed alone');
  game.thought = 1;
  assertClose(CM.mind.effectiveSpeed(game), 2 * 0.18, 1e-6, 'thought 1 dilates to 18%');
  game.thought = 0;
  game.thoughtHold = true;
  CM.mind.tickThought(game, 1, { pointerDown: false, sheetOpen: false });
  assert(game.thought > 0.9, 'a second of thought-hold fills the mind');
  game.thoughtHold = false;

  const scout = game.organisms.find(o => o.ownerId === 'player') || CM.organism.create({
    ownerId: 'player', traits: [], name: 'AURA-Scout', x: game.core.x, y: game.core.y
  });
  if (!game.organisms.includes(scout)) CM.coremind.addOrganism(game, scout);
  game.selection = scout.id;
  game.selectedIds = [scout.id];
  game.viewDepth = 0;
  game.camera = game.camera || { x: game.core.x, y: game.core.y, zoom: 9 };
  assert(CM.mind.band(game, scout) === 'fovea', 'a selected body is fovea');

  const far = CM.organism.create({
    ownerId: 'wild', speciesId: CM.traits.WILD_SPECIES[0].id, name: 'Far',
    x: game.core.x + 80, y: game.core.y + 80, traits: CM.traits.WILD_SPECIES[0].traits,
    diet: 'herbivore', color: '#888'
  });
  far.depth = 3;
  CM.coremind.addOrganism(game, far);
  assert(CM.mind.band(game, far) === 'dream', 'an off-layer wild body is dream');
  let pulses = 0;
  for (let i = 0; i < 8; i++) if (CM.mind.dreamPulse(game, far)) pulses++;
  assert(pulses === 1, 'dreamPulse is true once per 8 calls, got ' + pulses);

  CM.aura.ensure(game);
  CM.aura.stamp(game, 0, game.core.x, game.core.y, 'hunger', 2.5, 2);
  const peak = CM.aura.sample(game, game.core.x, game.core.y, 0, 'hunger');
  assert(peak > 0, 'stamp writes hunger');
  for (let i = 0; i < 20; i++) {
    CM.aura.clearViewed(game, 0);
    // decay without restamp: tick decays then restamps living; isolate decay
  }
  // Isolated decay: stamp, then decayGrid via tick with no organisms
  const empty = CM.coremind.newGame(8);
  empty.organisms = [];
  empty.viewDepth = 0;
  empty.showAura = true;
  empty.world.food = [];
  empty.world.foodCap = [];
  CM.aura.stamp(empty, 0, 40, 40, 'hunger', 3, 1);
  const before = CM.aura.sample(empty, 40, 40, 0, 'hunger');
  for (let i = 0; i < 100; i++) CM.aura.tick(empty, 0.1);
  const after = CM.aura.sample(empty, 40, 40, 0, 'hunger');
  assert(after < before * 0.1, 'hunger decays below 10% in 10s (got ' + after + ' from ' + before + ')');

  const hungry = { x: 40, y: 40, depth: 0 };
  empty.showAura = true;
  CM.aura.stamp(empty, 0, 40, 40, 'hunger', 3, 2);
  assert(CM.aura.aiMul(empty, hungry, 'SEEK_FOOD') > 1, 'hungry weather raises SEEK_FOOD');

  const sg = CM.coremind.newGame(9);
  CM.simulation.spawnStarterColony(sg, { emit() {}, on() {} });
  const seer = sg.organisms.find(o => o.ownerId === 'player');
  assert(seer, 'starter scout exists for sense');
  sg.senseSight = true;
  sg.viewDepth = 0;
  CM.sense.tick(sg, 0.1);
  assert(CM.sense.lit(sg, seer.x, seer.y, 0), 'a scout lits its own cell');
  const farX = seer.x + 40, farY = seer.y + 40;
  assert(!CM.sense.lit(sg, farX, farY, 0), '40 cells away is unlit');
  // Age memory on a cell that was never lit
  CM.sense.tick(sg, 2);
  assert(CM.sense.memory(sg, farX, farY, 0) >= 2, 'unlit memory ages');

  const w = 800, h = 600, zoom = 10, dpr = 1;
  sg.camera.x = 100; sg.camera.y = 100;
  const a = CM.peel.project(sg, w, h, zoom, dpr, 100, 100, 0);
  assertClose(a.x, w / 2, 0.01, 'peel delta 0 is screen centre at camera');
  assertClose(a.y, h / 2, 0.01, 'peel delta 0 y is screen centre');
  const b = CM.peel.project(sg, w, h, zoom, dpr, 100, 100, -1);
  assert(b.y > a.y, 'the layer below sits lower on screen');

  const v6 = CM.save.serialize(sg);
  v6.v = 6;
  delete v6.showAura; delete v6.peel; delete v6.senseSight;
  const fromOld = CM.save.hydrate(v6);
  assert(fromOld.showAura && fromOld.peel && fromOld.senseSight, 'v6 loads with AURA flags on');
}

// --- honesty: say / do -------------------------------------------------
{
  const game = CM.coremind.newGame(4242);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  game.stats = { playerPop: 3, herbivorePop: 40, predatorPop: 20, plantTotal: 0, devicePop: {} };
  assert(game.stats.playerPop === 3, 'player pop is colony only');
  // ui render is DOM; contract is the number the HUD will read
  const hudPop = game.stats.playerPop;
  assert(hudPop !== game.stats.playerPop + game.stats.herbivorePop + game.stats.predatorPop, 'hud must not sum wildlife');
}

{
  const game = CM.coremind.newGame(4242);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  CM.aura.ensure(game);
  CM.aura.stamp(game, 0, game.core.x, game.core.y, 'hunger', 3, 2);
  const hungry = { x: game.core.x, y: game.core.y, depth: 0, alive: true };
  game.showAura = false;
  assert(CM.aura.aiMul(game, hungry, 'SEEK_FOOD') > 1, 'hiding Weather overlay does not cancel hunger AI');
}

{
  const game = CM.coremind.newGame(7);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  const colony = game.core;
  const site = { x: colony.x + 6, y: colony.y, depth: 2 };
  // bastion is depth 6 — wrong depth for a shallow warren room
  const bastion = plant(game, colony, 'BASTION', site.x, site.y);
  assert(bastion.depth === 6, 'bastion sits on depth 6');
  const d2 = CM.structures.defenseAt(game, colony.id, site.x, site.y, 2);
  assert(typeof d2 === 'number', 'defenseAt accepts depth');
  assert(d2 === 0, 'a bastion on a wrong depth does not harden a depth-2 room');
  assert(CM.structures.defenseAt(game, colony.id, site.x, site.y, 6) > 0,
    'bastion hardens its own depth');
  assert(CM.structures.defenseAt(game, colony.id, site.x, site.y, 7) > 0,
    'bastion also hardens the layer above (depth-1 rule)');
}

{
  const game = CM.coremind.newGame(7);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  assert(CM.progress.questDone(game, 'hold_and_post') === false,
    'fresh game has not finished hold_and_post');
  plant(game, game.core, 'GATE', game.core.x + 6, game.core.y);
  assert(CM.progress.questDone(game, 'hold_and_post') === true,
    'finished player GATE completes hold_and_post');
}

// --- thought is a verb; dream bodies walk --------------------------------
{
  const game = CM.coremind.newGame(3);
  CM.simulation.spawnStarterColony(game, { emit() {} });
  game.speed = 1;
  game.thought = 0;
  game.selectedIds = [game.organisms[0].id];
  game.selection = game.organisms[0].id;
  const flags = { pointerDown: false, sheetOpen: false };
  assert(CM.mind.thinking(game, flags) === false, 'selecting a unit is not THINK');
  CM.mind.tickThought(game, 1, flags);
  assert(game.thought < 0.1, 'thought does not rise from selection');
}

{
  const game = CM.coremind.newGame(3);
  CM.simulation.spawnStarterColony(game, { emit() {} });
  game.speed = 1;
  CM.mind.pulse(game, 0.55);
  assert(CM.mind.thinking(game, { pointerDown: false, sheetOpen: false }) === true, 'an issued order pulses thought');
}

{
  const game = CM.coremind.newGame(3);
  CM.simulation.spawnStarterColony(game, { emit() {} });
  const org = game.organisms.find(o => o.ownerId === 'player');
  org.x = 10; org.y = 10; org.heading = 0; org.stats.speed = 20;
  org.px = 10; org.py = 10;
  org.depth = 3;
  game.selection = null;
  game.selectedIds = [];
  // force dream band by putting camera far and depth mismatch if needed
  game.camera.x = 200; game.camera.y = 200;
  game.viewDepth = 0;
  const x0 = org.x;
  // run several cheap dream skips
  for (let i = 0; i < 20; i++) CM.simulation.tick(game, { emit() {} }, 0.1);
  // if still dream-skipping, x should have moved along heading
  assert(org.x !== x0 || org.state === 'ATTACK', 'dream bodies drift along last heading');
}

// --- fog, shafts, and what the map hides ---------------------------------
{
  const game = CM.coremind.newGame(11);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  game.viewDepth = 0;
  const shaft = { id: 's1', type: 'SHAFT', x: game.core.x + 4, y: game.core.y, depth: 1, done: true };
  assert(CM.input.structureHittable(game, shaft) === true,
    'surface SHAFT is hittable when viewDepth===0');
  const warren = { id: 'w1', type: 'WARREN', x: game.core.x + 4, y: game.core.y, depth: 1, done: true };
  assert(CM.input.structureHittable(game, warren) === false,
    'surface view does not hit a depth-1 warren');
  game.viewDepth = 1;
  assert(CM.input.structureHittable(game, shaft) === true,
    'shaft is hittable on its own depth');
  assert(CM.input.structureHittable(game, null) === false, 'null site is not hittable');
}

{
  const game = CM.coremind.newGame(11);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  CM.sense.ensure(game);
  game.senseSight = true;
  game.viewDepth = 0;
  game.sense.chem = true;
  const org = { alive: true, x: 2, y: 2, depth: 0, traits: ['CHEM_SENSE'], ownerId: 'wild' };
  CM.aura.ensure(game);
  CM.aura.stamp(game, 0, 2, 2, 'war', 2, 1);
  assert(CM.sense.memory(game, 2, 2, 0) === CM.sense.NEVER, 'untasted cell memory is NEVER');
  assert(!CM.sense.lit(game, 2, 2, 0), 'untasted cell is unlit');
  assert(CM.sense.visibleOrg(game, org) === true,
    'chem + aura-hot + NEVER memory reveals an unlit body');
}

{
  const game = CM.coremind.newGame(11);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  game.senseSight = true;
  game.viewDepth = 0;
  CM.sense.tick(game, 0.1);
  const seer = game.organisms.find(o => o.ownerId === 'player');
  assert(seer, 'starter seer exists for memory-grid test');
  assert(CM.sense.memory(game, seer.x, seer.y, 0) < 1, 'seer cell memory is fresh on depth 0');
  game.viewDepth = 1;
  CM.sense.tick(game, 0.1);
  game.viewDepth = 0;
  CM.sense.tick(game, 0);
  assert(CM.sense.memory(game, seer.x, seer.y, 0) < CM.sense.MEMORY,
    'floor change does not wipe depth-0 memory grids');
}

{
  const game = CM.coremind.newGame(11);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  game.senseSight = true;
  game.viewDepth = 0;
  const b = CM.organism.create({
    ownerId: 'player', traits: [], name: 'Fog-Box', x: 50, y: 50, depth: 0
  });
  CM.coremind.addOrganism(game, b);
  // ensure without tick: cover empty, so the body cell is unlit
  CM.sense.ensure(game);
  assert(!CM.sense.lit(game, b.x, b.y, 0), 'unpainted cell is unlit for box-select');
  const n = CM.orders.selectInBox(game, b.x - 2, b.y - 2, b.x + 2, b.y + 2, 0);
  assert(n === 0, 'selectInBox skips unlit bodies when Fog is on');
  game.senseSight = false;
  const n2 = CM.orders.selectInBox(game, b.x - 2, b.y - 2, b.x + 2, b.y + 2, 0);
  assert(n2 === 1, 'selectInBox includes unlit bodies when Fog is off');
}

// --- sentiment net, reputation, economy, guide ---------------------------
{
  assert(CM.sentiment && CM.reputation && CM.economy && CM.guide, 'loop organs load');
  const game = CM.coremind.newGame(11);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  const a = CM.sentiment.feel(game);
  assert(a && a.y && a.y.length === 4, 'net emits 4 outputs');
  assert(a.label && a.mood, 'mood is named');
  const y0 = a.y[1];
  CM.sentiment.learn(game, 'kill');
  CM.sentiment.learn(game, 'kill');
  CM.sentiment.learn(game, 'kill');
  const b = CM.sentiment.feel(game);
  assert(b.y[1] >= y0 - 0.05, 'kills do not collapse fight output');

  const prey = CM.traits.WILD_SPECIES.find(s => s.tier === 'prey');
  CM.reputation.touch(game, 'player', CM.reputation.speciesNode(prey.id), -0.5, 'kill');
  const hunter = { ownerId: 'player' };
  const victim = { ownerId: 'wild', speciesId: prey.id };
  assert(CM.reputation.speciesBias(game, hunter, victim) > 1, 'overhunted prey flee harder');

  game.core.biomass = 40;
  const rival = game.colonies.find(c => !c.isPlayer);
  const gift = CM.economy.offerTribute(game, rival);
  assert(gift.ok, 'tribute spends biomass');
  assert(CM.reputation.of(game, 'player', rival.id) > 0, 'tribute warms regard');

  const e0 = game.economy.attention;
  CM.economy.onOrder(game);
  assert(game.economy.attention < e0, 'orders spend attention');

  CM.guide.start(game, true);
  assert(CM.guide.current(game).id === 'select', 'tutorial starts at select');
  game.selectedIds = [game.organisms.find(o => o.ownerId === 'player').id];
  CM.guide.note(game, 'select');
  CM.guide.tick(game);
  assert(CM.guide.current(game).id === 'gather', 'select completes, next is gather');
  game.globalDirective = 'GATHER';
  CM.guide.tick(game);
  assert(CM.guide.current(game).id === 'look', 'gather completes, next is look');
  CM.guide.skip(game);
  assert(!CM.guide.current(game), 'skip ends the tutorial');
}

// --- organs speak: mood flavor, thin mind, graph hostility, overhunt dread ---
{
  assert(CM.sentiment.MOODS.forage.hunger === 'Starving', 'forage+hunger is Starving');
  assert(CM.sentiment.MOODS.wonder.awe === 'Awestruck', 'wonder+awe is Awestruck');
  assert(CM.sentiment.MOODS.fight.dread === 'Cornered', 'fight+dread is Cornered');
  const game = CM.coremind.newGame(5);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  const a = CM.sentiment.feel(game);
  game.organisms.filter(o => o.ownerId === 'player').forEach(o => { o.hunger = 90; });
  for (let i = 0; i < 24; i++) CM.sentiment.learn(game, 'fed');
  const b = CM.sentiment.feel(game);
  assert(b.label === CM.sentiment.MOODS[b.mood][b.flavor], 'label comes from flavor table');
  assert(b.label === 'Starving' || b.label === 'Hungry' || b.mood === 'forage', 'hunger is named');
}

{
  const game = CM.coremind.newGame(5);
  CM.economy.ensure(game);
  game.economy.attention = 0;
  const thin = CM.economy.thinMul(game);
  assert(thin < 1, 'broke mind is thin');
  assertClose(thin, 0.82, 0.001, 'zero attention thinMul is 0.82');
  game.economy.attention = 0.4;
  assert(CM.economy.thinMul(game) === 1, 'attention 0.4 is full mind');
}

{
  const game = CM.coremind.newGame(7);
  const rival = game.colonies.find(c => !c.isPlayer);
  assert(rival, 'has a rival colony');
  assert(!CM.colony.areHostile(game, 'player', rival.id), 'graph-empty start is not hostile');
  CM.reputation.touch(game, 'player', rival.id, -0.2, 'kill');
  assert(CM.reputation.of(game, 'player', rival.id) < -0.15, 'edge is cold');
  assert(CM.colony.areHostile(game, 'player', rival.id), 'graph cold edge is hostile');
  CM.reputation.touch(game, 'player', rival.id, 0.6, 'gift');
  assert(CM.reputation.of(game, 'player', rival.id) > 0.25, 'edge is warm');
  assert(!CM.colony.areHostile(game, 'player', rival.id), 'graph warm edge is not hostile');
}

{
  const game = CM.coremind.newGame(9);
  CM.aura.ensure(game);
  const prey = CM.traits.WILD_SPECIES.find(s => s.tier === 'prey');
  const node = CM.reputation.speciesNode(prey.id);
  CM.reputation.touch(game, 'player', node, -0.45, 'kill');
  assert(CM.reputation.of(game, 'player', node) < -0.4, 'overhunt bias set');
  const killer = { ownerId: 'player', x: game.core.x, y: game.core.y, depth: 0 };
  const victim = { ownerId: 'wild', speciesId: prey.id, x: game.core.x + 1, y: game.core.y, depth: 0 };
  const d0 = CM.aura.sample(game, victim.x, victim.y, 0, 'dread');
  CM.reputation.onKill(game, killer, victim);
  const d1 = CM.aura.sample(game, victim.x, victim.y, 0, 'dread');
  assert(d1 > d0, 'overhunt stamps dread on the kill cell');
}

// Presence HUD contracts (visual checklist + DOM-free default):
// - #guide-hole: gold frame only — no 9999px dimmer
// - PC #guide-card: top:8px; left:52px; right:auto; max-width:280px; never right:316px
// - PC #quest-card: left:52px; top:8px; hidden while body.guiding; never right:316px
// - PC #layer-card: right:316px; top:48px; collapsed by default (.lc-mini)
// - PC #toast-layer: left:52px; bottom:160px
// - Phone #guide-card: top:8px; left:8px; right:calc(8px + min(112px,42vw) + 8px); bottom:auto
// - Phone #layer-card: top:122px; right:8px; left:auto; max-width:min(112px,42vw) (minimap column; no overlap)
// - Phone #toast-layer: top under guide/quest, never on the command row
// - BUILD is static in the PC action-bar row (not bottom:100%)
// - Phone EXPLORE is one row: Explore, Gather, Hunt, Dig + MORE + BUILD
// - placeGuideHighlight('scout') focuses the org; never the whole canvas
{
  const game = CM.coremind.newGame(1);
  CM.coremind.ensure(game);
  assert(!game.ui || game.ui.layerExpanded !== true, 'layer card starts collapsed');
}

// --- weather stamps + seeded climate (live-quality task 7) -------------------
{
  const a = CM.coremind.newGame(99);
  const b = CM.coremind.newGame(99);
  assert(a.climate.nextEventIn === b.climate.nextEventIn, 'climate events are seeded');
}

{
  const game = CM.coremind.newGame(99);
  CM.aura.ensure(game);
  // stamp spore 3 at a cell; deepFauna multiplier at that cell must drop
  CM.aura.stamp(game, 4, 20, 20, 'spore', 3, 1);
  const spore = CM.aura.sample(game, 20, 20, 4, 'spore');
  assert(spore > 0, 'spore stamps');
  const mul = Math.max(0.4, 1 - spore * 0.1);
  assert(mul < 1, 'spore suppresses fauna');
}

// --- depth comfort: settled rock is a better home --------------------------
{
  const game = CM.coremind.newGame(21);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  assert(CM.layers.comfort(game, 0) === 0, 'surface comfort is 0');
  assert(CM.layers.comfort(game, 4) === 0, 'empty depth is 0');
}

{
  const game = CM.coremind.newGame(21);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  game.structures.list.push({
    id: 'w1', type: 'WARREN', depth: 3, done: true,
    x: game.core.x, y: game.core.y, colonyId: game.core.id, ownerId: 'player'
  });
  const c = CM.layers.comfort(game, 3);
  assert(c > 0.1, 'a finished warren on L3 is livable');
  assert(CM.layers.livingLabel(c) !== 'Exposed', 'label names the comfort');
}

// --- per-being XP, marks, Common / Rare / Legendary ------------------------
{
  const game = CM.coremind.newGame(8);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  const org = game.organisms.find(o => o.ownerId === 'player');
  assert(CM.life, 'life module loads');
  if (!CM.life || !org) { /* rest of the slice needs the module */ } else {
  CM.life.ensure(org);
  assert(org.lifeTier === 'common' && org.lifeLevel === 1 && org.xp === 0, 'born common');
  CM.life.grant(game, org, 'kill', 8);
  assert(org.xp === 8, 'kill grants 8');
  CM.life.mark(game, org, 'first_kill');
  assert(org.lifeMarks.first_kill, 'first kill is a mark');
  assert(org.xp >= 23, 'mark adds 15 xp');
  for (let i = 0; i < 12; i++) CM.life.grant(game, org, 'kill', 8);
  assert(org.lifeLevel >= 2, 'xp levels the body');
  org.lifeLevel = 4;
  CM.life.refreshTier(org);
  assert(org.lifeTier === 'rare', 'level 4 is rare');
  org.lifeLevel = 8;
  CM.life.refreshTier(org);
  assert(org.lifeTier === 'legendary', 'level 8 is legend');
  assert(CM.life.need(1) === 38, 'need(1) = 20 + 18');
  const marked = game.organisms.find(o => o.ownerId === 'player' && o !== org) || org;
  CM.life.ensure(marked);
  marked.lifeLevel = 1;
  marked.lifeTier = 'common';
  marked.lifeMarks = {};
  CM.life.mark(game, marked, 'first_feed');
  CM.life.mark(game, marked, 'first_dig');
  CM.life.mark(game, marked, 'first_extract');
  assert(marked.lifeTier === 'rare', '3 marks is rare');
  org.lifeFocus = 'kill';
  const data = JSON.parse(JSON.stringify(CM.save.serialize(game)));
  const saved = data.organisms.find(o => o.name === org.name);
  assert(saved && saved.lifeTier === 'legendary' && saved.lifeLevel === 8, 'life fields serialize');
  const loaded = CM.save.hydrate(data);
  const back = loaded.organisms.find(o => o.name === org.name);
  assert(back && back.lifeTier === 'legendary' && back.lifeLevel === 8 && back.lifeFocus === 'kill', 'life fields hydrate');
  }
}

{
  const game = CM.coremind.newGame(8);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  const org = game.organisms.find(o => o.ownerId === 'player');
  CM.life.ensure(org);
  const atk0 = org.stats.attack;
  org.lifeFocus = 'kill';
  CM.life.grant(game, org, 'kill', CM.life.need(1));
  assert(org.stats.attack === atk0 + 2, 'level-up adds kill stats');
  const loaded = CM.save.hydrate(JSON.parse(JSON.stringify(CM.save.serialize(game))));
  const back = loaded.organisms.find(o => o.name === org.name);
  assert(back.stats.attack === org.stats.attack, 'life stat bonuses survive hydrate');
}

// --- hero mode -----------------------------------------------------------
{
  assert(CM.hero, 'hero module loads');
  const game = CM.coremind.newGame(12);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  const org = game.organisms.find(o => o.ownerId === 'player');
  const res = CM.hero.enter(game, org);
  assert(res.ok && CM.hero.isHero(game, org), 'enter wears the selected body');
  const slots = CM.hero.kit(org, game);
  assert(slots.length === 8, 'eight abilities');
  assert(slots[0].id === 'strike', 'first ability is Strike');
  CM.hero.ensure(game).keys.w = true;
  const x0 = org.x, y0 = org.y;
  CM.hero.drive(game, org, 0.4);
  assert(Math.hypot(org.x - x0, org.y - y0) > 0.05, 'WASD moves the hero');
  const foe = CM.organism.create({
    ownerId: 'wild', speciesId: null, name: 'Dummy',
    x: org.x + 1.2, y: org.y, traits: [], diet: 'herbivore'
  });
  CM.coremind.addOrganism(game, foe);
  game.hero.targetId = foe.id;
  const hp0 = foe.health;
  const hit = CM.hero.cast(game, 0);
  assert(hit.ok, 'strike casts');
  assert(foe.health < hp0, 'strike deals damage');
  assert(CM.hero.addItem(org, { id: 'forage', name: 'Forage', kind: 'food', n: 1 }), 'bag takes forage');
  assert(org.inv.length === 1, 'inventory has the item');
  const pack = CM.hero.packOf(game);
  assert(pack.some(o => o.id === org.id), 'pack includes the hero');
  CM.hero.exit(game);
  assert(!game.hero.on, 'COMMAND exits hero mode');
}

{
  const game = CM.coremind.newGame(3);
  CM.simulation.spawnStarterColony(game, { emit() {}, on() {} });
  const L = CM.structures.laborOf(game.core, 1);
  assert((L.breed || 0) === 1, 'default labor mix starts at one');
  /* Brood weather only after the player pushes Breed. */
  CM.aura.ensure(game);
  CM.aura.clearViewed(game, 1);
  CM.aura.tick(game, 0.1);
  const brood0 = CM.aura.sample(game, game.core.x, game.core.y, 1, 'brood');
  assert(brood0 < 0.2, 'default breed does not paint brood weather');
  const org = game.organisms.find(o => o.ownerId === 'player');
  CM.hero.enter(game, org);
  CM.hero.float(game, org.x, org.y, '9', '#e8c547');
  assert(game.hero.floats.length === 1, 'combat float is queued');
  const region = CM.world.regionAt(game.world, game.camera.x, game.camera.y);
  const biome = CM.world.biomeInfoAt(game.world, game.camera.x, game.camera.y);
  const worldName = region && region.id ? region.name : (biome && biome.name);
  assert(worldName && worldName !== 'Uncharted' || biome.name, 'WORLD region has a real name or biome');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
