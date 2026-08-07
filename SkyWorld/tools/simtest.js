/* Headless balance harness.
 *
 *   node tools/simtest.js [days] [strategy]
 *
 * Loads the game's own modules (everything except main.js, which needs a DOM)
 * and runs the simulation with a scripted player, so pacing changes can be
 * checked without playing for an hour. Strategies:
 *   idle    — nobody touches anything
 *   hand    — the player farms by hand and never trains the creature
 *   trainer — the player praises useful acts, strikes vices, and farms
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { window: {}, console, Math, Date, JSON, parseInt, isNaN };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['core.js', 'content.js', 'state.js', 'farm.js', 'creature.js', 'sim.js', 'render.js', 'ui.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
}
const SW = sandbox.window.SW;
// The UI logger is DOM-free but noisy; keep the ring buffer, drop the rest.
SW.ui = { log: (g, t, tone) => { g.log.unshift({ day: g.day, text: t, tone }); if (g.log.length > 60) g.log.length = 60; } };

const days = parseInt(process.argv[2] || '40', 10);
const strategy = process.argv[3] || 'trainer';
const C = SW.content, F = SW.farm, S = SW.sim, Cr = SW.creature;

const g = SW.state.newGame('mossback', 'Pim', 'Tester');
if (strategy === 'trainer') g.creature.leash = 'learning';

function playerTurn() {
  if (strategy === 'idle') return;
  // Judge the creature whenever it is waiting to be judged.
  if (strategy === 'trainer' && g.creature.pending) {
    C.ACTS[g.creature.pending.act].useful ? Cr.praise(g) : Cr.scold(g);
  }
  // Work the field, cheapest useful action first.
  for (let n = 0; n < 4 && g.res.focus > 3; n++) {
    const ripe = F.ripePlots(g)[0];
    if (ripe) { S.playerHarvest(g, ripe); continue; }
    const dry = F.thirstiest(g);
    if (dry && dry.water < 40) { S.playerWater(g, dry); continue; }
    const tilled = F.tilledPlots(g)[0];
    const seed = F.bestSeed(g);
    if (tilled && seed) { S.playerSow(g, tilled, seed.id); continue; }
    const raw = F.rawPlots(g)[0];
    if (raw) { S.playerTill(g, raw); continue; }
    if (g.res.wood < 30) { S.playerForage(g); continue; }
    break;
  }
  // Buy timber up to whatever the next structure needs — wood, not coin, is
  // what actually gates building.
  const nextShrine = C.SHRINE_TIERS[g.shrine + 1];
  const woodWant = Math.max(S.plotCost(g).wood, S.hutCost(g).wood, nextShrine ? nextShrine.wood : 0) + 20;
  if (g.res.wood < woodWant && g.res.coin > woodWant * F.WOOD_PRICE * 2) F.buyWood(g, woodWant - g.res.wood);
  // Sell down to a buffer — but hoard for the Harvest Fair when one is close.
  const hoarding = C.FESTIVALS[g.festival.index % C.FESTIVALS.length].id === 'harvest'
    && g.festival.nextDay - g.day <= 2;
  if (!hoarding) for (const cr of C.CROP_LIST) {
    const held = g.stock[cr.id] | 0;
    if (held > 4) F.sell(g, cr.id, held - 4);
  }
  if (g.village.food < 40) for (const cr of C.CROP_LIST) if ((g.stock[cr.id] | 0) > 1) { F.mill(g, cr.id, 1); break; }
  // Keep the beast fat: size is a stat, and a hungry creature raids the field.
  if (g.creature.hunger < 85) for (const cr of C.CROP_LIST) if ((g.stock[cr.id] | 0) > 2) { Cr.feed(g, cr.id); break; }
  const want = C.CROP_LIST.filter(c => S.rankOf(g).id >= c.rank).pop();
  if (want && (g.seeds[want.id] | 0) < 4) F.buySeed(g, want.id, 4);
  // Spend prayer and coin on the obvious upgrades. The shrine comes first:
  // grandeur multiplies every point of devotion the village produces.
  if (g.res.prayer > 40) S.castMiracle(g, 'rain');
  const sh = C.SHRINE_TIERS[g.shrine + 1];
  const reachable = sh && S.rankOf(g).id >= sh.rank;
  if (reachable && g.res.wood >= sh.wood && g.res.coin >= sh.coin) S.upgradeShrine(g);
  // Everything else is bought out of the surplus over the next shrine tier —
  // grandeur multiplies every point of devotion, so it is never worth
  // spending the shrine fund on anything smaller.
  const surplus = g.res.coin - (reachable ? sh.coin : 0);
  const hc = S.hutCost(g);
  if (g.village.huts <= g.village.villagers + 1 && surplus > hc.coin * 1.5 && g.res.wood > hc.wood) S.buildHut(g);
  const pc = S.plotCost(g);
  if (g.lockedPlots.length && surplus > pc.coin * 2 && g.res.wood > pc.wood) S.clearPlot(g);
}

const marks = [];
for (let t = 0; t < days * C.TICKS_PER_DAY; t++) {
  SW.sim.tick(g, 1);
  playerTurn();
  if (t % (C.TICKS_PER_DAY * 5) === 0) {
    marks.push({
      day: g.day,
      renown: Math.round(g.res.renown),
      place: g.lastStanding,
      coin: Math.round(g.res.coin),
      plots: g.plots.length,
      faith: Math.round(g.village.faith),
      water: +Cr.mastery(g, 'water').toFixed(2),
      harvest: +Cr.mastery(g, 'harvest').toFixed(2),
      graze: +Cr.mastery(g, 'graze').toFixed(2),
      kind: Math.round(g.creature.kind),
      size: +g.creature.size.toFixed(2),
      // festival competitiveness: your score over what a strong rival fields
      fest: C.FESTIVALS.map(f => (S.festivalScore(g, f) / f.par(g.day)).toFixed(1)).join('/')
    });
  }
}

console.log(`strategy=${strategy}  days=${days}\n`);
console.table(marks);
console.log('\nfinal:', {
  rank: S.rankOf(g).name,
  renown: Math.round(g.res.renown),
  place: g.lastStanding + '/' + (g.rivals.length + 1),
  harvests: g.stats.harvests,
  feats: Object.keys(g.feats).length + '/' + C.FEATS.length,
  festivalWins: g.stats.festivalWins,
  villagers: g.village.villagers,
  faith: Math.round(g.village.faith),
  awe: Math.round(g.village.awe),
  unrest: Math.round(g.village.unrest),
  plots: g.plots.length,
  coinEarned: g.stats.coinEarned,
  shrine: g.shrine,
  creature: Cr.describe(g)
});
console.log('top of register:', S.standings(g).slice(0, 4).map(r => `${r.place}. ${r.name} ${Math.round(r.renown)}`).join('  |  '));
