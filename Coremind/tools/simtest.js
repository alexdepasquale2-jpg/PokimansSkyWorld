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
  'js/core.js', 'js/traits.js', 'js/flora.js', 'js/world.js', 'js/organism.js',
  'js/ai.js', 'js/discovery.js', 'js/climate.js', 'js/colony.js',
  'js/coremind.js', 'js/simulation.js'
];

const sandbox = { console, Math, Set, Map, Object, JSON, Infinity, NaN, Date };
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
  for (let i = 0; i < 5000; i++) CM.simulation.tick(game, bus, 0.1);

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
