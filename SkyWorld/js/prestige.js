/* Skyward Reach — Ascension.
 *
 * Let the island go and begin again on a fresh one, carrying only what you
 * chose to carry. The point of a grind game is the second run being faster
 * than the first for reasons you picked.
 */
(function (SW) {
  'use strict';
  const C = SW.content, C2 = SW.content2;
  const { clamp, fmt } = SW.core;

  const fail = (g, m) => { SW.ui.log(g, m, 'warn'); return false; };

  function canAscend(g) {
    return g.res.renown >= C2.ASCEND_MIN_RENOWN;
  }

  /* Points earned by this run, on a curve so a much longer run is worth more
   * but not proportionally so. */
  function pointsFor(g) {
    if (!canAscend(g)) return 0;
    return Math.max(1, Math.floor(Math.pow(g.res.renown / C2.ASCEND_MIN_RENOWN, 0.62) * 3));
  }

  function spent(g) {
    let n = 0;
    for (const id in (g.prestige.boons || {})) {
      const b = C2.BOONS.find(x => x.id === id);
      if (b) n += b.cost;
    }
    return n;
  }
  const unspent = g => (g.prestige.points | 0) - spent(g);

  function buyBoon(g, id) {
    const b = C2.BOONS.find(x => x.id === id);
    if (!b) return false;
    if (g.prestige.boons[id]) return fail(g, 'You already carry that.');
    if (unspent(g) < b.cost) return fail(g, 'Not enough ascension points.');
    g.prestige.boons[id] = true;
    SW.ui.log(g, `${b.glyph} ${b.name}. ${b.blurb}`, 'great');
    return true;
  }

  /* Build the next island. Everything not covered by a boon is gone. */
  function ascend(g) {
    if (!canAscend(g)) return fail(g, `You need ${fmt(C2.ASCEND_MIN_RENOWN)} renown before anyone would let you start again.`);
    const gained = pointsFor(g);
    const carried = {
      points: (g.prestige.points | 0) + gained,
      boons: g.prestige.boons || {},
      runs: (g.prestige.runs | 0) + 1,
      best: Math.max(g.prestige.best | 0, Math.floor(g.res.renown)),
      bestDay: g.prestige.best > g.res.renown ? g.prestige.bestDay : g.day
    };
    const keptSeeds = carried.boons.seedstock;
    const keptEvo = carried.boons.longline ? Math.max(0, (g.evo | 0) - 1) : 0;
    const keptIngrained = carried.boons.memory ? g.creature.ingrained : null;
    const keptNeurons = carried.boons.earlyweb
      ? Object.keys(g.neurons).slice(0, 4).reduce((o, k) => (o[k] = 1, o), {})
      : {};
    const lineage = g.creature.lineage;
    const name = g.creature.name;
    const godName = g.godName;

    const n = SW.state.startGame(lineage, name, godName);
    n.prestige = carried;
    n.evo = keptEvo;
    if (keptIngrained) {
      n.creature.ingrained = {};
      for (const k in keptIngrained) n.creature.ingrained[k] = keptIngrained[k] * 0.5;
      // Ingrained behaviour implies some of the weight came with it.
      for (const k in n.creature.ingrained) {
        const inst = (C.LINEAGES[lineage].instinct[k] || 1);
        n.creature.weights[k] = clamp(inst + (SW.creature.W_MAX - inst) * n.creature.ingrained[k] * 0.3,
          SW.creature.W_MIN, SW.creature.W_MAX);
      }
    }
    n.neurons = keptNeurons;
    if (keptNeurons.attention) n.res.focusMax += 10;
    if (carried.boons.inheritance) { n.res.coin += 2000; n.res.wood += 150; }
    if (keptSeeds) for (const cr of C.CROP_LIST) n.seeds[cr.id] = 40;

    SW.ui.log(n, `You let the island go. ${carried.runs === 1 ? 'The first' : 'Another'} one is already forming under your feet. +${gained} ascension point${gained === 1 ? '' : 's'}.`, 'great');
    n.fx.push({ at: 'banner', text: '✧ ASCENSION ' + carried.runs, life: 6, t: 0 });
    return n;
  }

  SW.prestige = { canAscend, pointsFor, spent, unspent, buyBoon, ascend };
})(window.SW = window.SW || {});
