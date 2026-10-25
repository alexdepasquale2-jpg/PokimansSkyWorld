/* DoomSpire — every static number in the game: classes, talents, items,
 * the bestiary, the four maps, quests, professions and factions.
 *
 * Nothing in here touches the DOM or the canvas. It is a book of facts that
 * every other module reads from, exactly the role PrimalIsle's content.js
 * plays for that game.
 */
(function (DS) {
  'use strict';
  const C = DS.core;

  const LEVEL_CAP = 30;
  const TALENT_START_LEVEL = 10;

  // --- gear slots & quality --------------------------------------------------
  const SLOTS = [
    'head', 'neck', 'shoulder', 'cloak', 'chest', 'wrist', 'hands', 'waist',
    'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand'
  ];
  const SLOT_WEIGHT = {
    head: 1, neck: 0.5, shoulder: 0.75, cloak: 0.5, chest: 1, wrist: 0.4,
    hands: 0.6, waist: 0.6, legs: 1, feet: 0.75, ring1: 0.5, ring2: 0.5,
    trinket1: 0.6, trinket2: 0.6, mainhand: 1.25, offhand: 0.85
  };
  const QUALITIES = [
    { key: 'poor', name: 'Poor', color: '#9d9d9d', mult: 0.6, weight: 0 },
    { key: 'common', name: 'Common', color: '#e6ecf7', mult: 1.0, weight: 60 },
    { key: 'uncommon', name: 'Uncommon', color: '#1eff00', mult: 1.4, weight: 30 },
    { key: 'rare', name: 'Rare', color: '#2f9dff', mult: 1.9, weight: 8.5 },
    { key: 'epic', name: 'Epic', color: '#c86dff', mult: 2.6, weight: 1.4 },
    { key: 'legendary', name: 'Legendary', color: '#ff8000', mult: 3.6, weight: 0.1 }
  ];
  const QUALITY_BY_KEY = Object.fromEntries(QUALITIES.map(q => [q.key, q]));

  function rollQuality(rng, floorKey) {
    const floorIdx = floorKey ? QUALITIES.findIndex(q => q.key === floorKey) : 1;
    const pool = QUALITIES.filter((q, i) => i >= Math.max(1, floorIdx) && q.weight > 0);
    const total = pool.reduce((s, q) => s + q.weight, 0);
    let r = rng() * total;
    for (const q of pool) { if ((r -= q.weight) <= 0) return q.key; }
    return pool[0].key;
  }

  /* Stat budget for a rolled item: level, slot and quality all scale it, then
   * the budget is spread over a primary pool (armor type/class flavour),
   * stamina (always present — nobody wants a purely offensive MMO), and a
   * chance at one secondary rating. */
  function rollItem(rng, ilvl, slot, qKey, styleHint) {
    qKey = qKey || rollQuality(rng);
    const q = QUALITY_BY_KEY[qKey];
    const w = SLOT_WEIGHT[slot] || 0.6;
    const budget = Math.max(1, Math.round(ilvl * 0.9 * q.mult * w));
    const isWeapon = slot === 'mainhand' || slot === 'offhand';
    const primaryPool = styleHint === 'str' ? ['str'] : styleHint === 'agi' ? ['agi'] : styleHint === 'int' ? ['int'] : ['str', 'agi', 'int'];
    const primary = primaryPool.length === 1 ? primaryPool[0] : primaryPool[Math.floor(rng() * primaryPool.length)];
    const stats = {};
    const staShare = isWeapon ? 0 : Math.round(budget * 0.35);
    const primShare = Math.round(budget * (isWeapon ? 0.55 : 0.4));
    if (staShare) stats.sta = staShare;
    if (primShare) stats[primary] = primShare;
    let rest = budget - staShare - primShare;
    if (!isWeapon) { stats.armor = Math.round(budget * 1.8); rest = Math.max(0, rest); }
    if (rest > 0 && rng() < 0.75) {
      const sec = rng() < 0.5 ? 'crit' : 'haste';
      stats[sec] = (stats[sec] || 0) + rest;
    } else if (rest > 0) {
      stats[primary] = (stats[primary] || 0) + rest;
    }
    let dmgLo = 0, dmgHi = 0, speed = 0;
    if (isWeapon) {
      speed = slot === 'offhand' ? 1.8 + rng() * 0.6 : 2.2 + rng() * 1.2;
      const dps = 1.1 * ilvl * q.mult;
      dmgLo = Math.max(1, Math.round(dps * speed * 0.8));
      dmgHi = Math.round(dps * speed * 1.2);
    }
    const name = nameItem(rng, slot, q, styleHint);
    return {
      iid: 'i' + Math.floor(rng() * 1e9).toString(36),
      name, slot, quality: qKey, ilvl, stats, dmgLo, dmgHi, speed,
      sell: Math.max(1, Math.round(budget * q.mult * (isWeapon ? 3 : 1.6)))
    };
  }

  const NAME_PREFIX = {
    poor: ['Battered', 'Cracked', 'Worn'],
    common: ['Sturdy', 'Plain', 'Trusty'],
    uncommon: ['Vigil-Marked', 'Ashwrought', 'Warden’s'],
    rare: ['Bloomforged', 'Frostbound', 'Sigil-Etched'],
    epic: ['Hollowbane', 'Emberfall', 'Wraithcarved'],
    legendary: ['Kingsbane', 'Doomspire', 'the Last Vigil’s']
  };
  const NAME_NOUN = {
    head: ['Helm', 'Crown', 'Hood'], neck: ['Talisman', 'Chain', 'Amulet'],
    shoulder: ['Mantle', 'Pauldrons', 'Spaulders'], cloak: ['Cloak', 'Cape', 'Drape'],
    chest: ['Cuirass', 'Vestment', 'Hauberk'], wrist: ['Bracers', 'Wraps', 'Vambraces'],
    hands: ['Gauntlets', 'Gloves', 'Grips'], waist: ['Girdle', 'Belt', 'Sash'],
    legs: ['Legplates', 'Leggings', 'Greaves'], feet: ['Sabatons', 'Boots', 'Treads'],
    ring1: ['Band', 'Signet', 'Loop'], ring2: ['Band', 'Signet', 'Loop'],
    trinket1: ['Charm', 'Relic', 'Idol'], trinket2: ['Charm', 'Relic', 'Idol'],
    mainhand: ['Blade', 'Warhammer', 'Staff', 'Bow', 'Dagger'],
    offhand: ['Shield', 'Tome', 'Off-Blade']
  };
  function nameItem(rng, slot, q, styleHint) {
    const p = C.pick(NAME_PREFIX[q.key]);
    const n = C.pick(NAME_NOUN[slot]);
    return `${p} ${n}`;
  }

  const CURATED_ITEMS = {
    ashguard_cinderplate: { iid: 'u_ashguard', name: 'Ashguard Cinderplate', slot: 'chest', quality: 'rare', ilvl: 10, stats: { str: 9, sta: 14, armor: 120 }, sell: 40 },
    vigils_blessed_ring: { iid: 'u_vigilring', name: 'Vigil’s Blessed Ring', slot: 'ring1', quality: 'uncommon', ilvl: 8, stats: { int: 6, sta: 6 }, sell: 22 },
    bloomreach_wardstaff: { iid: 'u_wardstaff', name: 'Bloomreach Wardstaff', slot: 'mainhand', quality: 'rare', ilvl: 16, stats: { int: 14, sta: 8 }, dmgLo: 22, dmgHi: 34, speed: 2.9, sell: 70 },
    frostmarch_bulwark: { iid: 'u_bulwark', name: 'Frostmarch Bulwark', slot: 'offhand', quality: 'rare', ilvl: 20, stats: { sta: 20, armor: 220 }, sell: 80 },
    vault_sigil: { iid: 'u_sigil', name: 'Vault Sigil', slot: null, quality: 'uncommon', ilvl: 0, stats: {}, sell: 0, questItem: true },
    sulfur_shard: { iid: 'u_sulfur', name: 'Sulfur Shard', slot: null, quality: 'common', ilvl: 0, stats: {}, sell: 1, questItem: true },
    hollow_kings_crown: { iid: 'u_hkcrown', name: 'The Hollow King’s Crown', slot: 'head', quality: 'epic', ilvl: 28, stats: { sta: 22, int: 16, crit: 10 }, sell: 220 }
  };

  // --- classes ----------------------------------------------------------------
  /* Ability `kind` and flags are read generically by combat.js so adding a
   * class means adding data here, not new engine code. */
  const CLASSES = {
    warrior: {
      id: 'warrior', name: 'Warrior', icon: '⚔️', resource: 'rage', armor: 'plate', role: 'Melee / Tank',
      primary: 'str', growth: { str: 2.4, agi: 1.1, int: 0.3, sta: 2.0, spirit: 0.4 },
      blurb: 'Rage builds in the swing of the fight and burns fast once it does.',
      abilities: [
        { id: 'w_heroic', name: 'Heroic Strike', icon: '🗡️', kind: 'melee', cost: 15, cd: 0, range: 1.6, power: 1.6, scalesWith: 'ap' },
        { id: 'w_rend', name: 'Rend', icon: '🩸', kind: 'melee', cost: 10, cd: 6, range: 1.6, power: 0.5, scalesWith: 'ap', dot: { ticks: 4, interval: 3 } },
        { id: 'w_charge', name: 'Charge', icon: '💨', kind: 'gap', cost: 0, cd: 15, range: 8, rageGen: 20 },
        { id: 'w_shieldblock', name: 'Shield Block', icon: '🛡️', kind: 'buff', cost: 10, cd: 20, self: true, buff: { armorPct: 0.35, dur: 5 } },
        { id: 'w_shout', name: 'Battle Shout', icon: '📣', kind: 'buff', cost: 5, cd: 30, self: true, buff: { apFlat: 25, dur: 120 } },
        { id: 'w_execute', name: 'Execute', icon: '💀', kind: 'melee', cost: 15, cd: 0, range: 1.6, power: 3.2, scalesWith: 'ap', execute: 0.2 },
        { id: 'w_bloodthirst', name: 'Bloodthirst', icon: '🪣', kind: 'melee', cost: 30, cd: 6, range: 1.6, power: 2.0, scalesWith: 'ap', lifeStealPct: 0.25, requiresTalent: 'w_t5' }
      ],
      talents: [
        { id: 'w_t1a', tier: 1, name: 'Improved Heroic Strike', icon: '🗡️', maxRank: 3, desc: 'Heroic Strike costs less rage.', mod: { key: 'w_heroic.costPct', perRank: -0.08 } },
        { id: 'w_t1b', tier: 1, name: 'Deflection', icon: '🩹', maxRank: 3, desc: '+ parry chance.', mod: { key: 'parry', perRank: 0.02 } },
        { id: 'w_t1c', tier: 1, name: 'Booming Voice', icon: '📣', maxRank: 3, desc: 'Battle Shout lasts longer.', mod: { key: 'w_shout.durPct', perRank: 0.2 } },
        { id: 'w_t2a', tier: 2, name: 'Improved Rend', icon: '🩸', maxRank: 3, desc: '+ Rend damage.', mod: { key: 'w_rend.powerPct', perRank: 0.12 } },
        { id: 'w_t2b', tier: 2, name: 'Anger Management', icon: '🔥', maxRank: 3, desc: 'Rage drains slower out of combat.', mod: { key: 'rageDecayPct', perRank: -0.15 } },
        { id: 'w_t2c', tier: 2, name: 'Toughness', icon: '🪖', maxRank: 3, desc: '+ armor from all sources.', mod: { key: 'armorPct', perRank: 0.05 } },
        { id: 'w_t3a', tier: 3, name: 'Unbridled Wrath', icon: '💢', maxRank: 5, desc: 'Chance to gain rage on hit.', mod: { key: 'rageOnHitChance', perRank: 0.06 } },
        { id: 'w_t3b', tier: 3, name: 'Improved Execute', icon: '💀', maxRank: 2, desc: 'Execute usable below a higher health threshold.', mod: { key: 'w_execute.executeThreshold', perRank: 0.05 } },
        { id: 'w_t4a', tier: 4, name: 'Death Wish', icon: '🖤', maxRank: 1, desc: 'Active: +20% damage dealt, +10% damage taken, 15s.', unlockAbility: { id: 'w_deathwish', name: 'Death Wish', icon: '🖤', kind: 'buff', cost: 10, cd: 90, self: true, buff: { dmgPct: 0.2, dmgTakenPct: 0.1, dur: 15 } } },
        { id: 'w_t4b', tier: 4, name: 'Blood Craze', icon: '🩸', maxRank: 3, desc: 'Heal a sliver of max health when you land a crit.', mod: { key: 'critHealPct', perRank: 0.01 } },
        { id: 'w_t5', tier: 5, name: 'Bloodthirst', icon: '🪣', maxRank: 1, desc: 'Unlocks Bloodthirst — a rage-hungry strike that heals you.', capstone: true }
      ]
    },
    paladin: {
      id: 'paladin', name: 'Paladin', icon: '🛡️', resource: 'mana', armor: 'plate', role: 'Melee / Heal / Tank',
      primary: 'str', growth: { str: 1.8, agi: 0.6, int: 1.6, sta: 1.8, spirit: 1.2 },
      blurb: 'Holy light and plate armor. Slow to fall, slower to give up.',
      abilities: [
        { id: 'p_judge', name: 'Judgement', icon: '⚖️', kind: 'melee', cost: 18, cd: 8, range: 1.6, power: 1.4, scalesWith: 'sp' },
        { id: 'p_holylight', name: 'Holy Light', icon: '✨', kind: 'heal', cost: 30, cd: 0, castTime: 2.2, range: 20, power: 2.6, scalesWith: 'sp' },
        { id: 'p_flash', name: 'Flash of Light', icon: '💡', kind: 'heal', cost: 18, cd: 0, castTime: 1.2, range: 20, power: 1.3, scalesWith: 'sp' },
        { id: 'p_conc', name: 'Consecration', icon: '🔆', kind: 'aoe', cost: 22, cd: 8, range: 0, power: 0.7, scalesWith: 'sp', dot: { ticks: 4, interval: 1 } },
        { id: 'p_might', name: 'Blessing of Might', icon: '💪', kind: 'buff', cost: 15, cd: 30, self: true, buff: { apFlat: 30, dur: 180 } },
        { id: 'p_shield', name: 'Divine Shield', icon: '❇️', kind: 'buff', cost: 10, cd: 300, self: true, buff: { immune: true, dur: 8 } },
        { id: 'p_holyshock', name: 'Holy Shock', icon: '⚡', kind: 'heal', cost: 28, cd: 6, range: 20, power: 2.0, scalesWith: 'sp', requiresTalent: 'p_t5' }
      ],
      talents: [
        { id: 'p_t1a', tier: 1, name: 'Improved Judgement', icon: '⚖️', maxRank: 3, desc: '- Judgement cooldown.', mod: { key: 'p_judge.cdPct', perRank: -0.1 } },
        { id: 'p_t1b', tier: 1, name: 'Divine Intellect', icon: '📘', maxRank: 3, desc: '+ Intellect.', mod: { key: 'statPct.int', perRank: 0.03 } },
        { id: 'p_t1c', tier: 1, name: 'Redoubt', icon: '🩹', maxRank: 3, desc: '+ block chance.', mod: { key: 'block', perRank: 0.02 } },
        { id: 'p_t2a', tier: 2, name: 'Improved Blessing of Might', icon: '💪', maxRank: 3, desc: '+ Blessing of Might attack power.', mod: { key: 'p_might.apFlatPct', perRank: 0.15 } },
        { id: 'p_t2b', tier: 2, name: 'Illumination', icon: '🌟', maxRank: 3, desc: 'Healing crits refund mana.', mod: { key: 'healCritManaRefundPct', perRank: 0.15 } },
        { id: 'p_t2c', tier: 2, name: 'Sanctity Aura', icon: '🌞', maxRank: 3, desc: '+ holy damage dealt.', mod: { key: 'holyDmgPct', perRank: 0.03 } },
        { id: 'p_t3a', tier: 3, name: 'Seal of Command', icon: '🧷', maxRank: 3, desc: 'Melee hits proc bonus holy damage.', mod: { key: 'sealOfCommandChance', perRank: 0.06 } },
        { id: 'p_t3b', tier: 3, name: 'Consecrated Ground', icon: '🔆', maxRank: 2, desc: '+ Consecration damage.', mod: { key: 'p_conc.powerPct', perRank: 0.15 } },
        { id: 'p_t4a', tier: 4, name: 'Improved Holy Light', icon: '✨', maxRank: 2, desc: '+ Holy Light healing.', mod: { key: 'p_holylight.powerPct', perRank: 0.1 } },
        { id: 'p_t4b', tier: 4, name: 'Sacred Duty', icon: '🛡️', maxRank: 3, desc: '+ Stamina.', mod: { key: 'statPct.sta', perRank: 0.03 } },
        { id: 'p_t5', tier: 5, name: 'Holy Shock', icon: '⚡', maxRank: 1, desc: 'Unlocks Holy Shock — instant light that heals or burns.', capstone: true }
      ]
    },
    hunter: {
      id: 'hunter', name: 'Hunter', icon: '🏹', resource: 'mana', armor: 'mail', role: 'Ranged DPS',
      primary: 'agi', growth: { str: 1.0, agi: 2.3, int: 0.9, sta: 1.5, spirit: 0.8 },
      blurb: 'Never lets anything get close enough to matter.',
      abilities: [
        { id: 'h_arcane', name: 'Arcane Shot', icon: '🏹', kind: 'ranged', cost: 20, cd: 0, range: 18, power: 1.5, scalesWith: 'ap' },
        { id: 'h_multi', name: 'Multi-Shot', icon: '🏹', kind: 'aoe', cost: 30, cd: 10, range: 18, power: 1.1, scalesWith: 'ap' },
        { id: 'h_serpent', name: 'Serpent Sting', icon: '🐍', kind: 'ranged', cost: 15, cd: 0, range: 18, power: 0.35, scalesWith: 'ap', dot: { ticks: 5, interval: 3 } },
        { id: 'h_concuss', name: 'Concussive Shot', icon: '❄️', kind: 'ranged', cost: 12, cd: 8, range: 18, power: 0.6, scalesWith: 'ap', snarePct: 0.5, snareDur: 4 },
        { id: 'h_aimed', name: 'Aimed Shot', icon: '🎯', kind: 'ranged', cost: 30, cd: 6, castTime: 1.6, range: 24, power: 2.4, scalesWith: 'ap' },
        { id: 'h_feign', name: 'Feign Death', icon: '💀', kind: 'utility', cost: 10, cd: 30, self: true, dropAggro: true },
        { id: 'h_barrage', name: 'Barrage', icon: '💫', kind: 'aoe', cost: 35, cd: 15, range: 18, power: 2.0, scalesWith: 'ap', requiresTalent: 'h_t5' }
      ],
      talents: [
        { id: 'h_t1a', tier: 1, name: 'Improved Arcane Shot', icon: '🏹', maxRank: 3, desc: '+ Arcane Shot damage.', mod: { key: 'h_arcane.powerPct', perRank: 0.1 } },
        { id: 'h_t1b', tier: 1, name: 'Efficiency', icon: '📘', maxRank: 3, desc: '- ability mana costs.', mod: { key: 'costPct', perRank: -0.05 } },
        { id: 'h_t1c', tier: 1, name: 'Lethal Shots', icon: '🎯', maxRank: 3, desc: '+ ranged crit chance.', mod: { key: 'rangedCrit', perRank: 0.02 } },
        { id: 'h_t2a', tier: 2, name: 'Improved Serpent Sting', icon: '🐍', maxRank: 3, desc: '+ Serpent Sting damage.', mod: { key: 'h_serpent.powerPct', perRank: 0.12 } },
        { id: 'h_t2b', tier: 2, name: 'Careful Aim', icon: '👁️', maxRank: 3, desc: '+ crit chance vs targets above 80% health.', mod: { key: 'carefulAimCrit', perRank: 0.05 } },
        { id: 'h_t2c', tier: 2, name: 'Endurance Training', icon: '🩶', maxRank: 3, desc: '+ Stamina.', mod: { key: 'statPct.sta', perRank: 0.03 } },
        { id: 'h_t3a', tier: 3, name: 'Rapid Killing', icon: '⏱️', maxRank: 2, desc: '- Aimed Shot cooldown.', mod: { key: 'h_aimed.cdPct', perRank: -0.15 } },
        { id: 'h_t3b', tier: 3, name: 'Deterrence', icon: '🛡️', maxRank: 3, desc: '+ armor.', mod: { key: 'armorPct', perRank: 0.04 } },
        { id: 'h_t4a', tier: 4, name: 'Trueshot', icon: '🏹', maxRank: 2, desc: '+ attack power.', mod: { key: 'apFlatPerRank', perRank: 12 } },
        { id: 'h_t4b', tier: 4, name: 'Survivalist', icon: '❤️', maxRank: 3, desc: '+ max health.', mod: { key: 'healthPct', perRank: 0.03 } },
        { id: 'h_t5', tier: 5, name: 'Barrage', icon: '💫', maxRank: 1, desc: 'Unlocks Barrage — a spread of arrows across every target ahead.', capstone: true }
      ]
    },
    mage: {
      id: 'mage', name: 'Mage', icon: '🔥', resource: 'mana', armor: 'cloth', role: 'Ranged DPS',
      primary: 'int', growth: { str: 0.5, agi: 0.8, int: 2.5, sta: 1.2, spirit: 1.6 },
      blurb: 'Fire, frost, and a way out of any room.',
      abilities: [
        { id: 'm_frostbolt', name: 'Frostbolt', icon: '❄️', kind: 'ranged', cost: 20, cd: 0, castTime: 1.6, range: 22, power: 1.7, scalesWith: 'sp', snarePct: 0.3, snareDur: 4 },
        { id: 'm_fireball', name: 'Fireball', icon: '🔥', kind: 'ranged', cost: 26, cd: 0, castTime: 2.0, range: 22, power: 2.1, scalesWith: 'sp' },
        { id: 'm_fireblast', name: 'Fire Blast', icon: '💥', kind: 'ranged', cost: 18, cd: 8, range: 18, power: 1.3, scalesWith: 'sp' },
        { id: 'm_frostnova', name: 'Frost Nova', icon: '❆️', kind: 'aoe', cost: 20, cd: 25, range: 5, power: 0.4, scalesWith: 'sp', rootDur: 5 },
        { id: 'm_arcane', name: 'Arcane Missiles', icon: '✨', kind: 'ranged', cost: 30, cd: 0, castTime: 2.4, range: 22, power: 2.6, scalesWith: 'sp' },
        { id: 'm_barrier', name: 'Ice Barrier', icon: '🧊', kind: 'buff', cost: 24, cd: 30, self: true, buff: { shield: 2.0, dur: 60, scalesWith: 'sp' } },
        { id: 'm_blink', name: 'Blink', icon: '🌀', kind: 'gap', cost: 10, cd: 15, range: 6, blink: true },
        { id: 'm_pyroblast', name: 'Pyroblast', icon: '☄️', kind: 'ranged', cost: 40, cd: 8, castTime: 3.0, range: 22, power: 3.6, scalesWith: 'sp', requiresTalent: 'm_t5' }
      ],
      talents: [
        { id: 'm_t1a', tier: 1, name: 'Improved Fireball', icon: '🔥', maxRank: 3, desc: '- Fireball cast time.', mod: { key: 'm_fireball.castPct', perRank: -0.08 } },
        { id: 'm_t1b', tier: 1, name: 'Piercing Ice', icon: '❄️', maxRank: 3, desc: '+ frost damage.', mod: { key: 'frostDmgPct', perRank: 0.04 } },
        { id: 'm_t1c', tier: 1, name: 'Arcane Focus', icon: '📘', maxRank: 3, desc: '- ability mana costs.', mod: { key: 'costPct', perRank: -0.05 } },
        { id: 'm_t2a', tier: 2, name: 'Ignite', icon: '🔥', maxRank: 3, desc: 'Fire crits leave a burning dot.', mod: { key: 'ignitePct', perRank: 0.12 } },
        { id: 'm_t2b', tier: 2, name: 'Arcane Concentration', icon: '✨', maxRank: 3, desc: 'Chance for your next cast to be instant.', mod: { key: 'clearcastChance', perRank: 0.03 } },
        { id: 'm_t2c', tier: 2, name: 'Frost Warding', icon: '🧊', maxRank: 3, desc: '+ armor.', mod: { key: 'armorPct', perRank: 0.04 } },
        { id: 'm_t3a', tier: 3, name: 'Improved Blink', icon: '🌀', maxRank: 2, desc: '- Blink cooldown.', mod: { key: 'm_blink.cdPct', perRank: -0.25 } },
        { id: 'm_t3b', tier: 3, name: 'Winter’s Chill', icon: '❆️', maxRank: 3, desc: '+ crit chance vs snared targets.', mod: { key: 'critVsSnaredPct', perRank: 0.03 } },
        { id: 'm_t4a', tier: 4, name: 'Arcane Instability', icon: '💫', maxRank: 3, desc: '+ spell damage and crit.', mod: { key: 'spellDmgPct', perRank: 0.02 } },
        { id: 'm_t4b', tier: 4, name: 'Presence of Mind', icon: '🧠', maxRank: 3, desc: '+ max mana.', mod: { key: 'manaPct', perRank: 0.04 } },
        { id: 'm_t5', tier: 5, name: 'Pyroblast', icon: '☄️', maxRank: 1, desc: 'Unlocks Pyroblast — a slow, devastating bolt of fire.', capstone: true }
      ]
    },
    priest: {
      id: 'priest', name: 'Priest', icon: '✝️', resource: 'mana', armor: 'cloth', role: 'Heal / Shadow DPS',
      primary: 'int', growth: { str: 0.5, agi: 0.7, int: 2.3, sta: 1.3, spirit: 2.0 },
      blurb: 'Light for the party, shadow for everyone else.',
      abilities: [
        { id: 'pr_smite', name: 'Smite', icon: '☀️', kind: 'ranged', cost: 18, cd: 0, castTime: 1.8, range: 20, power: 1.6, scalesWith: 'sp' },
        { id: 'pr_heal', name: 'Heal', icon: '💚', kind: 'heal', cost: 26, cd: 0, castTime: 2.4, range: 20, power: 2.4, scalesWith: 'sp' },
        { id: 'pr_pws', name: 'Power Word: Shield', icon: '🛡️', kind: 'buff', cost: 20, cd: 4, range: 20, buff: { shield: 1.6, dur: 30, scalesWith: 'sp' } },
        { id: 'pr_renew', name: 'Renew', icon: '💚', kind: 'heal', cost: 16, cd: 0, range: 20, power: 0.5, scalesWith: 'sp', dot: { ticks: 5, interval: 3, heal: true } },
        { id: 'pr_mindblast', name: 'Mind Blast', icon: '🧠', kind: 'ranged', cost: 22, cd: 8, range: 20, power: 1.8, scalesWith: 'sp' },
        { id: 'pr_swp', name: 'Shadow Word: Pain', icon: '🌑', kind: 'ranged', cost: 14, cd: 0, range: 20, power: 0.3, scalesWith: 'sp', dot: { ticks: 6, interval: 3 } },
        { id: 'pr_fade', name: 'Fade', icon: '👻', kind: 'utility', cost: 8, cd: 30, self: true, dropAggro: true },
        { id: 'pr_mindflay', name: 'Mind Flay', icon: '🌀', kind: 'ranged', cost: 24, cd: 6, castTime: 3.0, range: 20, power: 2.4, scalesWith: 'sp', requiresTalent: 'pr_t5' }
      ],
      talents: [
        { id: 'pr_t1a', tier: 1, name: 'Improved Healing', icon: '💚', maxRank: 3, desc: '+ Heal and Renew power.', mod: { key: 'healPowerPct', perRank: 0.04 } },
        { id: 'pr_t1b', tier: 1, name: 'Spirit Tap', icon: '🌬️', maxRank: 3, desc: '+ mana regen from Spirit.', mod: { key: 'statPct.spirit', perRank: 0.03 } },
        { id: 'pr_t1c', tier: 1, name: 'Improved Shield', icon: '🛡️', maxRank: 3, desc: '+ Power Word: Shield absorb.', mod: { key: 'pr_pws.shieldPct', perRank: 0.1 } },
        { id: 'pr_t2a', tier: 2, name: 'Shadow Weaving', icon: '🌑', maxRank: 5, desc: 'Shadow Word: Pain stacks shadow damage taken.', mod: { key: 'shadowWeavingPct', perRank: 0.02 } },
        { id: 'pr_t2b', tier: 2, name: 'Meditation', icon: '🧠', maxRank: 3, desc: 'Regenerate mana while casting.', mod: { key: 'manaRegenWhileCastingPct', perRank: 0.1 } },
        { id: 'pr_t2c', tier: 2, name: 'Twin Disciplines', icon: '✝️', maxRank: 3, desc: '+ spell damage and healing.', mod: { key: 'spellDmgPct', perRank: 0.02 } },
        { id: 'pr_t3a', tier: 3, name: 'Improved Mind Blast', icon: '🧠', maxRank: 2, desc: '- Mind Blast cooldown.', mod: { key: 'pr_mindblast.cdPct', perRank: -0.15 } },
        { id: 'pr_t3b', tier: 3, name: 'Martyrdom', icon: '❤️', maxRank: 3, desc: '+ max health.', mod: { key: 'healthPct', perRank: 0.03 } },
        { id: 'pr_t4a', tier: 4, name: 'Searing Light', icon: '☀️', maxRank: 2, desc: '+ Smite and Holy damage.', mod: { key: 'holyDmgPct', perRank: 0.05 } },
        { id: 'pr_t4b', tier: 4, name: 'Focused Will', icon: '🛡️', maxRank: 3, desc: '- damage taken while below 50% health.', mod: { key: 'lowHealthMitigationPct', perRank: 0.03 } },
        { id: 'pr_t5', tier: 5, name: 'Mind Flay', icon: '🌀', maxRank: 1, desc: 'Unlocks Mind Flay — a channelled lash of shadow.', capstone: true }
      ]
    },
    rogue: {
      id: 'rogue', name: 'Rogue', icon: '🗡️', resource: 'energy', armor: 'leather', role: 'Melee DPS',
      primary: 'agi', growth: { str: 1.2, agi: 2.4, int: 0.4, sta: 1.6, spirit: 0.5 },
      blurb: 'Energy regenerates fast. Combo points are what you do with it.',
      comboPoints: true,
      abilities: [
        { id: 'r_sinister', name: 'Sinister Strike', icon: '🗡️', kind: 'melee', cost: 40, cd: 0, range: 1.6, power: 1.2, scalesWith: 'ap', generatesCombo: 1 },
        { id: 'r_backstab', name: 'Backstab', icon: '🔪', kind: 'melee', cost: 55, cd: 0, range: 1.6, power: 1.7, scalesWith: 'ap', generatesCombo: 1 },
        { id: 'r_eviscerate', name: 'Eviscerate', icon: '💢', kind: 'melee', cost: 35, cd: 0, range: 1.6, power: 1.1, scalesWith: 'ap', finisher: true },
        { id: 'r_rupture', name: 'Rupture', icon: '🪨', kind: 'melee', cost: 30, cd: 0, range: 1.6, power: 0.5, scalesWith: 'ap', finisher: true, dot: { ticks: 4, interval: 2 } },
        { id: 'r_sprint', name: 'Sprint', icon: '💨', kind: 'buff', cost: 0, cd: 120, self: true, buff: { speedPct: 0.5, dur: 15 } },
        { id: 'r_kick', name: 'Kick', icon: '🦵', kind: 'melee', cost: 25, cd: 10, range: 1.6, power: 0.2, scalesWith: 'ap', interrupt: true },
        { id: 'r_evasion', name: 'Evasion', icon: '💨', kind: 'buff', cost: 0, cd: 90, self: true, buff: { dodgeFlat: 0.5, dur: 10 } },
        { id: 'r_adrenaline', name: 'Adrenaline Rush', icon: '⚡', kind: 'buff', cost: 0, cd: 120, self: true, buff: { energyRegenPct: 1.0, dur: 15 }, requiresTalent: 'r_t5' }
      ],
      talents: [
        { id: 'r_t1a', tier: 1, name: 'Improved Sinister Strike', icon: '🗡️', maxRank: 3, desc: '+ Sinister Strike damage.', mod: { key: 'r_sinister.powerPct', perRank: 0.1 } },
        { id: 'r_t1b', tier: 1, name: 'Lightning Reflexes', icon: '💨', maxRank: 3, desc: '+ Agility.', mod: { key: 'statPct.agi', perRank: 0.03 } },
        { id: 'r_t1c', tier: 1, name: 'Malice', icon: '🎯', maxRank: 3, desc: '+ crit chance.', mod: { key: 'meleeCrit', perRank: 0.01 } },
        { id: 'r_t2a', tier: 2, name: 'Improved Eviscerate', icon: '💢', maxRank: 3, desc: '+ Eviscerate damage per combo point.', mod: { key: 'r_eviscerate.powerPct', perRank: 0.08 } },
        { id: 'r_t2b', tier: 2, name: 'Ruthlessness', icon: '🪨', maxRank: 3, desc: 'Finishers have a chance to leave a combo point behind.', mod: { key: 'ruthlessnessChance', perRank: 0.15 } },
        { id: 'r_t2c', tier: 2, name: 'Precision', icon: '🎯', maxRank: 3, desc: '+ hit chance.', mod: { key: 'hitPct', perRank: 0.02 } },
        { id: 'r_t3a', tier: 3, name: 'Dagger Specialization', icon: '🔪', maxRank: 3, desc: '+ damage with fast weapons.', mod: { key: 'meleeDmgPct', perRank: 0.03 } },
        { id: 'r_t3b', tier: 3, name: 'Improved Kick', icon: '🦵', maxRank: 2, desc: '- Kick cooldown.', mod: { key: 'r_kick.cdPct', perRank: -0.2 } },
        { id: 'r_t4a', tier: 4, name: 'Deadliness', icon: '🗡️', maxRank: 5, desc: '+ attack power.', mod: { key: 'apFlatPerRank', perRank: 6 } },
        { id: 'r_t4b', tier: 4, name: 'Elusiveness', icon: '💨', maxRank: 2, desc: '+ dodge chance.', mod: { key: 'dodge', perRank: 0.03 } },
        { id: 'r_t5', tier: 5, name: 'Adrenaline Rush', icon: '⚡', maxRank: 1, desc: 'Unlocks Adrenaline Rush — energy floods back for fifteen seconds.', capstone: true }
      ]
    }
  };

  function talentTiers() { return [0, 0, 5, 10, 15, 20]; } // index by tier (1..5)

  // --- map builder --------------------------------------------------------
  /* Rooms are rectangles, corridors are rectangles, and the border is
   * whatever the grid started filled with — a small level-compiler instead
   * of hand-aligned ASCII art, so every map is guaranteed rectangular and
   * every carve is guaranteed to stay inside the walls. */
  function mkGrid(w, h, fill) {
    const cells = [];
    for (let y = 0; y < h; y++) cells.push(new Array(w).fill(fill == null ? 1 : fill));
    return { w, h, cells };
  }
  function carve(m, x0, y0, x1, y1, val) {
    val = val == null ? 0 : val;
    for (let y = Math.max(1, y0); y <= Math.min(m.h - 2, y1); y++)
      for (let x = Math.max(1, x0); x <= Math.min(m.w - 2, x1); x++)
        m.cells[y][x] = val;
  }

  // --- zones ----------------------------------------------------------------
  const ZONES = {};

  (function buildScar() {
    const m = mkGrid(32, 26, 1);
    carve(m, 2, 2, 9, 9);      // R1 Landing (spawn)
    carve(m, 10, 5, 13, 6);    // corridor R1->R2
    carve(m, 14, 2, 25, 10);   // R2 Vigil Camp (hub)
    carve(m, 18, 11, 20, 14);  // corridor R2->R3
    carve(m, 12, 15, 27, 23);  // R3 Cracked Yard
    carve(m, 4, 10, 6, 13);    // corridor R1->R4
    carve(m, 2, 14, 10, 23);   // R4 Ash Grove
    carve(m, 28, 17, 30, 19);  // exit corridor R3 -> east
    carve(m, 16, 6, 16, 6, 2); carve(m, 22, 6, 22, 6, 2); // hub pillars, accent colour
    ZONES.scar = {
      id: 'scar', name: 'The Scar', levelRange: [1, 8], grid: m,
      palette: { wall1: '#7a2a1e', wall2: '#a9432c', floor: '#241512', ceil: '#120a08', fog: '#1a0d0a' },
      spawn: { x: 5.5, y: 5.5, facing: 0 },
      npcs: [
        { id: 'scar_quartermaster', name: 'Quartermaster Ashe', kind: 'vendor', x: 17, y: 5, vendor: 'scar_vendor', icon: '🏰' },
        { id: 'scar_trainer', name: 'Weaponsmaster Coll', kind: 'trainer', x: 22, y: 5, icon: '🏛️' },
        { id: 'scar_proftrainer', name: 'Artisan Vey', kind: 'proftrainer', x: 20, y: 8, icon: '⚙️' },
        { id: 'scar_qgiver1', name: 'Sentinel Dara', kind: 'quest', x: 15, y: 4, quests: ['scar_q1'], icon: '❗' },
        { id: 'scar_qgiver2', name: 'Provisioner Holt', kind: 'quest', x: 19, y: 9, quests: ['scar_q2'], icon: '❗' },
        { id: 'scar_commander', name: 'Vigil Commander Rask', kind: 'quest', x: 24, y: 4, quests: ['scar_q3', 'scar_q4'], icon: '❗' }
      ],
      nodes: [
        { id: 'n1', kind: 'mining', tier: 1, x: 4, y: 17 }, { id: 'n2', kind: 'mining', tier: 1, x: 8, y: 20 },
        { id: 'n3', kind: 'herb', tier: 1, x: 3, y: 21 }, { id: 'n4', kind: 'herb', tier: 1, x: 9, y: 15 }
      ],
      mobs: [
        { tpl: 'ash_imp', x: 16, y: 19, n: 5, radius: 6 }, { tpl: 'cinder_whelp', x: 22, y: 20, n: 3, radius: 5 },
        { tpl: 'branded_cultist', x: 5, y: 18, n: 3, radius: 4 }, { tpl: 'grudge_branded', x: 24, y: 21, n: 1, radius: 2, elite: true }
      ],
      exits: [{ x: 30, y: 18, r: 1.4, toZone: 'bloomreach', toX: 3, toY: 15.5, toFacing: 0 }]
    };
  })();

  (function buildBloomreach() {
    const m = mkGrid(32, 28, 1);
    carve(m, 1, 12, 9, 19);    // R1 arrival (from scar)
    carve(m, 10, 14, 12, 15);  // corridor R1->R2
    carve(m, 13, 10, 24, 19);  // R2 Grove Heart (hub)
    carve(m, 17, 8, 20, 10);   // corridor R2->R3
    carve(m, 12, 2, 27, 8);    // R3 Wither Fields
    carve(m, 17, 20, 20, 21);  // corridor R2->R4
    carve(m, 13, 21, 24, 26);  // R4 Matriarch's Hollow
    carve(m, 2, 3, 8, 7);      // Bruggo's cage room
    carve(m, 9, 4, 11, 5);     // corridor cage->R3
    carve(m, 25, 13, 30, 15);  // exit corridor -> east (frostmarch)
    ZONES.bloomreach = {
      id: 'bloomreach', name: 'Bloomreach', levelRange: [6, 14], grid: m,
      palette: { wall1: '#274f2a', wall2: '#3f7a3c', floor: '#132015', ceil: '#0a120b', fog: '#0d160e' },
      spawn: { x: 5.5, y: 15.5, facing: 0 },
      npcs: [
        { id: 'bloom_vendor', name: 'Circle Warden Fenn', kind: 'vendor', x: 15, y: 14, vendor: 'bloom_vendor', icon: '🌿' },
        { id: 'bloom_qgiver1', name: 'Seedkeeper Yara', kind: 'quest', x: 18, y: 13, quests: ['bloom_q1'], icon: '❗' },
        { id: 'bloom_qgiver2', name: 'Ranger Tolvain', kind: 'quest', x: 20, y: 15, quests: ['bloom_q2', 'bloom_q3'], icon: '❗' },
        { id: 'bloom_finale', name: 'Elder Sythe', kind: 'quest', x: 16, y: 17, quests: ['bloom_q4'], icon: '❗' },
        { id: 'bruggo', name: 'Bruggo Ironhide', kind: 'companion', x: 5, y: 5, quests: ['bloom_q_bruggo'], companion: 'bruggo', icon: '🫥' }
      ],
      nodes: [
        { id: 'n1', kind: 'herb', tier: 2, x: 15, y: 4 }, { id: 'n2', kind: 'herb', tier: 2, x: 24, y: 6 },
        { id: 'n3', kind: 'mining', tier: 2, x: 20, y: 3 }
      ],
      mobs: [
        { tpl: 'withered_sapling', x: 16, y: 5, n: 5, radius: 6 }, { tpl: 'withered_treant', x: 22, y: 5, n: 3, radius: 5 },
        { tpl: 'blight_hound', x: 14, y: 3, n: 4, radius: 5 }, { tpl: 'matriarch_withered', x: 18, y: 24, n: 1, radius: 3, elite: true }
      ],
      exits: [
        { x: 1, y: 15, r: 1.4, toZone: 'scar', toX: 29, toY: 18, toFacing: Math.PI },
        { x: 30, y: 14, r: 1.4, toZone: 'frostmarch', toX: 3, toY: 6, toFacing: 0 }
      ]
    };
  })();

  (function buildFrostmarch() {
    const m = mkGrid(32, 28, 1);
    carve(m, 2, 5, 12, 7);     // arrival corridor
    carve(m, 13, 2, 24, 10);   // R1 Warden Hold (hub)
    carve(m, 15, 11, 17, 13);  // corridor R1->R2
    carve(m, 2, 14, 17, 23);   // R2 Wraith Hollow
    carve(m, 22, 11, 24, 13);  // corridor R1->R3
    carve(m, 20, 14, 29, 23);  // R3 Sigil Crypt
    ZONES.frostmarch = {
      id: 'frostmarch', name: 'Frostmarch', levelRange: [12, 22], grid: m,
      palette: { wall1: '#1f3a52', wall2: '#3a6a90', floor: '#0d1620', ceil: '#070d12', fog: '#0a141c' },
      spawn: { x: 3, y: 6, facing: 0 },
      npcs: [
        { id: 'frost_vendor', name: 'Quartermaster Bren', kind: 'vendor', x: 18, y: 5, vendor: 'frost_vendor', icon: '❄️' },
        { id: 'frost_qgiver1', name: 'Warden Iska', kind: 'quest', x: 15, y: 7, quests: ['frost_q1'], icon: '❗' },
        { id: 'frost_qgiver2', name: 'Scout Perren', kind: 'quest', x: 21, y: 7, quests: ['frost_q2', 'frost_q3'], icon: '❗' },
        { id: 'frost_sigilgiver', name: 'Commander Vashe', kind: 'quest', x: 18, y: 3, quests: ['frost_q4', 'frost_q5'], icon: '❗' },
        { id: 'sistervell', name: 'Sister Vell', kind: 'companion', x: 25, y: 21, quests: ['frost_q_vell'], companion: 'vell', icon: '🫧' }
      ],
      nodes: [
        { id: 'n1', kind: 'mining', tier: 3, x: 5, y: 18 }, { id: 'n2', kind: 'mining', tier: 3, x: 14, y: 21 },
        { id: 'n3', kind: 'herb', tier: 3, x: 9, y: 16 }
      ],
      mobs: [
        { tpl: 'frost_wraith', x: 8, y: 19, n: 4, radius: 6 }, { tpl: 'rime_stalker', x: 13, y: 18, n: 3, radius: 5 },
        { tpl: 'warden_construct', x: 22, y: 19, n: 3, radius: 5 }, { tpl: 'sigil_keeper', x: 26, y: 17, n: 1, radius: 2, elite: true }
      ],
      portal: { x: 24, y: 20, requiresFlag: 'vault_sigil', toZone: 'hollow', toX: 3.5, toY: 11, toFacing: 0 },
      exits: [{ x: 2, y: 6, r: 1.4, toZone: 'bloomreach', toX: 29, toY: 14, toFacing: Math.PI }]
    };
  })();

  (function buildHollow() {
    const m = mkGrid(26, 22, 1);
    carve(m, 2, 9, 7, 13);     // R1 entry hall
    carve(m, 8, 10, 12, 12);   // hub junction
    carve(m, 11, 2, 20, 7);    // R2 trash hall A
    carve(m, 11, 14, 20, 19);  // R3 trash hall B
    carve(m, 12, 8, 12, 14);   // vertical spine linking R2/junction/R3
    carve(m, 12, 10, 15, 12);  // junction -> boss corridor
    carve(m, 16, 9, 23, 13);   // R4 boss chamber
    ZONES.hollow = {
      id: 'hollow', name: 'The Hollow King’s Vault', levelRange: [20, 27], grid: m, instance: true,
      palette: { wall1: '#2a1a3a', wall2: '#4a2a66', floor: '#100916', ceil: '#08050c', fog: '#0c0712' },
      spawn: { x: 3.5, y: 11, facing: 0 },
      npcs: [],
      nodes: [],
      mobs: [
        { tpl: 'vault_wraith', x: 15, y: 4, n: 3, radius: 4 }, { tpl: 'bone_guard', x: 15, y: 16, n: 3, radius: 4 },
        { tpl: 'hollow_king', x: 20, y: 11, n: 1, radius: 2, elite: true, boss: true }
      ],
      exits: [{ x: 4, y: 11, r: 1.2, toZone: 'frostmarch', toX: 23, toY: 20, toFacing: Math.PI }]
    };
  })();

  // --- bestiary ---------------------------------------------------------------
  const BESTIARY = {
    ash_imp: { name: 'Ash Imp', icon: '👹', level: [1, 3], hp: 22, dmg: 4, armor: 5, speed: 2.2, aggroRadius: 5, xp: 14, loot: 'trash_low', faction: 'ashenvigil_hostile', sprites: ['👹', '😈'] },
    cinder_whelp: { name: 'Cinder Whelp', icon: '🦎', level: [2, 4], hp: 30, dmg: 5, armor: 8, speed: 2.0, aggroRadius: 5, xp: 20, loot: 'trash_low', faction: 'ashenvigil_hostile', dropItem: { id: 'sulfur_shard', chance: 0.5 }, sprites: ['🦎', '🐉'] },
    branded_cultist: { name: 'Branded Cultist', icon: '🗡️', level: [3, 6], hp: 46, dmg: 7, armor: 12, speed: 1.9, aggroRadius: 6, xp: 30, loot: 'trash_mid', faction: 'ashenvigil_hostile', sprites: ['🗡️', '⚔️'] },
    grudge_branded: { name: 'Grudge, the Branded', icon: '🔥', level: [8, 8], hp: 260, dmg: 14, armor: 25, speed: 2.0, aggroRadius: 8, xp: 160, loot: 'elite_scar', faction: 'ashenvigil_hostile', elite: true, ability: { every: 6, name: 'Brand of Ash', radius: 3, dmg: 18 }, sprites: ['🔥', '🌪️'] },

    withered_sapling: { name: 'Withered Sapling', icon: '🌱', level: [6, 8], hp: 60, dmg: 8, armor: 10, speed: 1.8, aggroRadius: 5, xp: 40, loot: 'trash_mid', faction: 'bloomreach_hostile', sprites: ['🌱', '🍃'] },
    withered_treant: { name: 'Withered Treant', icon: '🌳', level: [8, 11], hp: 130, dmg: 12, armor: 30, speed: 1.3, aggroRadius: 5, xp: 65, loot: 'trash_mid', faction: 'bloomreach_hostile', sprites: ['🌳', '🌲'] },
    blight_hound: { name: 'Blight Hound', icon: '🐺', level: [9, 12], hp: 85, dmg: 11, armor: 12, speed: 3.0, aggroRadius: 7, xp: 58, loot: 'trash_mid', faction: 'bloomreach_hostile', sprites: ['🐺', '🐕'] },
    matriarch_withered: { name: 'The Withered Matriarch', icon: '🥀', level: [14, 14], hp: 520, dmg: 20, armor: 35, speed: 1.6, aggroRadius: 9, xp: 340, loot: 'elite_bloom', faction: 'bloomreach_hostile', elite: true, ability: { every: 8, name: 'Wilting Bloom', radius: 4, dmg: 26, dot: true }, sprites: ['🥀', '🌹'] },

    frost_wraith: { name: 'Frost Wraith', icon: '👻', level: [12, 15], hp: 150, dmg: 16, armor: 20, speed: 2.2, aggroRadius: 7, xp: 95, loot: 'trash_high', faction: 'frostmarch_hostile', sprites: ['👻', '🎃'] },
    rime_stalker: { name: 'Rime Stalker', icon: '🐾', level: [14, 17], hp: 190, dmg: 20, armor: 22, speed: 2.8, aggroRadius: 8, xp: 120, loot: 'trash_high', faction: 'frostmarch_hostile', sprites: ['🐾', '❄️'] },
    warden_construct: { name: 'Warden Construct', icon: '🗿', level: [16, 19], hp: 320, dmg: 22, armor: 45, speed: 1.2, aggroRadius: 6, xp: 165, loot: 'trash_high', faction: 'frostmarch_hostile', sprites: ['🗿', '🛡️'] },
    sigil_keeper: { name: 'The Sigil Keeper', icon: '🔑', level: [20, 20], hp: 640, dmg: 28, armor: 40, speed: 1.8, aggroRadius: 9, xp: 420, loot: 'elite_frost', faction: 'frostmarch_hostile', elite: true, dropItem: { id: 'vault_sigil', chance: 1.0 }, ability: { every: 7, name: 'Rime Lock', radius: 5, dmg: 20, snare: true }, sprites: ['🔑', '⚡'] },

    vault_wraith: { name: 'Vault Wraith', icon: '👻', level: [20, 22], hp: 300, dmg: 26, armor: 30, speed: 2.4, aggroRadius: 7, xp: 220, loot: 'trash_dungeon', faction: 'hollow_hostile', sprites: ['👻', '🎃'] },
    bone_guard: { name: 'Bone Guard', icon: '💀', level: [21, 23], hp: 380, dmg: 30, armor: 50, speed: 1.6, aggroRadius: 6, xp: 260, loot: 'trash_dungeon', faction: 'hollow_hostile', sprites: ['💀', '☠️'] },
    hollow_king: {
      name: 'The Hollow King', icon: '👑', level: [26, 26], hp: 3200, dmg: 40, armor: 60, speed: 1.6, aggroRadius: 12, xp: 2400, loot: 'boss_hollow', faction: 'hollow_hostile', elite: true, boss: true,
      ability: { every: 5, name: 'Despair', radius: 4, dmg: 34 },
      enrageAt: 0.5, enrageAbility: { every: 4, name: 'Hollow Nova', radius: 6, dmg: 44 },
      sprites: ['👑', '💀']
    }
  };

  // --- loot tables --------------------------------------------------------
  const LOOT_TABLES = {
    trash_low: { gold: [1, 4], itemChance: 0.22, ilvlBonus: -1, qualityFloor: null },
    trash_mid: { gold: [3, 8], itemChance: 0.28, ilvlBonus: 0, qualityFloor: null },
    trash_high: { gold: [6, 14], itemChance: 0.32, ilvlBonus: 1, qualityFloor: null },
    trash_dungeon: { gold: [10, 20], itemChance: 0.4, ilvlBonus: 2, qualityFloor: 'uncommon' },
    elite_scar: { gold: [15, 25], itemChance: 0.9, ilvlBonus: 2, qualityFloor: 'uncommon', guaranteed: [{ id: 'ashguard_cinderplate', chance: 0.25 }] },
    elite_bloom: { gold: [30, 45], itemChance: 0.95, ilvlBonus: 3, qualityFloor: 'rare', guaranteed: [{ id: 'bloomreach_wardstaff', chance: 0.2 }] },
    elite_frost: { gold: [45, 65], itemChance: 1.0, ilvlBonus: 3, qualityFloor: 'rare', guaranteed: [{ id: 'frostmarch_bulwark', chance: 0.15 }] },
    boss_hollow: { gold: [120, 180], itemChance: 1.0, ilvlBonus: 6, qualityFloor: 'epic', guaranteed: [{ id: 'hollow_kings_crown', chance: 0.35 }] }
  };

  // --- quests -----------------------------------------------------------------
  const QUESTS = {
    scar_q1: { id: 'scar_q1', zone: 'scar', name: 'Blood on the Ash', giver: 'scar_qgiver1', turnin: 'scar_qgiver1', level: 1, kind: 'kill', target: 'ash_imp', count: 8, xp: 120, gold: 6, text: 'Ash Imps have been probing the Vigil’s outer wards. Thin their numbers.' },
    scar_q2: { id: 'scar_q2', zone: 'scar', name: 'Vigil Supplies', giver: 'scar_qgiver2', turnin: 'scar_qgiver2', level: 2, kind: 'collect', item: 'sulfur_shard', count: 6, xp: 150, gold: 8, rewardChoice: true, text: 'Cinder Whelps hoard sulfur shards. The quartermaster wants six for the forges.' },
    scar_q3: { id: 'scar_q3', zone: 'scar', name: 'The Cracked Yard', giver: 'scar_commander', turnin: 'scar_commander', level: 7, requires: ['scar_q1', 'scar_q2'], kind: 'kill', target: 'grudge_branded', count: 1, xp: 260, gold: 20, rep: { faction: 'ashenvigil', amount: 250 }, text: 'Grudge has claimed the yard and everything that wanders into it. End him.' },
    scar_q4: { id: 'scar_q4', zone: 'scar', name: 'Through the Vigil Gate', giver: 'scar_commander', turnin: 'scar_commander', level: 8, requires: ['scar_q3'], kind: 'talk', xp: 200, gold: 15, rep: { faction: 'ashenvigil', amount: 150 }, text: 'The road east is as clear as the Vigil can make it. What lies past Bloomreach is yours to find.' },

    bloom_q1: { id: 'bloom_q1', zone: 'bloomreach', name: 'The Withering', giver: 'bloom_qgiver1', turnin: 'bloom_qgiver1', level: 6, kind: 'kill', target: 'withered_sapling', count: 10, xp: 220, gold: 12, text: 'The blight took the saplings first. Put them out of it.' },
    bloom_q2: { id: 'bloom_q2', zone: 'bloomreach', name: 'Hound Culling', giver: 'bloom_qgiver2', turnin: 'bloom_qgiver2', level: 9, kind: 'kill', target: 'blight_hound', count: 8, xp: 260, gold: 15, text: 'Blight hounds run in packs now. That is new, and it is not good.' },
    bloom_q3: { id: 'bloom_q3', zone: 'bloomreach', name: 'Root and Stem', giver: 'bloom_qgiver2', turnin: 'bloom_qgiver2', level: 11, requires: ['bloom_q1'], kind: 'kill', target: 'withered_treant', count: 6, xp: 300, gold: 18, rep: { faction: 'bloomreach', amount: 200 }, text: 'The treants that remember being trees are the ones worth saving. These do not.' },
    bloom_q4: { id: 'bloom_q4', zone: 'bloomreach', name: 'The Withered Matriarch', giver: 'bloom_finale', turnin: 'bloom_finale', level: 14, requires: ['bloom_q2', 'bloom_q3'], kind: 'kill', target: 'matriarch_withered', count: 1, xp: 420, gold: 35, rep: { faction: 'bloomreach', amount: 400 }, text: 'She was the Circle’s eldest once. What she is now has to be ended, not reasoned with.' },
    bloom_q_bruggo: { id: 'bloom_q_bruggo', zone: 'bloomreach', name: 'Free the Prisoner', giver: 'bruggo', turnin: 'bruggo', level: 6, kind: 'talk', xp: 100, gold: 5, companion: 'bruggo', text: 'A warrior in a bramble cage, still breathing out of spite. Let him out.' },

    frost_q1: { id: 'frost_q1', zone: 'frostmarch', name: 'Cold Contact', giver: 'frost_qgiver1', turnin: 'frost_qgiver1', level: 12, kind: 'kill', target: 'frost_wraith', count: 8, xp: 320, gold: 20, text: 'Wraiths bleed cold instead of blood. Eight of them, less cold.' },
    frost_q2: { id: 'frost_q2', zone: 'frostmarch', name: 'Stalked', giver: 'frost_qgiver2', turnin: 'frost_qgiver2', level: 15, kind: 'kill', target: 'rime_stalker', count: 8, xp: 360, gold: 24, text: 'They hunt in the low light. Hunt them back.' },
    frost_q3: { id: 'frost_q3', zone: 'frostmarch', name: 'Warden’s Work', giver: 'frost_qgiver2', turnin: 'frost_qgiver2', level: 17, requires: ['frost_q2'], kind: 'kill', target: 'warden_construct', count: 6, xp: 400, gold: 28, rep: { faction: 'frostmarch', amount: 250 }, text: 'The constructs guard nothing anymore except the thing that woke them.' },
    frost_q4: { id: 'frost_q4', zone: 'frostmarch', name: 'The Last Warden', giver: 'frost_sigilgiver', turnin: 'sistervell', level: 16, kind: 'talk', xp: 150, gold: 10, companion: 'vell', text: 'One warden made it back from the crypt. Barely.' },
    frost_q5: { id: 'frost_q5', zone: 'frostmarch', name: 'The Sealed Vault', giver: 'frost_sigilgiver', turnin: 'frost_sigilgiver', level: 20, requires: ['frost_q3', 'frost_q4'], kind: 'kill', target: 'sigil_keeper', count: 1, xp: 500, gold: 50, rep: { faction: 'frostmarch', amount: 400 }, grantsFlag: 'vault_sigil', text: 'The Sigil Keeper carries the key to whatever the Wardens sealed. Take it from him.' },
    hollow_q1: { id: 'hollow_q1', zone: 'frostmarch', name: 'Slay the Hollow King', giver: 'frost_sigilgiver', turnin: 'frost_sigilgiver', level: 24, requires: ['frost_q5'], kind: 'kill', target: 'hollow_king', count: 1, xp: 1200, gold: 150, rep: { faction: 'hollowcourt', amount: 500 }, text: 'What the Wardens sealed away is still breathing. It should stop.' }
  };

  // --- factions -----------------------------------------------------------
  const FACTION_TIERS = [
    { name: 'Hated', min: -3000 }, { name: 'Neutral', min: 0 }, { name: 'Friendly', min: 500 },
    { name: 'Honored', min: 1500 }, { name: 'Revered', min: 3000 }, { name: 'Exalted', min: 6000 }
  ];
  const FACTIONS = {
    ashenvigil: { id: 'ashenvigil', name: 'The Ashen Vigil', zone: 'scar' },
    bloomreach: { id: 'bloomreach', name: 'Bloomreach Circle', zone: 'bloomreach' },
    frostmarch: { id: 'frostmarch', name: 'Frostmarch Wardens', zone: 'frostmarch' },
    hollowcourt: { id: 'hollowcourt', name: 'Court of the Hollow King', zone: 'hollow' }
  };
  function repTier(rep) {
    let t = FACTION_TIERS[0];
    for (const tier of FACTION_TIERS) if (rep >= tier.min) t = tier;
    return t;
  }

  // --- professions --------------------------------------------------------
  const GATHER_PROFESSIONS = {
    mining: { id: 'mining', name: 'Mining', icon: '⛏️', mats: { 1: 'copper_ore', 2: 'iron_ore', 3: 'mithril_ore' } },
    herb: { id: 'herb', name: 'Herbalism', icon: '🌿', mats: { 1: 'silverleaf', 2: 'briarroot', 3: 'frostbloom' } }
  };
  const CRAFT_PROFESSIONS = {
    blacksmithing: {
      id: 'blacksmithing', name: 'Blacksmithing', icon: '🔨', uses: ['copper_ore', 'iron_ore', 'mithril_ore'],
      recipes: [
        { id: 'bs_r1', name: 'Copper Bracers', skillReq: 0, mats: { copper_ore: 4 }, result: { slot: 'wrist', ilvl: 6, quality: 'common' } },
        { id: 'bs_r2', name: 'Iron Gauntlets', skillReq: 75, mats: { iron_ore: 6 }, result: { slot: 'hands', ilvl: 14, quality: 'uncommon' } },
        { id: 'bs_r3', name: 'Vigil-Forged Greataxe', skillReq: 150, mats: { iron_ore: 8, mithril_ore: 2 }, result: { slot: 'mainhand', ilvl: 20, quality: 'rare', styleHint: 'str' } },
        { id: 'bs_r4', name: 'Mithril Legplates', skillReq: 225, mats: { mithril_ore: 10 }, result: { slot: 'legs', ilvl: 26, quality: 'rare' } }
      ]
    },
    alchemy: {
      id: 'alchemy', name: 'Alchemy', icon: '⚗️', uses: ['silverleaf', 'briarroot', 'frostbloom'],
      recipes: [
        { id: 'al_r1', name: 'Minor Healing Draught', skillReq: 0, mats: { silverleaf: 3 }, result: { potion: 'heal', power: 60 } },
        { id: 'al_r2', name: 'Draught of Swiftness', skillReq: 75, mats: { briarroot: 3 }, result: { potion: 'speed', power: 0.3 } },
        { id: 'al_r3', name: 'Greater Healing Draught', skillReq: 150, mats: { briarroot: 3, silverleaf: 2 }, result: { potion: 'heal', power: 160 } },
        { id: 'al_r4', name: 'Frostbloom Elixir', skillReq: 225, mats: { frostbloom: 4 }, result: { potion: 'heal', power: 320 } }
      ]
    },
    enchanting: {
      id: 'enchanting', name: 'Enchanting', icon: '✨', uses: ['dust'],
      recipes: [
        { id: 'en_r1', name: 'Enchant: Minor Stamina', skillReq: 0, mats: { dust: 2 }, result: { enchant: { sta: 4 } } },
        { id: 'en_r2', name: 'Enchant: Lesser Might', skillReq: 75, mats: { dust: 4 }, result: { enchant: { str: 5, agi: 5 } } },
        { id: 'en_r3', name: 'Enchant: Greater Intellect', skillReq: 150, mats: { dust: 6 }, result: { enchant: { int: 8 } } },
        { id: 'en_r4', name: 'Enchant: Vigil’s Wrath', skillReq: 225, mats: { dust: 10 }, result: { enchant: { crit: 8, haste: 4 } } }
      ]
    }
  };
  const SKILL_TIER_NAME = s => s >= 225 ? 'Artisan' : s >= 150 ? 'Expert' : s >= 75 ? 'Journeyman' : 'Apprentice';

  // --- vendor stock ---------------------------------------------------------
  const VENDORS = {
    scar_vendor: { fixed: ['ashguard_cinderplate'], generated: [{ slot: 'chest', ilvl: 8, quality: 'common' }, { slot: 'feet', ilvl: 8, quality: 'common' }, { slot: 'mainhand', ilvl: 8, quality: 'common' }], repFaction: 'ashenvigil', repGated: [{ slot: 'shoulder', ilvl: 14, quality: 'uncommon', tier: 'Friendly' }] },
    bloom_vendor: { fixed: [], generated: [{ slot: 'legs', ilvl: 12, quality: 'common' }, { slot: 'offhand', ilvl: 12, quality: 'common' }, { slot: 'ring1', ilvl: 12, quality: 'uncommon' }], repFaction: 'bloomreach', repGated: [{ slot: 'chest', ilvl: 18, quality: 'rare', tier: 'Honored' }] },
    frost_vendor: { fixed: ['frostmarch_bulwark'], generated: [{ slot: 'head', ilvl: 18, quality: 'uncommon' }, { slot: 'waist', ilvl: 18, quality: 'uncommon' }, { slot: 'trinket1', ilvl: 18, quality: 'uncommon' }], repFaction: 'frostmarch', repGated: [{ slot: 'mainhand', ilvl: 24, quality: 'rare', tier: 'Revered' }] }
  };

  DS.content = {
    LEVEL_CAP, TALENT_START_LEVEL, SLOTS, SLOT_WEIGHT, QUALITIES, QUALITY_BY_KEY,
    rollQuality, rollItem, CURATED_ITEMS, CLASSES, talentTiers,
    ZONES, BESTIARY, LOOT_TABLES, QUESTS, FACTIONS, FACTION_TIERS, repTier,
    GATHER_PROFESSIONS, CRAFT_PROFESSIONS, SKILL_TIER_NAME, VENDORS
  };
})(window.DS = window.DS || {});
