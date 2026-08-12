/* Primal Isle — the shop tables.
 *
 * Everything here is priced in Dinollars, and Dinollars come from one place:
 * the Fossil Exchange in idle.js. No real money is involved anywhere in this
 * game, and there is no path by which any could be.
 *
 * The structure is still the free-to-play one — a premium currency, a soft
 * currency, consumables that skip the grind, a crate with a pity counter, a
 * season pass, a membership, timed deals that fire when the game has just hurt
 * you — because that structure is genuinely good at making a shop feel alive.
 * The difference is that the currency is earned in a game you play rather than
 * bought, so the pressure the design creates lands on your Exchange balance
 * instead of your wallet.
 */
(function (ISLE) {
  'use strict';

  const CUR = { name: 'Dinollars', short: 'D$', icon: '💵' };

  /* Soft currency, earned by surviving. Priced so that the things it buys are
   * the weak versions of the things Dinollars buy. */
  const BONES_PER = {
    kill: 34,
    growthMilestone: 55,
    survive60s: 6,
    mutation: 40
  };

  /* --- consumables ------------------------------------------------------
   * `effect` is read by shop.js. The first two are the game: growth is health,
   * damage and speed, and these sell it by the tap.
   */
  const ITEMS = {
    serum: {
      id: 'serum', name: 'Growth Serum', icon: '💉', cost: 220,
      blurb: '+12% growth, instantly.', effect: { growth: 0.12 }
    },
    megaSerum: {
      id: 'megaSerum', name: 'Mega Serum', icon: '🧪', cost: 750,
      blurb: '+45% growth. Hatchling to sub-adult in one tap.', effect: { growth: 0.45 }
    },
    revive: {
      id: 'revive', name: 'Second Chance', icon: '💗', cost: 400,
      blurb: 'On death, get up where you fell at full health, keeping every point of growth and every mutation.',
      effect: { revive: 1 }
    },
    instant: {
      id: 'instant', name: 'Skip Respawn', icon: '⏭️', cost: 90,
      blurb: 'Skip the respawn timer.', effect: { skipRespawn: 1 }
    },
    adrenaline: {
      id: 'adrenaline', name: 'Adrenal Shot', icon: '❤️‍🔥', cost: 150,
      blurb: 'Full health, clears bleeding and breaks. Usable mid-fight.',
      effect: { heal: 1, clearWounds: 1 }
    },
    plating: {
      id: 'plating', name: 'Scute Plating', icon: '🛡️', cost: 260,
      blurb: '−30% damage taken for 5 minutes.', effect: { armor: 0.3, dur: 300 }
    },
    surge: {
      id: 'surge', name: 'Scent Surge', icon: '👃', cost: 120,
      blurb: 'See every animal on the map for 60 seconds.', effect: { reveal: 60 }
    },
    feast: {
      id: 'feast', name: 'Instant Feast', icon: '🍖', cost: 110,
      blurb: 'Hunger and thirst to full, wherever you are.', effect: { hunger: 100, thirst: 100 }
    },
    nest: {
      id: 'nest', name: 'Safe Nest', icon: '🥚', cost: 340,
      blurb: 'Hatch as a Juvenile (25%) instead of a hatchling, for your next 5 lives.',
      effect: { spawnGrowth: 0.25, lives: 5 }
    },
    reroll: {
      id: 'reroll', name: 'Unstable Genome', icon: '🎲', cost: 180,
      blurb: 'Reroll a mutation draft. Use it when all three offers are bad.',
      effect: { reroll: 1 }
    }
  };

  /* The bones track. Same shapes, a fifth of the strength. */
  const BONE_ITEMS = {
    serumLite: { id: 'serumLite', name: 'Weak Serum', icon: '💧', bones: 900, blurb: '+2.5% growth.', effect: { growth: 0.025 } },
    snack:     { id: 'snack',     name: 'Dried Meat', icon: '🥩', bones: 260, blurb: 'Hunger +45.', effect: { hunger: 45 } },
    gourd:     { id: 'gourd',     name: 'Water Gourd', icon: '🫗', bones: 240, blurb: 'Thirst +45.', effect: { thirst: 45 } },
    bandage:   { id: 'bandage',   name: 'Mud Pack', icon: '🩹', bones: 420, blurb: 'Stops bleeding. Does nothing for breaks.', effect: { clearBleed: 1 } }
  };

  /* --- species unlocks -------------------------------------------------- */
  const SPECIES_PRICE = {
    duskclaw: { cost: 2400, shards: 60 },
    tyrant:   { cost: 6500, shards: 150 },
    ivory:    { cost: 9000, shards: 220 }
  };

  /* --- mutation banking -------------------------------------------------
   * The bridge between the two games: Dinollars buy a mutation that survives
   * your death and starts the next run already in play.
   */
  const BANK = { cost: 600, slots: 2 };

  /* --- crates ----------------------------------------------------------- */
  const CRATE = {
    id: 'crate', name: 'Amber Crate', icon: '🎁', cost: 300, tenCost: 2700,
    pity: 50,
    table: [
      { id: 'bones',    w: 340, rarity: 'common',    name: '250 Bones',         give: { bones: 250 } },
      { id: 'skin',     w: 250, rarity: 'common',    name: 'Common skin',       give: { skin: 'common' } },
      { id: 'serum',    w: 170, rarity: 'rare',      name: 'Growth Serum',      give: { item: 'serum', n: 1 } },
      { id: 'feast',    w: 90,  rarity: 'rare',      name: 'Instant Feast',     give: { item: 'feast', n: 1 } },
      { id: 'shards',   w: 78,  rarity: 'rare',      name: '12 Species Shards', give: { shards: 12 } },
      { id: 'plating',  w: 40,  rarity: 'epic',      name: 'Scute Plating',     give: { item: 'plating', n: 1 } },
      { id: 'revive',   w: 20,  rarity: 'epic',      name: 'Second Chance',     give: { item: 'revive', n: 1 } },
      { id: 'mega',     w: 9,   rarity: 'epic',      name: 'Mega Serum',        give: { item: 'megaSerum', n: 1 } },
      { id: 'skinRare', w: 2.4, rarity: 'legendary', name: 'Legendary skin',    give: { skin: 'legendary' } },
      { id: 'species',  w: 0.6, rarity: 'legendary', name: 'PREMIUM SPECIES',   give: { species: 'random' } }
    ]
  };

  const RARITY_COLOR = { common: '#9aa6bd', rare: '#5ea9e6', epic: '#c07fe8', legendary: '#e8b23a' };

  /* --- season pass ------------------------------------------------------ */
  const PASS = {
    name: 'Apex Pass', seasonName: 'Season 4 — Bloodline',
    tiers: 40, xpPerTier: 1000, cost: 1900,
    freeReward: t => (t % 5 === 0 ? { bones: 300 } : { bones: 120 }),
    premReward: t => {
      if (t === 40) return { species: 'duskclaw' };
      if (t % 10 === 0) return { item: 'revive', n: 1 };
      if (t % 5 === 0) return { item: 'megaSerum', n: 1 };
      if (t % 2 === 0) return { item: 'serum', n: 1 };
      return { dino: 90 };
    },
    tierSkip: 130
  };

  const XP_PER = { kill: 260, growthPct: 14, survive60s: 40, plant: 6, meat: 12, mutation: 120 };

  /* --- membership -------------------------------------------------------
   * The strongest thing in the shop, because it multiplies the clock rather
   * than handing over an item. Bought with Dinollars, by the day.
   */
  const CLUB = {
    id: 'club', name: 'Apex Club', cost: 1500, hours: 24,
    growthMult: 1.25,
    respawnMult: 0.5,
    boneMult: 2,
    hungerMult: 0.85,
    exchangeMult: 1.5,
    blurb: 'A day of membership. +25% growth, half respawn timers, double bones, slower hunger, and the Exchange earns 50% more while it runs.'
  };

  /* --- deals ------------------------------------------------------------
   * Timed, and the timing is the point: each one waits for a moment the game
   * has just taken something from you. Now that the price is Dinollars, the
   * pressure lands on your Exchange balance rather than a card.
   */
  const DEALS = {
    starter: {
      id: 'starter', name: 'Starter Crate', cost: 500, secs: 900, once: true,
      give: { dino: 0, item: 'serum', n: 3, bones: 500, mutBank: 1 },
      blurb: 'Three serums, five hundred bones and a banked mutation.', trigger: 'firstDeath'
    },
    comeback: {
      id: 'comeback', name: 'Comeback Bundle', cost: 1000, secs: 600,
      give: { item: 'revive', n: 2, bones: 400 },
      blurb: 'Two Second Chances. Rough run.', trigger: 'deathStreak'
    },
    apex: {
      id: 'apex', name: 'Apex Bundle', cost: 3000, secs: 1800,
      give: { item: 'megaSerum', n: 4, shards: 40, item2: 'plating', n2: 2 },
      blurb: 'For a run that is going somewhere.', trigger: 'nearAdult'
    },
    mogul: {
      id: 'mogul', name: 'The Franchise Vault', cost: 10000, secs: 3600,
      give: { species: 'tyrant', item: 'revive', n: 6, shards: 80 },
      blurb: 'What a well-run Exchange is for.', trigger: 'richExchange'
    }
  };

  const SKINS = {
    ash:    { id: 'ash',    name: 'Ashfall',   rarity: 'common',    tint: '#8a8a8a', edge: 0 },
    moss:   { id: 'moss',   name: 'Mossback',  rarity: 'common',    tint: '#6b8a4a', edge: 0 },
    ember:  { id: 'ember',  name: 'Ember',     rarity: 'rare',      tint: '#c9663a', edge: 0.02 },
    frost:  { id: 'frost',  name: 'Hoarfrost', rarity: 'rare',      tint: '#9fc4dd', edge: 0.02 },
    void:   { id: 'void',   name: 'Voidscale', rarity: 'epic',      tint: '#4a3d6b', edge: 0.04 },
    gilded: { id: 'gilded', name: 'Gilded',    rarity: 'legendary', tint: '#d9ae4a', edge: 0.06 },
    prism:  { id: 'prism',  name: 'Prismatic', rarity: 'legendary', tint: '#b06ad0', edge: 0.06 }
  };
  const SKINS_BY_RARITY = {
    common: ['ash', 'moss'], rare: ['ember', 'frost'], epic: ['void'], legendary: ['gilded', 'prism']
  };

  /* Expected Dinollar value of one crate pull, printed in the crate panel. */
  function crateEV() {
    const worth = { bones: 0.12, shards: 22, serum: ITEMS.serum.cost, feast: ITEMS.feast.cost,
      plating: ITEMS.plating.cost, revive: ITEMS.revive.cost, megaSerum: ITEMS.megaSerum.cost };
    let total = 0, wsum = 0;
    for (const e of CRATE.table) {
      wsum += e.w;
      let v = 0;
      const g = e.give;
      if (g.bones) v += g.bones * worth.bones;
      if (g.shards) v += g.shards * worth.shards;
      if (g.item) v += (worth[g.item] || 0) * (g.n || 1);
      if (g.skin === 'common') v += 40;
      if (g.skin === 'legendary') v += 900;
      if (g.species) v += 4000;
      total += v * e.w;
    }
    return total / wsum;
  }

  ISLE.store = {
    CUR, BONES_PER, ITEMS, BONE_ITEMS, SPECIES_PRICE, BANK, CRATE, RARITY_COLOR,
    PASS, XP_PER, CLUB, DEALS, SKINS, SKINS_BY_RARITY, crateEV
  };
})(window.ISLE = window.ISLE || {});
