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
const FILES = ['core.js', 'content.js', 'content2.js', 'state.js', 'farm.js', 'creature.js',
  'lineage.js', 'discovery.js', 'minigames.js', 'boost.js', 'world.js', 'beast.js',
  'relics.js', 'trade.js', 'minigames2.js', 'prestige.js', 'sim.js', 'render.js', 'ui.js'];
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
}
const SW = sandbox.window.SW;
// The UI logger is DOM-free but noisy; keep the ring buffer, drop the rest.
SW.ui = { log: (g, t, tone) => { g.log.unshift({ day: g.day, text: t, tone }); if (g.log.length > 60) g.log.length = 60; } };

const days = parseInt(process.argv[2] || '40', 10);
const strategy = process.argv[3] || 'trainer';
const C = SW.content, C2 = SW.content2, F = SW.farm, S = SW.sim, Cr = SW.creature;

const g = SW.state.startGame('mossback', 'Pim', 'Tester');
const Ln = SW.lineage, Dis = SW.discovery, Mg = SW.minigames;
const W = SW.world, B = SW.beast, R = SW.relics, T = SW.trade, M2 = SW.mini2;
if (strategy === 'trainer') g.creature.leash = 'learning';

function playerTurn() {
  if (strategy === 'idle') return;
  // Judge the creature whenever it is waiting to be judged.
  if (strategy === 'trainer' && g.creature.pending) {
    C.ACTS[g.creature.pending.act].useful ? Cr.praise(g) : Cr.scold(g);
  }
  // Work the field, cheapest useful action first — but keep a reserve so the
  // mini-games actually get played rather than being starved by chores.
  const reserveFocus = M2.fishingUnlocked(g) ? 10 : 0;
  for (let n = 0; n < 4 && g.res.focus > 3 + reserveFocus; n++) {
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
  if (!M2.busy(g) && Mg.listenReady(g) && g.res.focus > Mg.LISTEN_FOCUS + 10) Mg.startListen(g);

  // Walk over to anything still unexamined — Insight has no other source.
  for (const inst of g.features) {
    if (!inst.found && g.res.focus > Dis.examineCost(g) + 6) { Dis.examine(g, inst); break; }
  }
  // Grow the cheapest neuron currently available — but hold back the Insight a
  // terrace needs, since terraces gate the shrine and the shrine is the engine.
  const ringNeed = Dis.ringCost(g);
  const shrineNext = C.SHRINE_TIERS[g.shrine + 1];
  const blockedOnGround = shrineNext && (shrineNext.ring || 0) > g.ring;
  const reserve = ringNeed && blockedOnGround ? ringNeed.insight : 0;
  const openNeurons = C.NEURONS.filter(n => !g.neurons[n.id] && Dis.neuronAvailable(g, n)).sort((a, b) => a.cost - b.cost);
  if (openNeurons.length && g.insight - reserve >= openNeurons[0].cost) Dis.buyNeuron(g, openNeurons[0].id);

  // Breed once the animal is grown and well bonded, so the drilled behaviour
  // carries rather than dying with it.
  if (Ln.canBreed(g) && g.creature.age > 26 && Ln.ingrainedCount(g, 0.55) >= 2) Ln.breed(g, false);

  // Work the bench whenever there is something to combine.
  if (Mg.benchUnlocked(g) && g.res.focus > Mg.CRAFT_FOCUS + 8) {
    const mats = C.MATERIAL_LIST.filter(m => (g.mats[m.id] | 0) > 0);
    if (g.res.coin > 8000) for (const m of C.MATERIAL_LIST) if (m.buy && (g.mats[m.id] | 0) < 3) Mg.buyMaterial(g, m.id, 3);
    // prefer an unknown pairing, else the most valuable known one
    let best = null;
    for (let i = 0; i < mats.length; i++) for (let j = i; j < mats.length; j++) {
      const a = mats[i].id, b = mats[j].id;
      const need = a === b ? 2 : 1;
      if ((g.mats[a] | 0) < need || (g.mats[b] | 0) < 1) continue;
      const key = Mg.pairKey(a, b);
      if (g.deadEnds[key]) continue;
      const r = Mg.recipeFor(a, b);
      const score = !r ? 1e9 : (g.recipes[r.id] ? Mg.craftValue(g, r) : 1e8);
      if (!best || score > best.score) best = { a, b, score };
    }
    if (best) Mg.combine(g, best.a, best.b);
  }

  // --- second-layer systems -------------------------------------------
  // Answer whatever the island has put in front of you.
  if (g.event) W.resolveEvent(g, Math.floor(Math.random() * W.eventDef(g).choices.length));
  if (g.mateOffer) (Math.random() < 0.7 ? B.acceptMate : B.refuseMate)(g);
  if (g.creature.ailment) B.cure(g);

  // Put people to work; the roster is only useful if it is assigned.
  for (const p of g.people) {
    if (p.role !== 'idle') continue;
    const want = ['farmhand', 'acolyte', 'mason', 'herbalist', 'trader', 'scout'];
    W.assign(g, p.name, want[g.people.indexOf(p) % want.length]);
  }

  // Keep the soil alive — dead ground quietly halves every harvest.
  const poor = g.plots.filter(p => W.soilOf(p) < 55).sort((a, b) => W.soilOf(a) - W.soilOf(b))[0];
  if (poor && g.village.food > 120) W.fertilise(g, poor, 'compost');

  // Buildings, cheapest useful first.
  for (const b of C2.BUILDING_LIST) {
    if (W.canBuild(g, b.id)) continue;
    const bc = W.buildingCost(g, b.id);
    let okMats = true;
    for (const k in bc.mats) if ((g.mats[k] | 0) < bc.mats[k]) okMats = false;
    if (okMats && g.res.coin > bc.coin * 2.2 && g.res.wood > bc.wood * 1.4) { W.build(g, b.id); break; }
  }

  // Relics and techniques are free power once you have them.
  for (const r of R.owned(g)) if ((g.equipped || []).length < R.slots(g) && !R.isEquipped(g, r.id)) R.equip(g, r.id);
  for (const tid in C2.TECHNIQUES) {
    if (B.techKnown(g, tid) && (g.equippedTech || []).length < B.techSlots(g)
        && !(g.equippedTech || []).includes(tid)) B.equipTech(g, tid);
  }
  const bestTitle = C2.TITLES.filter(x => { try { return x.need(g) && x.bonus; } catch (e) { return false; } }).pop();
  if (bestTitle && g.title !== bestTitle.id) R.setTitle(g, bestTitle.id);

  // Caravans: fill the contract, buy what cannot be bought elsewhere.
  if (g.caravan) {
    if (g.caravan.contract) T.deliverContract(g);
    for (const mat of ['metal', 'glass']) if ((g.caravan.stock[mat] | 0) > 0 && g.res.coin > 6000) T.buyFromCaravan(g, mat, 2);
  }

  // Fishing and chanting, when there is focus and prayer to spare.
  if (!M2.busy(g) && !g.listen) {
    // Alternate, or chanting crowds fishing out entirely.
    const preferFish = (g.stats.fished || 0) <= (g.stats.chants || 0);
    if (preferFish && M2.fishingUnlocked(g) && g.res.focus > M2.CAST_FOCUS && Math.random() < 0.3) M2.startFishing(g);
    else if (M2.chantUnlocked(g) && g.res.prayer > 110 && Math.random() < 0.2) {
      const ch = C2.CHANTS.filter(c => (g.ring | 0) >= c.ring && g.res.prayer >= c.prayer).pop();
      if (ch) M2.startChant(g, ch.id);
    }
  }
  for (const id in g.fish) if ((g.fish[id] | 0) > 2) M2.sellFish(g, id, (g.fish[id] | 0) - 1);

  // The ring, and the other gods.
  if (SW.boost.buildingTier(g, 'arena') && g.creature.vigor > 65 && Math.random() < 0.02) {
    B.fight(g, Math.floor(Math.random() * g.rivals.length));
  }
  if (g.res.coin > 40000 && Math.random() < 0.01) {
    const r = g.rivals[Math.floor(Math.random() * g.rivals.length)];
    T.diplomacy(g, r.name, 'gift');
  }

  // Spend prayer and coin on the obvious upgrades. The shrine comes first:
  // grandeur multiplies every point of devotion the village produces.
  const savingPrayer = M2.chantUnlocked(g);
  if (g.res.prayer > (savingPrayer ? 220 : 40)) S.castMiracle(g, 'rain');
  const sh = C.SHRINE_TIERS[g.shrine + 1];
  const reachable = sh && S.rankOf(g).id >= sh.rank && (sh.ring || 0) <= g.ring;
  if (reachable && g.res.wood >= sh.wood && g.res.coin >= sh.coin) S.upgradeShrine(g);
  // Everything else is bought out of the surplus over the next shrine tier —
  // grandeur multiplies every point of devotion, so it is never worth
  // spending the shrine fund on anything smaller.
  const surplus = g.res.coin - (reachable ? sh.coin : 0);
  const hc = S.hutCost(g);
  if (g.village.huts <= g.village.villagers + 1 && surplus > hc.coin * 1.5 && g.res.wood > hc.wood) S.buildHut(g);
  const pc = S.plotCost(g);
  if (g.lockedPlots.length && surplus > pc.coin * 2 && g.res.wood > pc.wood) S.clearPlot(g);
  // Build the island outward once the current terrace is genuinely full.
  // Raise the terrace when the current one is full, or when the next shrine
  // tier is waiting on ground that does not exist yet.
  const rc = Dis.ringCost(g);
  const shrineWantsGround = sh && (sh.ring || 0) > g.ring && S.rankOf(g).id >= sh.rank;
  const terraceFull = !g.lockedPlots.length && g.village.huts >= Dis.hutCap(g) - 1;
  // More ground is almost always the right buy: it raises the villager cap,
  // which multiplies everything the shrine does.
  if (rc && (terraceFull || shrineWantsGround || g.village.huts >= Dis.hutCap(g) - 3)
      && g.res.coin > rc.coin * 1.15 && g.res.wood > rc.wood && g.insight >= rc.insight) Dis.raiseRing(g);
}

const marks = [];
for (let t = 0; t < days * C.TICKS_PER_DAY; t++) {
  SW.sim.tick(g, 1);
  // The mini-games are frame-driven, so step them finely inside each second
  // and give the scripted player a chance to react at the same rate.
  for (let k = 0; k < 10; k++) {
    SW.sim.tickRealtime(g, 0.1);
    if (g.fishing && !g.fishing.result) {
      const f = g.fishing;
      if (f.pos >= f.zone && f.pos <= f.zone + f.zoneW && Math.random() < 0.35) M2.strike(g);
    }
    if (g.chant && g.chant.phase === 'input' && g.chant.input.length < g.chant.seq.length && Math.random() < 0.2) {
      const i = g.chant.input.length;
      M2.chantInput(g, Math.random() < 0.85 ? g.chant.seq[i] : (g.chant.seq[i] + 1) % 5);
    }
    if (g.listen) {
      for (const n of g.listen.nodes) {
        if (!n.hit && n.t > 0.4 && Math.random() < 0.06) { n.hit = true; g.listen.hits++; Mg.hitListenNode(g, n); }
      }
    }
  }
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
      fest: C.FESTIVALS.map(f => (S.festivalScore(g, f) / f.par(g.day)).toFixed(1)).join('/'),
      gen: g.creature.gen, evo: g.evo, ring: g.ring,
      ins: Math.round(g.insight), neu: Object.keys(g.neurons).length
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
  gens: g.gens, evo: g.evo, ring: g.ring,
  season: SW.boost.seasonOf(g).name, weather: SW.boost.weatherOf(g).name,
  people: (g.people || []).length, buildings: Object.keys(g.buildings).length + '/' + C2.BUILDING_LIST.length,
  relics: Object.keys(g.relics).length + '/' + C2.RELIC_LIST.length,
  techs: Object.keys(g.creature.techniques || {}).filter(t => B.techKnown(g, t)).length + '/' + C2.TECHNIQUE_LIST.length,
  fished: g.stats.fished, chants: g.stats.chants, arena: g.stats.arenaWins + '-' + g.stats.arenaLosses,
  events: g.eventLog.length, title: g.title, soil: Math.round(g.plots.reduce((a, p) => a + W.soilOf(p), 0) / Math.max(1, g.plots.length)),
  ascendPts: SW.prestige.pointsFor(g),
  discovered: Object.keys(g.discovered).length + '/' + C.FEATURES.length,
  neurons: Object.keys(g.neurons).length + '/' + C.NEURONS.length,
  recipes: Object.keys(g.recipes).length + '/' + C.RECIPES.length,
  creature: Cr.describe(g)
});
console.log('top of register:', S.standings(g).slice(0, 4).map(r => `${r.place}. ${r.name} ${Math.round(r.renown)}`).join('  |  '));
