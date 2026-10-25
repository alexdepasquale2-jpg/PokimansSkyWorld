/* Primal Isle — mutations: the roguelike layer on the survival game.
 *
 * A life is a run. Every time you cross a growth milestone the isle offers
 * three mutations and you keep one. They stack, they interact, and they die
 * with the animal — so the twentieth hatchling is a different creature from
 * the first even though the numbers on the species card never changed.
 *
 * Everything a mutation does goes through `mods`, a flat bag of additive
 * modifiers that dino.js reads. Adding a mutation is adding a row here.
 */
(function (ISLE) {
  'use strict';
  const { clamp, pick, chance } = ISLE.core;

  /* The growth points at which the isle offers a choice. Six per run, so a
   * finished animal is carrying six mutations and a hatchling is carrying
   * none — which is most of why a grown dinosaur feels different rather than
   * just bigger. */
  const MILESTONES = [0.12, 0.22, 0.35, 0.52, 0.7, 0.88];

  const RARITY = {
    common:    { w: 100, color: '#9aa6bd', name: 'Common' },
    uncommon:  { w: 52,  color: '#6fbf7a', name: 'Uncommon' },
    rare:      { w: 22,  color: '#5ea9e6', name: 'Rare' },
    apex:      { w: 7,   color: '#e8b23a', name: 'Apex' }
  };

  /* mods keys, all additive and all read in dino.js / combat.js:
   *   dmg spd hp stamMax stamRegen stamDrain growth biteCd vision night
   *   plantFood meatFood hunger thirst armor lifesteal bleedOn bleedRes
   *   regen pack knock swim quiet lowHp ambush scavenge crit
   */
  const POOL = [
    // --- common: the bread and butter ---
    { id: 'serrated', name: 'Serrated Teeth', rarity: 'common', icon: '🦷',
      desc: '+18% bite damage.', mods: { dmg: 0.18 } },
    { id: 'longshin', name: 'Long Shins', rarity: 'common', icon: '🦵',
      desc: '+12% movement speed.', mods: { spd: 0.12 } },
    { id: 'thickhide', name: 'Thick Hide', rarity: 'common', icon: '🛡',
      desc: '−12% damage taken.', mods: { armor: 0.12 } },
    { id: 'deeplung', name: 'Deep Lungs', rarity: 'common', icon: '🌬',
      desc: '+25% stamina and it comes back faster.', mods: { stamMax: 0.25, stamRegen: 0.2 } },
    { id: 'ruminant', name: 'Ruminant Gut', rarity: 'common', icon: '🌿',
      desc: 'Plants feed you 35% better.', mods: { plantFood: 0.35 } },
    { id: 'gorge', name: 'Gorging Jaw', rarity: 'common', icon: '🍖',
      desc: 'Meat feeds you 35% better.', mods: { meatFood: 0.35 } },
    { id: 'camel', name: 'Water Belly', rarity: 'common', icon: '💧',
      desc: 'Thirst drains 25% slower.', mods: { thirst: -0.25 } },
    { id: 'slowburn', name: 'Slow Metabolism', rarity: 'common', icon: '🕯',
      desc: 'Hunger drains 25% slower.', mods: { hunger: -0.25 } },

    // --- uncommon: shapes a run ---
    { id: 'nocturnal', name: 'Nocturnal Eyes', rarity: 'uncommon', icon: '🌙',
      desc: 'You see in the dark almost as well as by day.', mods: { night: 0.45, vision: 0.1 } },
    { id: 'lowslung', name: 'Low Slung', rarity: 'uncommon', icon: '🍃',
      desc: 'Far harder to notice, especially under cover.', mods: { quiet: 0.4 } },
    { id: 'hollow', name: 'Hollow Bones', rarity: 'uncommon', icon: '🪶',
      desc: '+22% speed, −15% maximum health.', mods: { spd: 0.22, hp: -0.15 } },
    { id: 'clot', name: 'Fast Clotting', rarity: 'uncommon', icon: '🩹',
      desc: 'Bleeding does 60% less and wears off quickly.', mods: { bleedRes: 0.6 } },
    { id: 'hooked', name: 'Hooked Claws', rarity: 'uncommon', icon: '🪝',
      desc: 'Your bites bleed the target far more often.', mods: { bleedOn: 0.35 } },
    { id: 'webbed', name: 'Webbed Feet', rarity: 'uncommon', icon: '🌊',
      desc: '+45% speed in water, and you never tire swimming.', mods: { swim: 0.45 } },
    { id: 'herdcall', name: 'Herd Voice', rarity: 'uncommon', icon: '🤝',
      desc: 'Pack bonuses are twice as strong and your calls carry further.', mods: { pack: 1.0 } },
    { id: 'mend', name: 'Knitting Flesh', rarity: 'uncommon', icon: '✨',
      desc: 'You heal steadily even while hungry.', mods: { regen: 1.4 } },
    { id: 'ironstom', name: 'Iron Stomach', rarity: 'uncommon', icon: '🪨',
      desc: 'Rotten meat is as good as fresh, and salt water no longer sickens you.',
      mods: { scavenge: 1, saltproof: 1 } },

    // --- rare: the run turns a corner ---
    { id: 'ambusher', name: 'Ambush Predator', rarity: 'rare', icon: '🎯',
      desc: 'Your first bite on a target that has not been hit yet does double damage.',
      mods: { ambush: 1.0 } },
    { id: 'adrenal', name: 'Adrenal Glands', rarity: 'rare', icon: '❤️‍🔥',
      desc: 'Below a third health: +35% damage and +20% speed.', mods: { lowHp: 1 } },
    { id: 'leech', name: 'Feeding Frenzy', rarity: 'rare', icon: '🧛',
      desc: 'Every bite heals you for 22% of the damage dealt.', mods: { lifesteal: 0.22 } },
    { id: 'batter', name: 'Battering Skull', rarity: 'rare', icon: '💥',
      desc: 'Your bites throw what they hit, hard.', mods: { knock: 55 } },
    { id: 'fastgrow', name: 'Rapid Ontogeny', rarity: 'rare', icon: '🌱',
      desc: '+40% growth rate.', mods: { growth: 0.4 } },
    { id: 'quickjaw', name: 'Quick Jaw', rarity: 'rare', icon: '⚡',
      desc: 'Bite cooldown cut by 28%.', mods: { biteCd: -0.28 } },
    { id: 'sentinel', name: 'Sentinel Sense', rarity: 'rare', icon: '👁',
      desc: '+45% sight range. You see them coming.', mods: { vision: 0.45 } },

    // --- apex: one per run, if you are lucky ---
    { id: 'titanic', name: 'Titanic Frame', rarity: 'apex', icon: '🗿',
      desc: '+45% health and −20% damage taken. Everything is slower.',
      mods: { hp: 0.45, armor: 0.2, spd: -0.1 } },
    { id: 'apexpred', name: 'Apex Instinct', rarity: 'apex', icon: '👑',
      desc: '+35% damage, +15% speed, and killing something heals you completely.',
      mods: { dmg: 0.35, spd: 0.15, killheal: 1 } },
    { id: 'undying', name: 'Undying', rarity: 'apex', icon: '🔥',
      desc: 'Once per life, a killing blow leaves you at 1 health instead.',
      mods: { undying: 1 } },
    { id: 'photosyn', name: 'Symbiotic Algae', rarity: 'apex', icon: '☀️',
      desc: 'You slowly feed and water yourself in daylight.', mods: { photo: 1 } }
  ];

  const BY_ID = {};
  for (const m of POOL) BY_ID[m.id] = m;

  /* Sum every mutation into one flat bag, cached on the animal. Called
   * whenever the list changes rather than every frame. */
  function recompute(d) {
    const mods = {};
    for (const id of (d.muts || [])) {
      const m = BY_ID[id];
      if (!m) continue;
      for (const k in m.mods) mods[k] = (mods[k] || 0) + m.mods[k];
    }
    d.mods = mods;
    return mods;
  }

  function mod(d, key) { return (d.mods && d.mods[key]) || 0; }
  function has(d, id) { return (d.muts || []).indexOf(id) >= 0; }

  /* Three offers, weighted by rarity, never a duplicate of what is already
   * carried. A run that is going well gets offered better things — the last
   * two milestones tilt the weights, so finishing a run is worth doing. */
  function offer(d, milestoneIndex) {
    const owned = d.muts || [];
    const pool = POOL.filter(m => owned.indexOf(m.id) < 0);
    const lateBias = milestoneIndex >= 3 ? 2.2 : 1;
    const out = [];
    for (let n = 0; n < 3 && pool.length; n++) {
      let total = 0;
      for (const m of pool) {
        const r = RARITY[m.rarity];
        total += r.w * (m.rarity === 'rare' || m.rarity === 'apex' ? lateBias : 1);
      }
      let roll = Math.random() * total;
      let chosen = pool[0];
      for (const m of pool) {
        const r = RARITY[m.rarity];
        roll -= r.w * (m.rarity === 'rare' || m.rarity === 'apex' ? lateBias : 1);
        if (roll <= 0) { chosen = m; break; }
      }
      out.push(chosen);
      pool.splice(pool.indexOf(chosen), 1);
    }
    return out;
  }

  function take(d, id) {
    d.muts = d.muts || [];
    if (d.muts.indexOf(id) >= 0) return false;
    d.muts.push(id);
    recompute(d);
    return true;
  }

  /* Milestone bookkeeping. Returns the index of a milestone just crossed, or
   * -1. The draft itself is raised by sim.js so the harness can auto-pick. */
  function pending(d) {
    const done = d.mutMiles || 0;
    if (done >= MILESTONES.length) return -1;
    return d.growth >= MILESTONES[done] ? done : -1;
  }
  function markTaken(d) { d.mutMiles = (d.mutMiles || 0) + 1; }

  /* The lobby mutates too. A grown rival carrying two or three of these is
   * why an adult is frightening rather than merely large. */
  function seedAi(d) {
    d.muts = [];
    const n = d.growth > 0.75 ? 3 : d.growth > 0.45 ? 2 : d.growth > 0.2 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const m = pick(POOL.filter(x => x.rarity !== 'apex' || chance(0.15)));
      if (m) take(d, m.id);
    }
    recompute(d);
  }

  ISLE.mutations = {
    POOL, BY_ID, RARITY, MILESTONES, recompute, mod, has, offer, take,
    pending, markTaken, seedAi
  };
})(window.ISLE = window.ISLE || {});
