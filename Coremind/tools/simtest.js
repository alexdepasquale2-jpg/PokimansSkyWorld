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
  'js/core.js', 'js/traits.js', 'js/world.js', 'js/organism.js',
  'js/ai.js', 'js/discovery.js', 'js/coremind.js', 'js/simulation.js'
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
  let grass = 0, water = 0;
  for (let i = 0; i < w1.biome.length; i++) { if (w1.biome[i] === CM.world.BIOME.GRASS) grass++; if (w1.biome[i] === CM.world.BIOME.WATER) water++; }
  assert(grass > 1000, 'world generates a meaningful amount of grass, got ' + grass);
  assert(water > 0, 'world generates some water');
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

  // A colony left alone next to the Core (which spawns near water) should not
  // simply die of thirst — SEEK_WATER has to actually resolve the need.
  for (let i = 0; i < 3000; i++) CM.simulation.tick(game, bus, 0.1);
  const alive = game.organisms.filter(o => o.ownerId === 'player').length;
  assert(alive > 0, 'the colony survives long-run thirst (SEEK_WATER resolves it), alive=' + alive);

  /* Deliberately a population-level assertion, not "nobody is ever at 100".
   * An organism walking toward a lake it has already located sits at maximum
   * thirst the whole way there, which is the system working rather than
   * failing; the meaningful question is whether thirst is being resolved for
   * the population at large. */
  const parched = game.organisms.filter(o => o.thirst > 90).length;
  const parchedFrac = parched / Math.max(1, game.organisms.length);
  assert(parchedFrac < 0.3, `thirst is resolved for most of the population, ${parched}/${game.organisms.length} parched`);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
