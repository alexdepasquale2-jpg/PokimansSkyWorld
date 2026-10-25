/* Headless balance harness.
 *
 *   node tools/simtest.js [minutes] [seed]
 *
 * Loads the game's own modules (everything except render.js, ui.js and main.js,
 * which need a DOM) and runs the same scripted animal under four different
 * relationships with the Fossil Exchange. The player's dinosaur is driven by
 * the lobby's own AI brain, so the only thing that differs between the runs is
 * what the Exchange was doing in the background and what it bought.
 *
 * The question it answers: how much of a run is the Exchange carrying? That is
 * a measurement, not an opinion, so it gets printed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = ['core.js', 'content.js', 'store.js', 'mutations.js', 'idle.js',
  'world.js', 'shop.js', 'dino.js', 'combat.js', 'ai.js', 'state.js', 'sim.js'];

/* Every run gets the same random stream, so the only difference between the
 * four profiles is the profile. The sandbox gets its own Math whose `random`
 * is seeded; the host's Math is untouched. */
function seededMath(seed) {
  const m = Object.create(Math);
  let s = seed >>> 0;
  m.random = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function loadGame(rngSeed) {
  const sandbox = {
    window: {}, console, Math: seededMath(rngSeed), Date, JSON, parseInt, parseFloat, isNaN,
    Uint8Array, Object, Array, String, Number, Error, Set, Map
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.window.ISLE;
}

const minutes = parseFloat(process.argv[2] || '25');
const seed = parseInt(process.argv[3] || '1234', 10);
const DT = 0.05;
const STEPS = Math.round((minutes * 60) / DT);

/* Buy every generator the balance covers, cheapest rung first. This is what a
 * player idly poking the Exchange between deaths actually does. */
function workExchange(ISLE, g) {
  for (const def of ISLE.idle.GENS) {
    const n = ISLE.idle.maxAfford(g.idle, g.acct.dino * 0.85, def.id);
    if (n > 0) ISLE.idle.buyGen(g, def.id, n);
  }
  for (const u of ISLE.idle.UPGRADES) {
    if (!g.idle.ups[u.id] && g.acct.dino > u.cost * 3) ISLE.idle.buyUpgrade(g, u.id);
  }
}

/* Four ways of relating to the second game. */
const PROFILES = {
  survivor: {
    label: 'survivor', note: 'never opens the Exchange',
    setup() {}, during() {}
  },

  digger: {
    label: 'digger', note: 'works the Exchange, spends nothing on the isle',
    setup() {},
    during(ISLE, g, t) {
      if (t % 2 < DT) for (let i = 0; i < 3; i++) ISLE.idle.tap(g);
      workExchange(ISLE, g);
    }
  },

  outfitter: {
    label: 'outfitter', note: 'Exchange pays for serums and revives',
    setup() {},
    during(ISLE, g, t) {
      if (t % 2 < DT) for (let i = 0; i < 3; i++) ISLE.idle.tap(g);
      workExchange(ISLE, g);
      const p = g.player;
      if (!p) return;
      if (ISLE.shop.itemCount(g, 'revive') < 2 && g.acct.dino > 2000) ISLE.shop.buyItem(g, 'revive', 1);
      if (p.growth < 0.99 && g.acct.dino > 1500) {
        ISLE.shop.buyItem(g, 'serum', 1);
        ISLE.shop.useItem(g, 'serum');
      }
    }
  },

  tycoon: {
    label: 'tycoon', note: 'starts on a day of banked Exchange income',
    setup(ISLE, g) {
      // A day of a well-run Exchange, credited up front rather than waited out.
      ISLE.idle.credit(g, 260000);
      workExchange(ISLE, g);
      ISLE.shop.buyClub(g);
      ISLE.shop.buySpecies(g, 'tyrant');
      ISLE.shop.buyItem(g, 'revive', 6);
      ISLE.shop.buyItem(g, 'megaSerum', 4);
      ISLE.shop.buyItem(g, 'plating', 3);
    },
    during(ISLE, g) {
      workExchange(ISLE, g);
      const p = g.player;
      if (!p) return;
      if (p.growth < 0.99 && ISLE.shop.itemCount(g, 'megaSerum') > 0) ISLE.shop.useItem(g, 'megaSerum');
      if (p.growth < 0.99 && g.acct.dino > 4000) {
        ISLE.shop.buyItem(g, 'megaSerum', 1);
        ISLE.shop.useItem(g, 'megaSerum');
      }
      if (!p.buffs.armor && ISLE.shop.itemCount(g, 'plating') > 0) ISLE.shop.useItem(g, 'plating');
      if (ISLE.shop.itemCount(g, 'revive') < 3 && g.acct.dino > 3000) ISLE.shop.buyItem(g, 'revive', 1);
    }
  }
};

/* A cautious but not pacifist player: carnivores take fights they expect to
 * win, everything else runs. Deliberately mediocre — a real player is better,
 * so these numbers understate what skill can do. */
function givePlayerBrain(ISLE, g) {
  const p = g.player;
  if (!p) return;
  p.ai = {
    state: 'wander', kos: ISLE.dino.species(p).diet === 'carnivore',
    nerve: 1.15, skill: 0.7, think: 0,
    gx: p.x, gy: p.y, targetId: null, until: 0
  };
}

/* The scripted player's draft policy: take the rarest thing offered. Somebody
 * has to answer the draft — it holds the world still until it is resolved. */
function resolveDraft(ISLE, g, tally) {
  const rank = { common: 0, uncommon: 1, rare: 2, apex: 3 };
  const best = g.draft.opts.slice().sort((a, b) =>
    rank[ISLE.mutations.BY_ID[b].rarity] - rank[ISLE.mutations.BY_ID[a].rarity])[0];
  tally[best] = (tally[best] || 0) + 1;
  ISLE.sim.takeMutation(g, best);
}

function run(name) {
  const ISLE = loadGame(seed);
  const profile = PROFILES[name];
  const startSp = name === 'tycoon' ? 'tyrant' : 'fernback';

  const g = ISLE.state.startGame('fernback', 'harness', seed);
  profile.setup(ISLE, g);
  if (startSp !== 'fernback' && ISLE.shop.unlocked(g, startSp)) ISLE.sim.respawnNow(g, startSp);
  givePlayerBrain(ISLE, g);

  const stat = {
    peak: 0, adultAt: null, adultTime: 0, deaths: 0, kills: 0, drafts: 0,
    growthSeconds: 0, revives: 0, stalled: 0, muts: {}
  };
  let lastKills = 0;

  for (let i = 0; i < STEPS; i++) {
    const t = i * DT;
    ISLE.sim.tickTimers(g, DT);
    ISLE.sim.update(g, DT, null);

    if (g.draft) { resolveDraft(ISLE, g, stat.muts); stat.drafts++; }

    const p = g.player;
    if (p) {
      // Kills are counted per body, so tally deltas: a respawn resets to zero.
      if (p.kills < lastKills) lastKills = 0;
      stat.kills += p.kills - lastKills;
      lastKills = p.kills;
    }
    if (p && p.alive) {
      stat.peak = Math.max(stat.peak, p.growth);
      stat.growthSeconds += p.growth * DT;
      if (p.growth >= 0.999) { stat.adultTime += DT; if (stat.adultAt == null) stat.adultAt = t; }
      if (p.growthStalled) stat.stalled += DT;
    }

    if (g.dead) {
      stat.deaths++;
      if (ISLE.shop.itemCount(g, 'revive') > 0 && ISLE.sim.revive(g, 'item')) {
        stat.revives++;
      } else {
        g.respawn = null;
        ISLE.sim.respawnNow(g, ISLE.shop.unlocked(g, startSp) ? startSp : 'fernback');
        givePlayerBrain(ISLE, g);
        lastKills = 0;
      }
    }

    if (i % 20 === 0) profile.during(ISLE, g, t);
  }

  stat.final = g.player ? g.player.growth : 0;
  stat.dino = g.acct.dino;
  stat.rate = ISLE.idle.rate(g.idle);
  stat.spent = g.acct.ledger.spent;
  stat.specimens = g.idle.specimens;
  stat.adv = ISLE.shop.advantage(g);
  stat.rank = rankOf(ISLE, g);
  stat.carried = g.player ? (g.player.muts || []).length : 0;
  return stat;
}

/* Where the player sits on the server list, out of everything alive. */
function rankOf(ISLE, g) {
  const board = ISLE.sim.leaderboard(g, 99);
  const i = board.findIndex(b => b.you);
  return i < 0 ? board.length + 1 : i + 1;
}

function fmtTime(s) {
  if (s == null) return '—';
  return Math.floor(s / 60) + 'm' + String(Math.round(s % 60)).padStart(2, '0') + 's';
}
function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n));
}
const pad = (s, n) => String(s).padEnd(n);
const padl = (s, n) => String(s).padStart(n);

console.log(`\nPrimal Isle — ${minutes} minutes, seed ${seed}. Same island, same brain, same`);
console.log('random stream in every run. Only the Exchange differs.\n');
console.log(pad('profile', 11) + padl('peak', 6) + padl('adult at', 10) + padl('adult for', 10) +
  padl('deaths', 8) + padl('revived', 8) + padl('kills', 7) + padl('drafts', 8) +
  padl('D$/s', 8) + padl('spent', 8) + padl('adv', 5) + padl('rank', 6));
console.log('-'.repeat(95));

const rows = {};
for (const name of ['survivor', 'digger', 'outfitter', 'tycoon']) {
  const s = run(name);
  rows[name] = s;
  console.log(
    pad(PROFILES[name].label, 11) +
    padl(Math.round(s.peak * 100) + '%', 6) +
    padl(fmtTime(s.adultAt), 10) +
    padl(fmtTime(s.adultTime), 10) +
    padl(s.deaths, 8) +
    padl(s.revives, 8) +
    padl(s.kills, 7) +
    padl(s.drafts, 8) +
    padl(fmtNum(s.rate), 8) +
    padl(fmtNum(s.spent), 8) +
    padl(s.adv, 5) +
    padl('#' + s.rank, 6));
}

const a = rows.survivor, b = rows.digger, c = rows.outfitter, d = rows.tycoon;
const x = v => (v.growthSeconds / Math.max(1, a.growthSeconds)).toFixed(2) + '×';
console.log('\nWhat the Exchange bought:');
console.log(`  growth-seconds   survivor ${Math.round(a.growthSeconds)} · digger ${x(b)} · outfitter ${x(c)} · tycoon ${x(d)}`);
console.log(`  peak growth      ${[a, b, c, d].map(r => Math.round(r.peak * 100) + '%').join('  ·  ')}`);
console.log(`  deaths           ${[a, b, c, d].map(r => r.deaths + (r.revives ? ` (${r.revives} revived)` : '')).join('  ·  ')}`);
console.log(`  specimens banked ${[a, b, c, d].map(r => r.specimens).join('  ·  ')}`);
console.log('\nNote: the digger spends nothing on the isle, so any gap between it and the');
console.log('survivor is the Exchange doing nothing for the run at all — which is the');
console.log('control this table exists to provide.\n');

const taken = {};
for (const r of [a, b, c, d]) for (const k in r.muts) taken[k] = (taken[k] || 0) + r.muts[k];
const top = Object.keys(taken).sort((p, q) => taken[q] - taken[p]).slice(0, 6);
if (top.length) {
  const ISLE = loadGame(seed);
  console.log('Most-drafted mutations: ' + top.map(k => `${ISLE.mutations.BY_ID[k].name} ×${taken[k]}`).join(', ') + '\n');
}
