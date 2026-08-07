/* Skyward Reach — the frontier.
 *
 * The island is not fully known to you. Unknown things sit out past the farm
 * as question marks; walking up and examining one is the only source of
 * Insight, and Insight is the only thing that buys permanent changes to
 * yourself. Raising a terrace pushes the edge outward and puts a fresh band
 * of unknown things inside it.
 */
(function (SW) {
  'use strict';
  const C = SW.content;
  const { clamp, hashNoise, fmt } = SW.core;

  const ringOf = g => C.RINGS[clamp(g.ring | 0, 0, C.RINGS.length - 1)];
  const nextRing = g => C.RINGS[(g.ring | 0) + 1] || null;

  function ringCost(g) {
    const r = nextRing(g);
    if (!r) return null;
    const off = g.neurons && g.neurons.frontier ? 0.67 : 1;
    return {
      wood: Math.ceil(r.wood * off),
      coin: Math.ceil(r.coin * off),
      insight: Math.ceil(r.insight * off)
    };
  }

  /* Scatter the features belonging to a ring into the band that ring adds.
   * Positions are in units of the base island radius, so they stay put as the
   * island grows outward around them. */
  function spawnRing(g, ringIndex) {
    // The landmass is a blob, not a true ellipse, so keep everything inside
    // ~84% of the nominal radius or features end up hanging over the edge.
    const SAFE = 0.84;
    const inner = (ringIndex === 0 ? 0.52 : C.RINGS[ringIndex - 1].radius * SAFE + 0.06);
    const outer = C.RINGS[ringIndex].radius * SAFE;
    const list = C.FEATURES.filter(f => f.ring === ringIndex);
    list.forEach((f, i) => {
      if (g.features.some(x => x.fid === f.id)) return;
      const n1 = hashNoise(4200 + ringIndex * 31, i);
      const n2 = hashNoise(9100 + ringIndex * 17, i);
      g.features.push({
        fid: f.id,
        ring: ringIndex,
        // spread around the rim, nudged so they never stack
        ang: (i / Math.max(1, list.length)) * Math.PI * 2 + n1 * 0.8,
        dist: inner + (outer - inner) * (0.25 + n2 * 0.7),
        found: false
      });
    });
  }

  function insightMul(g) {
    return (1 + SW.lineage.bonus(g, 'insight')) * (g.neurons && g.neurons.sight ? 1.4 : 1);
  }

  const EXAMINE_FOCUS = 4;

  function examineCost(g) {
    return g.neurons && g.neurons.sight ? 0 : EXAMINE_FOCUS;
  }

  function examine(g, inst) {
    if (!inst || inst.found) return false;
    const def = C.FEATURES.find(f => f.id === inst.fid);
    if (!def) return false;
    const cost = examineCost(g);
    if (g.res.focus < cost) { SW.ui.log(g, 'Not enough focus to give it a proper look.', 'warn'); return false; }
    g.res.focus -= cost;
    inst.found = true;
    g.discovered[def.id] = g.day;

    const gained = Math.max(1, Math.round(def.insight * insightMul(g)));
    g.insight += gained;
    if (def.mat) g.mats[def.mat] = (g.mats[def.mat] | 0) + 3;
    if (def.wood) g.res.wood += def.wood;
    if (def.effect) g.effects[def.effect] = true;

    let extra = '';
    if (def.mat) extra += ` 3 ${C.MATERIALS[def.mat].name.toLowerCase()}.`;
    if (def.wood) extra += ` ${def.wood} wood.`;
    SW.ui.log(g, `You examine ${def.name}. ${def.blurb} +${gained} insight.${extra}`, 'great');
    g.fx.push({ at: 'banner', text: def.glyph + ' ' + def.name, life: 3.5, t: 0 });
    return true;
  }

  /* Doing something for the first time is worth Insight — the Ancestors idea
   * that novelty is what actually rewires you. Without this the economy cannot
   * bootstrap: terrace-0 features alone do not cover a single neuron, let alone
   * the Listening that makes Insight repeatable. */
  function firstTime(g, key, amount, label) {
    if (!g.firsts) g.firsts = {};
    if (g.firsts[key]) return 0;
    g.firsts[key] = g.day;
    const n = Math.max(1, Math.round(amount * insightMul(g)));
    g.insight += n;
    if (label) SW.ui.log(g, `First time ${label}. +${n} insight.`, 'good');
    return n;
  }

  function unknownCount(g) {
    return g.features.filter(f => !f.found).length;
  }

  // --- raising a terrace -------------------------------------------------
  function raiseRing(g) {
    const r = nextRing(g);
    if (!r) { SW.ui.log(g, 'There is no more sky to build out into.', 'warn'); return false; }
    const cost = ringCost(g);
    if (g.res.wood < cost.wood || g.res.coin < cost.coin || g.insight < cost.insight) {
      SW.ui.log(g, 'Not enough to raise the next terrace.', 'warn');
      return false;
    }
    g.res.wood -= cost.wood;
    g.res.coin -= cost.coin;
    g.insight -= cost.insight;
    g.ring = r.i;

    // New ground: more plot slots to buy, and a wider band of unknown things.
    const have = g.plots.length + g.lockedPlots.length;
    for (let i = have; i < r.plots; i++) g.lockedPlots.push(SW.state.makePlot(i));
    spawnRing(g, r.i);

    SW.ui.log(g, `${r.name} rises out of the cloud. The island is bigger than it was, and you do not know all of it.`, 'great');
    g.fx.push({ at: 'banner', text: '⛰ ' + r.name.toUpperCase(), life: 5, t: 0 });
    return true;
  }

  function hutCap(g) { return ringOf(g).hutCap; }

  // --- the neural web ----------------------------------------------------
  function neuronAvailable(g, n) {
    return n.req.every(r => g.neurons[r]);
  }

  function buyNeuron(g, id) {
    const n = C.NEURONS.find(x => x.id === id);
    if (!n) return false;
    if (g.neurons[id]) return false;
    if (!neuronAvailable(g, n)) { SW.ui.log(g, 'Something has to come before that.', 'warn'); return false; }
    if (g.insight < n.cost) { SW.ui.log(g, 'Not enough insight.', 'warn'); return false; }
    g.insight -= n.cost;
    g.neurons[id] = g.day;
    if (id === 'attention') g.res.focusMax += 10;
    SW.ui.log(g, `${n.name}. ${n.desc}`, 'great');
    return true;
  }

  /* Modifiers the rest of the sim asks about, all in one place. */
  const mods = {
    thirst: g => (g.effects.thirst ? 0.75 : 1),
    growth: g => (g.effects.growth ? 1.15 : 1),
    eat: g => (g.effects.granary ? 0.85 : 1),
    prayer: g => (g.effects.prayer ? 1.25 : 1),
    yield: g => (1 + SW.lineage.bonus(g, 'yield')) * (g.neurons.husbandry ? 1.25 : 1),
    focusRegen: g => (g.neurons.stamina ? 1.4 : 1),
    learn: g => (g.neurons.patience ? 1.3 : 1),
    forget: g => (g.neurons.memory ? 0.5 : 1),
    renown: g => (1 + SW.lineage.bonus(g, 'renown')) * (g.neurons.devotion ? 1.3 : 1),
    craft: g => (g.neurons.craftsman ? 1.6 : 1)
  };

  SW.discovery = {
    ringOf, nextRing, ringCost, spawnRing, examine, examineCost, unknownCount,
    raiseRing, hutCap, neuronAvailable, buyNeuron, insightMul, firstTime, mods
  };
})(window.SW = window.SW || {});
