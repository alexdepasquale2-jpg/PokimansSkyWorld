/* Primal Isle — the Fossil Exchange: the incremental game that pays for
 * everything in the shop.
 *
 * There is no money in this game. Dinollars come from here and only from here,
 * so the shop is not a payment screen — it is the sink on a second game you
 * actually play. The two halves feed each other on purpose:
 *
 *   the Exchange earns Dinollars   →   the shop turns Dinollars into survival
 *   a survival run banks specimens →   specimens multiply the Exchange
 *
 * The Exchange runs while you are out on the isle, which is the whole reason
 * the survival half is not just a way of losing progress.
 */
(function (ISLE) {
  'use strict';
  const { clamp, fmt } = ISLE.core;

  /* Eight rungs. Costs climb 1.15× each, which is the ratio every incremental
   * game settles on because it makes the next one always feel close. */
  const GENS = [
    { id: 'digger',  name: 'Bone Digger',     icon: '⛏',  cost: 15,     rate: 0.12,
      blurb: 'Somebody with a brush and too much patience.' },
    { id: 'trap',    name: 'Amber Trap',      icon: '🟠', cost: 110,    rate: 1.1,
      blurb: 'Sap, a stick, and an insect with bad luck.' },
    { id: 'cart',    name: 'Fossil Cart',     icon: '🛒', cost: 1250,   rate: 8,
      blurb: 'Moves the big finds off the dig before the tide does.' },
    { id: 'digsite', name: 'Excavator',       icon: '🚜', cost: 14000,  rate: 47,
      blurb: 'Removes a hillside a day.' },
    { id: 'render',  name: 'Rendering Plant', icon: '🏭', cost: 160000, rate: 260,
      blurb: 'What comes off the isle has to go somewhere.' },
    { id: 'lab',     name: 'Genome Lab',      icon: '🧬', cost: 1.8e6,  rate: 1400,
      blurb: 'Reads what is left and sells the reading.' },
    { id: 'park',    name: 'Isle Franchise',  icon: '🎟',  cost: 2.4e7,  rate: 7800,
      blurb: 'Tickets. It was always going to end in tickets.' },
    { id: 'vats',    name: 'Cloning Vats',    icon: '⚗️', cost: 3.9e8,  rate: 44000,
      blurb: 'Makes more of the thing the tickets are for.' }
  ];
  const COST_MUL = 1.15;

  /* Owning a lot of one thing makes it better, at 10 / 25 / 50 / 100 / 200. */
  const MILES = [10, 25, 50, 100, 200];
  function milestoneMult(n) {
    let m = 1;
    for (const k of MILES) if (n >= k) m *= 2;
    return m;
  }

  /* One-off purchases that multiply everything. Deliberately few and
   * expensive: the interesting decision is Exchange versus shop, and too many
   * upgrades here would drown it. */
  const UPGRADES = [
    { id: 'sharper',  name: 'Sharper Picks',      cost: 800,    mult: 1.5,  blurb: '×1.5 to everything.' },
    { id: 'rail',     name: 'Narrow-gauge Rail',  cost: 24000,  mult: 1.75, blurb: '×1.75 to everything.' },
    { id: 'contract', name: 'Museum Contracts',   cost: 600000, mult: 2,    blurb: '×2 to everything.' },
    { id: 'patent',   name: 'Genome Patents',     cost: 1.2e7,  mult: 2.5,  blurb: '×2.5 to everything.' },
    { id: 'brand',    name: 'The Brand',          cost: 4e8,    mult: 3,    blurb: '×3 to everything.' },
    { id: 'hands',    name: 'Practised Hands',    cost: 2500,   tap: 12,    blurb: 'Digging by hand pays ×12.' },
    { id: 'seismic',  name: 'Seismic Survey',     cost: 90000,  tap: 40,    blurb: 'Digging by hand pays ×40 instead.' }
  ];

  /* Prestige. Everything on the Exchange resets; Fossil Points do not. */
  const PRESTIGE_BASE = 2e6;
  const FP_MULT = 0.05;               // each point is +5% forever
  const OFFLINE_CAP = 8 * 3600;       // seconds credited while away
  const OFFLINE_RATE = 0.55;

  function newState() {
    return {
      gens: {}, ups: {}, tapped: 0,
      earned: 0, total: 0,            // total is lifetime, across prestiges
      fp: 0, prestiges: 0,
      specimens: 0,                   // banked from survival runs
      lastReal: Date.now()
    };
  }

  const genDef = id => GENS.find(g => g.id === id);
  const owned = (s, id) => s.gens[id] || 0;

  function costOf(s, id, n) {
    const def = genDef(id);
    const have = owned(s, id);
    let total = 0;
    for (let i = 0; i < (n || 1); i++) total += def.cost * Math.pow(COST_MUL, have + i);
    return Math.ceil(total);
  }

  /* How many of this generator the wallet can afford right now. */
  function maxAfford(s, wallet, id) {
    let n = 0, spent = 0;
    const def = genDef(id);
    const have = owned(s, id);
    while (n < 1000) {
      const next = def.cost * Math.pow(COST_MUL, have + n);
      if (spent + next > wallet) break;
      spent += next; n++;
    }
    return n;
  }

  function globalMult(s) {
    let m = 1;
    for (const u of UPGRADES) if (s.ups[u.id] && u.mult) m *= u.mult;
    m *= 1 + FP_MULT * s.fp;
    m *= specimenMult(s);
    return m;
  }

  /* Specimens are the survival game's contribution: one per 10% of peak growth
   * reached on a run, banked whether you died or walked away. */
  function specimenMult(s) { return 1 + 0.04 * s.specimens; }

  function rate(s) {
    let r = 0;
    for (const def of GENS) {
      const n = owned(s, def.id);
      if (n) r += n * def.rate * milestoneMult(n);
    }
    return r * globalMult(s);
  }

  function tapPower(s) {
    let base = 1;
    for (const u of UPGRADES) if (s.ups[u.id] && u.tap) base = Math.max(base, u.tap);
    return base * globalMult(s) * (1 + rate(s) * 0.0015);
  }

  // --- actions -------------------------------------------------------------
  function tap(g) {
    const s = g.idle;
    const got = tapPower(s);
    credit(g, got);
    s.tapped++;
    return got;
  }

  function credit(g, amount) {
    g.acct.dino += amount;
    g.idle.earned += amount;
    g.idle.total += amount;
  }

  function buyGen(g, id, n) {
    const s = g.idle;
    n = n || 1;
    const cost = costOf(s, id, n);
    if (g.acct.dino < cost) return false;
    g.acct.dino -= cost;
    s.gens[id] = owned(s, id) + n;
    return true;
  }

  function buyUpgrade(g, id) {
    const s = g.idle;
    const u = UPGRADES.find(x => x.id === id);
    if (!u || s.ups[id] || g.acct.dino < u.cost) return false;
    g.acct.dino -= u.cost;
    s.ups[id] = 1;
    return true;
  }

  function prestigeGain(s) {
    if (s.total < PRESTIGE_BASE) return 0;
    return Math.floor(Math.sqrt(s.total / PRESTIGE_BASE) * 10) - s.fp;
  }

  function prestige(g) {
    const s = g.idle;
    const gain = prestigeGain(s);
    if (gain <= 0) return 0;
    s.fp += gain;
    s.prestiges++;
    s.gens = {}; s.ups = {}; s.earned = 0;
    g.acct.dino = 0;
    ISLE.sim.feed(g, `Extinction event. ${gain} fossil points — everything on the Exchange is ${Math.round(FP_MULT * s.fp * 100)}% better forever.`, 'buy');
    return gain;
  }

  /* Banked at the end of a run, win or lose. This is the only thing a death
   * does not take away from you, and it is why dying is a setback rather than
   * a wasted twenty minutes. */
  function bankRun(g, peakGrowth) {
    const n = Math.floor(peakGrowth * 10);
    if (n <= 0) return 0;
    g.idle.specimens += n;
    ISLE.sim.feed(g, `${n} specimen${n === 1 ? '' : 's'} logged — the Exchange pays ${Math.round((specimenMult(g.idle) - 1) * 100)}% more.`, 'good');
    return n;
  }

  function tick(g, dt) {
    credit(g, rate(g.idle) * dt);
    g.idle.lastReal = Date.now();
  }

  /* Credited on load. The Exchange keeps working while the tab is shut, at a
   * discount, up to eight hours. */
  function catchUp(g) {
    const s = g.idle;
    const away = clamp((Date.now() - (s.lastReal || Date.now())) / 1000, 0, OFFLINE_CAP);
    s.lastReal = Date.now();
    if (away < 30) return 0;
    const got = rate(s) * away * OFFLINE_RATE;
    if (got <= 0) return 0;
    credit(g, got);
    return { secs: away, got };
  }

  ISLE.idle = {
    GENS, UPGRADES, MILES, COST_MUL, PRESTIGE_BASE, OFFLINE_CAP,
    newState, genDef, owned, costOf, maxAfford, globalMult, specimenMult,
    milestoneMult, rate, tapPower, tap, credit, buyGen, buyUpgrade,
    prestigeGain, prestige, bankRun, tick, catchUp
  };
})(window.ISLE = window.ISLE || {});
