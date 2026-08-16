/* DoomSpire — the character: stats, leveling, gear, bags, talents,
 * professions, reputation, quest log and companions.
 *
 * Everything here is pure data manipulation. Nothing draws, nothing moves
 * anyone in the world — sim.js and world.js call into this to change the
 * character and read the result back.
 */
(function (DS) {
  'use strict';
  const C = DS.core;
  const K = DS.content;

  const BAG_SIZE = 24;
  const RESOURCE_MAX = { rage: 100, energy: 100 };

  function xpForLevel(level) {
    return Math.round(45 * Math.pow(level, 2.15) + 55 * level);
  }

  function newCharacter(name, clsId) {
    const cls = K.CLASSES[clsId];
    const zone = K.ZONES.scar;
    return {
      name: name || 'Adventurer', cls: clsId, level: 1, xp: 0,
      x: zone.spawn.x, y: zone.spawn.y, angle: zone.spawn.facing || 0, zone: 'scar',
      talentPoints: 0, talents: {},
      equip: Object.fromEntries(K.SLOTS.map(s => [s, null])),
      bags: [], gold: 15,
      quests: { active: {}, completed: [] }, flags: {},
      rep: Object.fromEntries(Object.keys(K.FACTIONS).map(f => [f, 0])),
      professions: { learned: [], skill: {} },
      companions: {},
      resource: { current: cls.resource === 'mana' ? 30 : cls.resource === 'rage' ? 0 : 100 },
      comboPoints: 0,
      hp: { current: 1, max: 1 }, // filled in by refreshVitals right after creation
      buffs: [], cooldowns: {},
      alive: true, log: []
    };
  }

  // --- derived stats -----------------------------------------------------
  function classModifiers(player) {
    const cls = K.CLASSES[player.cls];
    const mods = {};
    let unlocked = [];
    for (const t of cls.talents) {
      const rank = player.talents[t.id] || 0;
      if (rank <= 0) continue;
      if (t.mod) mods[t.mod.key] = (mods[t.mod.key] || 0) + t.mod.perRank * rank;
      if (t.unlockAbility) unlocked.push(t.unlockAbility);
    }
    return { mods, unlockedAbilities: unlocked };
  }

  function gearTotals(player) {
    const tot = { str: 0, agi: 0, int: 0, sta: 0, spirit: 0, armor: 0, crit: 0, haste: 0 };
    K.SLOTS.forEach(s => {
      const it = player.equip[s];
      if (!it) return;
      Object.entries(it.stats || {}).forEach(([k, v]) => { tot[k] = (tot[k] || 0) + v; });
    });
    return tot;
  }

  /* Recomputed on demand rather than cached — cheap, and it means gear and
   * talent changes are correct on the very next read with no invalidation
   * bugs to chase. */
  function derived(player) {
    const cls = K.CLASSES[player.cls];
    const { mods } = classModifiers(player);
    const gear = gearTotals(player);
    const base = k => 6 + (cls.growth[k] || 0) * player.level;
    const stat = k => (base(k) + (gear[k] || 0)) * (1 + (mods['statPct.' + k] || 0));
    const str = stat('str'), agi = stat('agi'), int_ = stat('int'), sta = stat('sta'), spirit = stat('spirit');

    const attackPower = Math.round((cls.primary === 'str' ? str * 2.2 : cls.primary === 'agi' ? agi * 2.2 : str + agi) + (mods.apFlatPerRank || 0) + (mods.apFlat || 0));
    const spellPower = Math.round(int_ * 1.6);
    const armor = Math.round((gear.armor || 0) * (1 + (mods.armorPct || 0)));
    const maxHealth = Math.round((60 + player.level * 11 + sta * 11) * (1 + (mods.healthPct || 0)));
    const resKind = cls.resource;
    let maxResource = 100;
    if (resKind === 'mana') maxResource = Math.round((25 + player.level * 8 + int_ * 9) * (1 + (mods.manaPct || 0)));
    else maxResource = RESOURCE_MAX[resKind] || 100;

    const critChance = C.clamp(0.04 + (gear.crit || 0) * 0.0035 + (mods.meleeCrit || 0) + (mods.rangedCrit || 0) + (mods.spellCrit || 0), 0.02, 0.6);
    const hastePct = C.clamp((gear.haste || 0) * 0.0035, 0, 0.6);
    const dodge = C.clamp(0.03 + (mods.dodge || 0), 0, 0.5);
    const parry = C.clamp(mods.parry || 0, 0, 0.4);
    const block = C.clamp(mods.block || 0, 0, 0.4);

    return {
      str, agi, int: int_, sta, spirit, attackPower, spellPower, armor,
      maxHealth, maxResource, resKind, critChance, hastePct, dodge, parry, block, mods
    };
  }

  function refreshVitals(player) {
    const d = derived(player);
    const hpRatio = player.hp.max > 0 ? player.hp.current / player.hp.max : 1;
    player.hp.max = d.maxHealth;
    player.hp.current = player.hp.current <= 0 ? 0 : Math.round(d.maxHealth * hpRatio);
    if (player.resource.current == null) player.resource.current = d.maxResource;
    player.resource.max = d.maxResource;
    return d;
  }

  // --- leveling ------------------------------------------------------------
  function grantXP(player, amount) {
    if (player.level >= K.LEVEL_CAP) return { leveled: false };
    player.xp += Math.round(amount);
    let leveled = false, newTalentPts = 0;
    while (player.level < K.LEVEL_CAP && player.xp >= xpForLevel(player.level)) {
      player.xp -= xpForLevel(player.level);
      player.level++;
      leveled = true;
      if (player.level >= K.TALENT_START_LEVEL) { player.talentPoints++; newTalentPts++; }
      const d = refreshVitals(player);
      player.hp.current = d.maxHealth;
      player.resource.current = d.maxResource;
    }
    if (player.level >= K.LEVEL_CAP) player.xp = 0;
    return { leveled, newTalentPts };
  }

  // --- talents -------------------------------------------------------------
  function talentPointsSpent(player) { return Object.values(player.talents).reduce((s, r) => s + r, 0); }
  function talentTierUnlocked(player, tier) { return talentPointsSpent(player) >= K.talentTiers()[tier]; }
  function canSpendTalent(player, talentId) {
    const cls = K.CLASSES[player.cls];
    const t = cls.talents.find(x => x.id === talentId);
    if (!t) return false;
    if (player.talentPoints <= 0) return false;
    if (!talentTierUnlocked(player, t.tier)) return false;
    const cur = player.talents[talentId] || 0;
    return cur < t.maxRank;
  }
  function spendTalent(player, talentId) {
    if (!canSpendTalent(player, talentId)) return false;
    player.talents[talentId] = (player.talents[talentId] || 0) + 1;
    player.talentPoints--;
    return true;
  }
  function resetTalents(player) {
    const refund = talentPointsSpent(player);
    player.talents = {};
    player.talentPoints += refund;
  }
  function abilityList(player) {
    const cls = K.CLASSES[player.cls];
    const { unlockedAbilities } = classModifiers(player);
    const known = cls.abilities.filter(a => !a.requiresTalent || (player.talents[a.requiresTalent] || 0) > 0);
    return known.concat(unlockedAbilities);
  }

  // --- inventory & gear ------------------------------------------------------
  function addItem(player, item) {
    if (player.bags.length >= BAG_SIZE) return false;
    player.bags.push(item);
    return true;
  }
  function removeItem(player, iid) {
    const i = player.bags.findIndex(it => it.iid === iid);
    if (i < 0) return null;
    return player.bags.splice(i, 1)[0];
  }
  function equipFromBag(player, iid) {
    const item = removeItem(player, iid);
    if (!item) return false;
    const slot = item.slot === 'ring1' && player.equip.ring1 && !player.equip.ring2 ? 'ring2'
      : item.slot === 'trinket1' && player.equip.trinket1 && !player.equip.trinket2 ? 'trinket2' : item.slot;
    const old = player.equip[slot];
    player.equip[slot] = item;
    if (old) player.bags.push(old);
    return true;
  }
  function unequipToBag(player, slot) {
    const item = player.equip[slot];
    if (!item) return false;
    if (player.bags.length >= BAG_SIZE) return false;
    player.equip[slot] = null;
    player.bags.push(item);
    return true;
  }

  // --- reputation ------------------------------------------------------------
  function addRep(player, factionId, amount) {
    player.rep[factionId] = (player.rep[factionId] || 0) + amount;
  }

  // --- professions -------------------------------------------------------
  function learnProfession(player, profId) {
    if (player.professions.learned.includes(profId)) return false;
    if (player.professions.learned.length >= 2) return false;
    player.professions.learned.push(profId);
    player.professions.skill[profId] = 1;
    return true;
  }
  function gatherSkillUp(player, profId, tier) {
    const cur = player.professions.skill[profId] || 0;
    const cap = tier * 75 + 75;
    if (cur >= cap) return 0;
    const gain = C.rndInt(1, 3);
    player.professions.skill[profId] = Math.min(300, cur + gain);
    return gain;
  }

  // --- quests ----------------------------------------------------------------
  function questAvailable(player, qid) {
    const q = K.QUESTS[qid];
    if (!q) return false;
    if (player.quests.active[qid] || player.quests.completed.includes(qid)) return false;
    if (player.level < q.level - 2) return false;
    if (q.requires && !q.requires.every(r => player.quests.completed.includes(r))) return false;
    return true;
  }
  function acceptQuest(player, qid) {
    if (!questAvailable(player, qid)) return false;
    player.quests.active[qid] = { progress: 0 };
    return true;
  }
  function questReadyToTurnIn(player, qid) {
    const q = K.QUESTS[qid];
    const a = player.quests.active[qid];
    if (!q || !a) return false;
    if (q.kind === 'talk') return true;
    return a.progress >= (q.count || 1);
  }
  function noteKill(player, mobTpl) {
    Object.entries(player.quests.active).forEach(([qid, a]) => {
      const q = K.QUESTS[qid];
      if (q.kind === 'kill' && q.target === mobTpl) a.progress = Math.min(q.count, a.progress + 1);
    });
  }
  function noteCollect(player, itemId, count) {
    Object.entries(player.quests.active).forEach(([qid, a]) => {
      const q = K.QUESTS[qid];
      if (q.kind === 'collect' && q.item === itemId) {
        const have = player.bags.filter(b => b.tplId === itemId).length;
        a.progress = Math.min(q.count, have);
      }
    });
  }
  function turnInQuest(player, qid) {
    if (!questReadyToTurnIn(player, qid)) return null;
    const q = K.QUESTS[qid];
    delete player.quests.active[qid];
    player.quests.completed.push(qid);
    if (q.kind === 'collect') {
      let need = q.count;
      player.bags = player.bags.filter(b => { if (need > 0 && b.tplId === q.item) { need--; return false; } return true; });
    }
    grantXP(player, q.xp);
    player.gold += q.gold || 0;
    if (q.rep) addRep(player, q.rep.faction, q.rep.amount);
    if (q.grantsFlag) player.flags[q.grantsFlag] = true;
    if (q.companion) player.companions[q.companion] = { recruited: true, alive: true };
    return q;
  }

  DS.player = {
    BAG_SIZE, xpForLevel, newCharacter, derived, refreshVitals, gearTotals, classModifiers,
    grantXP, talentPointsSpent, talentTierUnlocked, canSpendTalent, spendTalent, resetTalents, abilityList,
    addItem, removeItem, equipFromBag, unequipToBag, addRep,
    learnProfession, gatherSkillUp,
    questAvailable, acceptQuest, questReadyToTurnIn, noteKill, noteCollect, turnInQuest
  };
})(window.DS = window.DS || {});
