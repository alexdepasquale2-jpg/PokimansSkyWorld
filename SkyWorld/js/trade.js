/* Skyward Reach — caravans, contracts, and what the other gods think of you. */
(function (SW) {
  'use strict';
  const C = SW.content, C2 = SW.content2;
  const { clamp, rnd, rndInt, pick, chance, fmt } = SW.core;

  const fail = (g, m) => { SW.ui.log(g, m, 'warn'); return false; };

  /* ---------------------------------------------------------- caravans   */
  const VISIT_EVERY = 6;   // days, roughly; the dock shortens it

  function merchantRep(g, id) { return (g.merchantRep && g.merchantRep[id]) | 0; }

  function repTier(rep) { return rep >= 60 ? 3 : rep >= 30 ? 2 : rep >= 10 ? 1 : 0; }

  /* Prices improve as a merchant comes to trust you; the dock and traders help. */
  function markup(g, id) {
    return 1 / (1 + repTier(merchantRep(g, id)) * 0.09) / SW.boost.get(g, 'trade');
  }
  function payout(g, id) {
    return (1 + repTier(merchantRep(g, id)) * 0.11) * SW.boost.get(g, 'trade') * SW.boost.get(g, 'coin');
  }

  function rollCaravan(g) {
    const m = pick(C2.MERCHANTS);
    const tier = repTier(merchantRep(g, m.id));
    const stock = {};
    for (const mat of m.sells) {
      // Rare stock only opens up once they know you.
      const rare = mat === 'metal' || mat === 'glass';
      if (rare && tier < 1) continue;
      stock[mat] = rndInt(2, 4 + tier * 2);
    }
    const wants = pick(m.buys.filter(b => SW.sim.rankOf(g).id >= C.CROPS[b].rank)) || m.buys[0];
    const need = Math.max(4, Math.round((6 + g.day * 0.5) * rnd(0.7, 1.3)));
    g.caravan = {
      id: m.id, until: g.day + 3, stock,
      contract: {
        kind: 'deliver', crop: wants, need, got: 0,
        coin: Math.round(C.CROPS[wants].price * need * 2.4 * (1 + tier * 0.15)),
        renown: Math.round(30 + g.day * 3),
        rep: 12
      }
    };
    SW.ui.log(g, `${m.glyph} ${m.name} has tied up at the rim. ${m.blurb}`, 'good');
    SW.discovery.firstTime(g, 'caravan', 5, 'trading with a caravan');
  }

  function caravanDef(g) {
    return g.caravan ? C2.MERCHANTS.find(m => m.id === g.caravan.id) : null;
  }

  function matPrice(g, mat) {
    const base = C.MATERIALS[mat].buy || (mat === 'glass' ? 520 : 900);
    return Math.max(1, Math.round(base * 1.25 * markup(g, g.caravan.id)));
  }

  function buyFromCaravan(g, mat, n) {
    if (!g.caravan) return false;
    const have = g.caravan.stock[mat] | 0;
    const price = matPrice(g, mat);
    const want = Math.min(n, have, Math.floor(g.res.coin / price));
    if (want <= 0) return fail(g, have ? 'Not enough coin.' : 'They have none left.');
    g.res.coin -= price * want;
    g.caravan.stock[mat] -= want;
    g.mats[mat] = (g.mats[mat] | 0) + want;
    g.merchantRep[g.caravan.id] = merchantRep(g, g.caravan.id) + want;
    SW.ui.log(g, `Bought ${want} ${C.MATERIALS[mat].name.toLowerCase()} off the cart.`, 'info');
    return true;
  }

  function deliverContract(g) {
    if (!g.caravan) return false;
    const ct = g.caravan.contract;
    const held = g.stock[ct.crop] | 0;
    const give = Math.min(held, ct.need - ct.got);
    if (give <= 0) return fail(g, `You have no ${C.CROPS[ct.crop].name} to hand over.`);
    g.stock[ct.crop] -= give;
    ct.got += give;
    if (ct.got >= ct.need) {
      const coin = Math.round(ct.coin * payout(g, g.caravan.id));
      g.res.coin += coin;
      g.stats.coinEarned += coin;
      g.res.renown += ct.renown;
      g.merchantRep[g.caravan.id] = merchantRep(g, g.caravan.id) + ct.rep;
      SW.ui.log(g, `Contract filled — ${ct.need} ${C.CROPS[ct.crop].name}. +${fmt(coin)} coin, +${ct.renown} renown.`, 'great');
      SW.discovery.firstTime(g, 'contract', 6, 'filling a contract');
      g.caravan.contract = null;
    } else {
      SW.ui.log(g, `${ct.got}/${ct.need} delivered.`, 'info');
    }
    return true;
  }

  function tickCaravan(g) {
    const gap = Math.max(3, VISIT_EVERY - SW.boost.buildingTier(g, 'dock'));
    if (g.caravan && g.day > g.caravan.until) {
      const m = caravanDef(g);
      if (g.caravan.contract) {
        g.merchantRep[g.caravan.id] = merchantRep(g, g.caravan.id) - 6;
        SW.ui.log(g, `${m.name} casts off with the contract unfilled. They remember that.`, 'warn');
      } else {
        SW.ui.log(g, `${m.name} casts off.`, 'info');
      }
      g.caravan = null;
      g.nextCaravan = g.day + gap;
    }
    if (!g.caravan && g.day >= (g.nextCaravan || 0)) rollCaravan(g);
  }

  /* --------------------------------------------------------- diplomacy   */
  function opinion(g, name) { return (g.diplo && g.diplo[name]) | 0; }
  function opinionWord(v) {
    return v >= 55 ? 'allied' : v >= 20 ? 'warm' : v > -20 ? 'neutral' : v > -55 ? 'cold' : 'hostile';
  }

  function diplomacy(g, rivalName, actionId) {
    const a = C2.DIPLO_ACTIONS.find(x => x.id === actionId);
    const rival = g.rivals.find(r => r.name === rivalName);
    if (!a || !rival) return false;
    if (a.coin) {
      const c = a.coin(g);
      if (g.res.coin < c) return fail(g, 'Not enough coin for that.');
      g.res.coin -= c;
    }
    if (a.renown) g.res.renown = Math.max(0, g.res.renown + a.renown(g));
    if (a.awe) g.village.awe = clamp(g.village.awe + a.awe, 0, 100);
    if (a.vigor) {
      if (g.creature.vigor < a.vigor) return fail(g, 'The creature is too tired for that.');
      g.creature.vigor -= a.vigor;
      // Sabotage: steal standing, unless they see it coming.
      const caught = chance(0.35 - (SW.beast.hasTech(g, 'guard') ? 0.15 : 0));
      if (caught) {
        g.res.renown = Math.max(0, g.res.renown - 120);
        SW.ui.log(g, `${rivalName} catches your creature at it. Everyone hears.`, 'bad');
      } else {
        const took = Math.min(rival.renown * 0.03, 600 + g.day * 8);
        rival.renown -= took;
        g.res.renown += took * 0.5;
        SW.ui.log(g, `Something of ${rivalName}'s standing goes missing in the night. +${fmt(took * 0.5)} renown.`, 'good');
      }
    }
    g.diplo[rivalName] = clamp(opinion(g, rivalName) + a.opinion, -100, 100);
    if (!a.vigor) SW.ui.log(g, `${a.glyph} ${a.name} — ${rivalName} is now ${opinionWord(opinion(g, rivalName))}.`, 'info');
    SW.discovery.firstTime(g, 'diplo', 4, 'dealing with a rival directly');
    return true;
  }

  /* Allies drag you up the curve a little; enemies chip at you. */
  function tickDiplomacy(g) {
    for (const r of g.rivals) {
      const v = opinion(g, r.name);
      if (v >= 55) g.res.renown += 12 + g.day * 0.4;
      else if (v <= -55 && chance(0.10)) {
        const loss = Math.round(40 + g.day * 2);
        g.res.renown = Math.max(0, g.res.renown - loss);
        SW.ui.log(g, `${r.name} says something damaging about you, and it sticks. −${loss} renown.`, 'bad');
      }
      // Opinions decay toward indifference.
      if (v !== 0) g.diplo[r.name] = v - Math.sign(v) * Math.min(Math.abs(v), 0.6);
    }
  }

  function newDay(g) {
    tickCaravan(g);
    tickDiplomacy(g);
  }

  SW.trade = {
    merchantRep, repTier, markup, payout, rollCaravan, caravanDef, matPrice,
    buyFromCaravan, deliverContract, tickCaravan,
    opinion, opinionWord, diplomacy, tickDiplomacy, newDay
  };
})(window.SW = window.SW || {});
