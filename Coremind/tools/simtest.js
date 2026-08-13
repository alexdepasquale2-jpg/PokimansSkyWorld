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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
