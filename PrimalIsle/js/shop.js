/* Primal Isle — the account: what you own, and what the shop does to the run.
 *
 * Every price here is paid in Dinollars earned on the Fossil Exchange. There
 * is no purchase path, no currency pack and no advertisement anywhere in this
 * file — the only way in is to have played the other half of the game.
 *
 * The ledger keeps the whole thing legible: where the Dinollars came from,
 * what they went on, and how much of your current run is standing on them.
 */
(function (ISLE) {
  'use strict';
  const S = ISLE.store;
  const C = ISLE.content;
  const { clamp, pick } = ISLE.core;

  const now = () => Date.now();

  function newAccount() {
    return {
      dino: 0, bones: 0,
      items: {}, boneItems: {},
      species: {}, shards: 0,
      skins: [], skin: null,
      clubUntil: 0,
      pass: { xp: 0, tier: 0, premium: false, claimedFree: {}, claimedPrem: {} },
      crate: { pulls: 0, pity: 0 },
      deals: [], firedDeals: {},
      mutBank: [],
      deaths: 0, deathStreak: 0, bestGrowth: 0, lives: 0,
      nestLives: 0, nestGrowth: 0.25,
      revivesUsed: 0, serumsUsed: 0, seenMuts: {},
      ledger: { spent: 0, by: {} }
    };
  }

  // --- currency ----------------------------------------------------------
  function spend(g, n, what) {
    if (g.acct.dino < n) return false;
    g.acct.dino -= n;
    const L = g.acct.ledger;
    L.spent += n;
    if (what) L.by[what] = (L.by[what] || 0) + n;
    return true;
  }

  function addBones(g, n) {
    if (clubActive(g)) n *= S.CLUB.boneMult;
    g.acct.bones += Math.round(n);
  }

  // --- items -------------------------------------------------------------
  function itemCount(g, id) { return g.acct.items[id] || 0; }
  function giveItem(g, id, n) { g.acct.items[id] = (g.acct.items[id] || 0) + (n || 1); }

  function buyItem(g, id, n) {
    n = n || 1;
    const it = S.ITEMS[id];
    if (!it) return false;
    if (!spend(g, it.cost * n, 'Items')) return false;
    giveItem(g, id, n);
    ISLE.sim.feed(g, `Bought ${it.name} ×${n}.`, 'buy');
    return true;
  }

  function buyBoneItem(g, id, n) {
    n = n || 1;
    const it = S.BONE_ITEMS[id];
    if (!it || g.acct.bones < it.bones * n) return false;
    g.acct.bones -= it.bones * n;
    g.acct.boneItems[id] = (g.acct.boneItems[id] || 0) + n;
    return true;
  }

  function applyEffect(g, eff, source) {
    const d = g.player;
    if (!d) return false;
    if (eff.growth) {
      d.growth = Math.min(C.ADULT, d.growth + eff.growth);
      g.acct.serumsUsed++;
      onGrowth(g, eff.growth);
      ISLE.sim.feed(g, `${source} — growth +${Math.round(eff.growth * 100)}%.`, 'buy');
    }
    if (eff.hunger) d.hunger = clamp(d.hunger + eff.hunger, 0, 100);
    if (eff.thirst) d.thirst = clamp(d.thirst + eff.thirst, 0, 100);
    if (eff.heal) ISLE.dino.heal(g, d, ISLE.dino.maxHp(d));
    if (eff.clearWounds) ISLE.dino.clearWounds(d);
    if (eff.clearBleed) { d.bleed = 0; d.bleedT = 0; }
    if (eff.armor) d.buffs.armor = { v: eff.armor, t: eff.dur || 300 };
    if (eff.reveal) d.buffs.reveal = { v: 1, t: eff.reveal };
    if (eff.spawnGrowth) { g.acct.nestLives = eff.lives; g.acct.nestGrowth = eff.spawnGrowth; }
    return true;
  }

  function useItem(g, id) {
    if (itemCount(g, id) <= 0) return false;
    const it = S.ITEMS[id];
    // These are spent by their own paths, not from the item list.
    if (id === 'revive' || id === 'instant' || id === 'reroll') return false;
    g.acct.items[id]--;
    applyEffect(g, it.effect, it.name);
    return true;
  }

  function useBoneItem(g, id) {
    if ((g.acct.boneItems[id] || 0) <= 0) return false;
    g.acct.boneItems[id]--;
    applyEffect(g, S.BONE_ITEMS[id].effect, S.BONE_ITEMS[id].name);
    return true;
  }

  // --- species -----------------------------------------------------------
  function unlocked(g, spId) {
    if (!C.SPECIES[spId].premium) return true;
    return !!g.acct.species[spId];
  }
  function unlockSpecies(g, spId, how) {
    g.acct.species[spId] = true;
    ISLE.sim.feed(g, `${C.SPECIES[spId].name} unlocked${how ? ' — ' + how : ''}.`, 'buy');
  }
  function buySpecies(g, spId) {
    const p = S.SPECIES_PRICE[spId];
    if (!p || unlocked(g, spId)) return false;
    if (!spend(g, p.cost, 'Species')) return false;
    unlockSpecies(g, spId, 'bought');
    return true;
  }
  function buySpeciesWithShards(g, spId) {
    const p = S.SPECIES_PRICE[spId];
    if (!p || unlocked(g, spId) || g.acct.shards < p.shards) return false;
    g.acct.shards -= p.shards;
    unlockSpecies(g, spId, 'shards');
    return true;
  }

  // --- banked mutations ---------------------------------------------------
  /* The bridge between the two games: Dinollars buy a mutation that outlives
   * your death and is already in play when the next hatchling opens its eyes. */
  function bankMutation(g, mutId) {
    const a = g.acct;
    if (a.mutBank.length >= S.BANK.slots) return false;
    if (a.mutBank.indexOf(mutId) >= 0) return false;
    const def = ISLE.mutations.BY_ID[mutId];
    if (!def) return false;
    if (!(a.seenMuts || {})[mutId]) return false;              // must have rolled it
    if (def.rarity === 'rare' || def.rarity === 'apex') return false;   // not the big ones
    if (!spend(g, S.BANK.cost, 'Banked mutations')) return false;
    a.mutBank.push(mutId);
    ISLE.sim.feed(g, `${ISLE.mutations.BY_ID[mutId].name} banked — it will be waiting at your next hatch.`, 'buy');
    return true;
  }
  function unbankMutation(g, mutId) {
    g.acct.mutBank = g.acct.mutBank.filter(x => x !== mutId);
    return true;
  }

  // --- crates -------------------------------------------------------------
  function rollCrate(g) {
    const a = g.acct;
    a.crate.pulls++;
    a.crate.pity++;
    const table = S.CRATE.table;

    if (a.crate.pity >= S.CRATE.pity) {
      a.crate.pity = 0;
      const legs = table.filter(e => e.rarity === 'legendary');
      return grant(g, legs[Math.random() < 0.8 ? 0 : legs.length - 1], true);
    }

    let total = 0;
    for (const e of table) total += e.w;
    let r = Math.random() * total;
    for (const e of table) {
      r -= e.w;
      if (r <= 0) {
        if (e.rarity === 'legendary') a.crate.pity = 0;
        return grant(g, e, false);
      }
    }
    return grant(g, table[0], false);
  }

  function grant(g, entry, pitied) {
    const gv = entry.give;
    const out = { name: entry.name, rarity: entry.rarity, pitied, detail: '' };
    if (gv.bones) { addBones(g, gv.bones); out.detail = `+${gv.bones} bones`; }
    if (gv.shards) { g.acct.shards += gv.shards; out.detail = `+${gv.shards} shards`; }
    if (gv.item) { giveItem(g, gv.item, gv.n || 1); out.detail = `${S.ITEMS[gv.item].name} ×${gv.n || 1}`; }
    if (gv.skin) {
      const pool = S.SKINS_BY_RARITY[gv.skin] || S.SKINS_BY_RARITY.common;
      const ownedSkins = g.acct.skins;
      const fresh = pool.filter(s => !ownedSkins.includes(s));
      const id = fresh.length ? pick(fresh) : pick(pool);
      if (!ownedSkins.includes(id)) ownedSkins.push(id);
      out.detail = S.SKINS[id].name + (fresh.length ? '' : ' (duplicate → 40 shards)');
      if (!fresh.length) g.acct.shards += 40;
      out.skin = id;
    }
    if (gv.species) {
      const locked = C.PREMIUM_SPECIES.filter(s => !unlocked(g, s));
      if (locked.length) { const s = pick(locked); unlockSpecies(g, s, 'crate'); out.detail = C.SPECIES[s].name + '!'; }
      else { g.acct.shards += 120; out.detail = 'already owned → 120 shards'; }
    }
    return out;
  }

  function openCrates(g, n) {
    n = n || 1;
    const cost = n === 10 ? S.CRATE.tenCost : S.CRATE.cost * n;
    if (!spend(g, cost, 'Crates')) return null;
    const out = [];
    for (let i = 0; i < n; i++) out.push(rollCrate(g));
    return out;
  }

  // --- season pass --------------------------------------------------------
  function addXp(g, n) {
    const p = g.acct.pass;
    p.xp += n;
    const tier = Math.min(S.PASS.tiers, Math.floor(p.xp / S.PASS.xpPerTier));
    if (tier > p.tier) {
      p.tier = tier;
      ISLE.sim.feed(g, `Apex Pass — tier ${tier}.`, 'info');
    }
  }
  function buyPass(g) {
    if (g.acct.pass.premium) return false;
    if (!spend(g, S.PASS.cost, 'Apex Pass')) return false;
    g.acct.pass.premium = true;
    ISLE.sim.feed(g, 'Apex Pass unlocked. Every premium reward up to your tier is claimable.', 'buy');
    return true;
  }
  function skipTier(g, n) {
    n = n || 1;
    if (!spend(g, S.PASS.tierSkip * n, 'Apex Pass')) return false;
    g.acct.pass.xp += S.PASS.xpPerTier * n;
    g.acct.pass.tier = Math.min(S.PASS.tiers, Math.floor(g.acct.pass.xp / S.PASS.xpPerTier));
    return true;
  }
  function claimTier(g, tier, premium) {
    const p = g.acct.pass;
    if (tier > p.tier || tier < 1) return null;
    if (premium && !p.premium) return null;
    const book = premium ? p.claimedPrem : p.claimedFree;
    if (book[tier]) return null;
    book[tier] = 1;
    const rew = premium ? S.PASS.premReward(tier) : S.PASS.freeReward(tier);
    if (rew.bones) addBones(g, rew.bones);
    if (rew.dino) g.acct.dino += rew.dino;
    if (rew.item) giveItem(g, rew.item, rew.n || 1);
    if (rew.species && !unlocked(g, rew.species)) unlockSpecies(g, rew.species, 'Apex Pass tier 40');
    return rew;
  }
  function claimAll(g) {
    let n = 0;
    for (let t = 1; t <= g.acct.pass.tier; t++) {
      if (claimTier(g, t, false)) n++;
      if (g.acct.pass.premium && claimTier(g, t, true)) n++;
    }
    return n;
  }

  // --- membership ---------------------------------------------------------
  function clubActive(g) { return g.acct && g.acct.clubUntil > now(); }
  function buyClub(g) {
    if (!spend(g, S.CLUB.cost, 'Apex Club')) return false;
    const a = g.acct;
    a.clubUntil = Math.max(a.clubUntil, now()) + S.CLUB.hours * 3600000;
    ISLE.sim.feed(g, 'Apex Club active for a day. Your name is gold now.', 'buy');
    return true;
  }

  // --- deals --------------------------------------------------------------
  function maybeDeal(g, trigger) {
    for (const id in S.DEALS) {
      const o = S.DEALS[id];
      if (o.trigger !== trigger) continue;
      if (o.once && g.acct.firedDeals[id]) continue;
      if (g.acct.deals.some(x => x.id === id)) continue;
      g.acct.firedDeals[id] = (g.acct.firedDeals[id] || 0) + 1;
      g.acct.deals.push({ id, until: now() + o.secs * 1000 });
      ISLE.sim.feed(g, `Limited deal: ${o.name}.`, 'buy');
      g.ui = g.ui || {};
      g.ui.popDeal = id;
      return id;
    }
    return null;
  }

  function tickDeals(g) {
    const t = now();
    g.acct.deals = g.acct.deals.filter(o => o.until > t);
  }

  function buyDeal(g, id) {
    const o = S.DEALS[id];
    const held = g.acct.deals.find(x => x.id === id);
    if (!o || !held) return false;
    if (!spend(g, o.cost, 'Deals')) return false;
    const a = g.acct;
    const gv = o.give;
    if (gv.dino) a.dino += gv.dino;
    if (gv.bones) addBones(g, gv.bones);
    if (gv.item) giveItem(g, gv.item, gv.n || 1);
    if (gv.item2) giveItem(g, gv.item2, gv.n2 || 1);
    if (gv.shards) a.shards += gv.shards;
    if (gv.species && !unlocked(g, gv.species)) unlockSpecies(g, gv.species, o.name);
    if (gv.mutBank) {
      const opts = ISLE.mutations.POOL.filter(m => m.rarity === 'uncommon' || m.rarity === 'common');
      const m = pick(opts);
      if (m && a.mutBank.length < S.BANK.slots) a.mutBank.push(m.id);
    }
    a.deals = a.deals.filter(x => x.id !== id);
    ISLE.sim.feed(g, `${o.name} bought.`, 'buy');
    return true;
  }

  // --- multipliers the sim reads ------------------------------------------
  function growthMult(g) {
    let m = 1;
    if (clubActive(g)) m *= S.CLUB.growthMult;
    if (g.acct.pass.premium) m *= 1.1;
    return m;
  }

  function exchangeMult(g) { return clubActive(g) ? S.CLUB.exchangeMult : 1; }

  function respawnSecs(g) {
    let base = 18 + 32 * clamp(g.acct.deathStreak / 5, 0, 1);
    if (clubActive(g)) base *= S.CLUB.respawnMult;
    return base;
  }

  // --- hooks the sim calls -------------------------------------------------
  function onGrowth(g, delta) {
    if (delta <= 0) return;
    addXp(g, delta * 100 * S.XP_PER.growthPct);
    const before = Math.floor((g.acct.bestGrowth || 0) * 10);
    g.acct.bestGrowth = Math.max(g.acct.bestGrowth || 0, g.player ? g.player.growth : 0);
    if (Math.floor(g.acct.bestGrowth * 10) > before) addBones(g, S.BONES_PER.growthMilestone);
    if (g.player && g.player.growth > 0.7) maybeDeal(g, 'nearAdult');
  }

  function onKill(g, victim) {
    addBones(g, S.BONES_PER.kill * (0.4 + victim.growth));
    addXp(g, S.XP_PER.kill * (0.5 + victim.growth));
  }

  function onEat(g, kind) {
    addXp(g, kind === 'plant' ? S.XP_PER.plant : S.XP_PER.meat);
  }

  function onMutation(g, id) {
    addBones(g, S.BONES_PER.mutation);
    addXp(g, S.XP_PER.mutation);
    // The bank can only hold something a run has actually shown you.
    if (id) {
      g.acct.seenMuts = g.acct.seenMuts || {};
      g.acct.seenMuts[id] = 1;
    }
  }

  function onDeath(g) {
    const a = g.acct;
    a.deaths++;
    a.deathStreak++;
    a.lives++;
    if (a.deaths === 1) maybeDeal(g, 'firstDeath');
    if (a.deathStreak >= 3) maybeDeal(g, 'deathStreak');
    if (a.dino > 12000) maybeDeal(g, 'richExchange');
  }

  function onSpawn(g) { /* nothing to settle yet; kept as the hook point */ }

  /* Growth you keep when you hatch again. Nothing, unless you bought a nest. */
  function spawnGrowth(g) {
    if (g.acct.nestLives > 0) { g.acct.nestLives--; return g.acct.nestGrowth || 0.25; }
    return C.HATCH_GROWTH;
  }

  // --- the ledger ----------------------------------------------------------
  function ledger(g) {
    const a = g.acct;
    const L = a.ledger;
    return {
      spent: L.spent,
      held: a.dino,
      earned: g.idle ? g.idle.total : 0,
      lines: Object.keys(L.by).map(k => ({ what: k, cost: L.by[k] })).sort((x, y) => y.cost - x.cost)
    };
  }

  /* 0..100: how much of this run is standing on the Exchange rather than on
   * play. Printed in the ledger, and measured by the balance harness. */
  function advantage(g) {
    const a = g.acct;
    let v = 0;
    if (clubActive(g)) v += 22;
    if (a.pass.premium) v += 10;
    v += C.PREMIUM_SPECIES.filter(s => unlocked(g, s)).length * 12;
    v += Math.min(16, itemCount(g, 'revive') * 4);
    v += Math.min(12, (itemCount(g, 'serum') + itemCount(g, 'megaSerum') * 3) * 1.5);
    v += Math.min(8, a.dino / 1500);
    v += a.mutBank.length * 4;
    return Math.round(clamp(v, 0, 100));
  }

  ISLE.shop = {
    newAccount, spend, addBones, itemCount, giveItem, buyItem, buyBoneItem,
    useItem, useBoneItem, applyEffect, unlocked, unlockSpecies, buySpecies,
    buySpeciesWithShards, bankMutation, unbankMutation, openCrates, rollCrate,
    addXp, buyPass, skipTier, claimTier, claimAll, clubActive, buyClub,
    maybeDeal, tickDeals, buyDeal, growthMult, exchangeMult, respawnSecs,
    onGrowth, onKill, onEat, onMutation, onDeath, onSpawn, spawnGrowth,
    ledger, advantage
  };
})(window.ISLE = window.ISLE || {});
