/* DoomSpire — ability resolution, damage/healing math, buffs and cooldowns.
 *
 * Player, companions and mobs all funnel through the same handful of
 * functions here. A companion is just a player-shaped object without gear
 * (see DS.player.derived — it tolerates an empty equip/talents object), so
 * "group content" is the same code path as soloing, the way PrimalIsle's
 * other thirty-four dinosaurs run through the same dino.js as the player.
 */
(function (DS) {
  'use strict';
  const C = DS.core;
  const K = DS.content;
  const GCD = 1.0;

  function getCombatStats(actor) {
    if (actor.kind === 'mob') return actor.combat;
    return DS.player.derived(actor);
  }

  function mitigatePhysical(dmg, armor, level) {
    const mitigation = C.clamp(armor / (armor + 400 + 85 * Math.max(1, level)), 0, 0.75);
    return dmg * (1 - mitigation);
  }
  function rollCrit(chance) { return C.chance(chance); }

  // --- buffs -----------------------------------------------------------------
  function addBuff(actor, buff) {
    actor.buffs = actor.buffs || [];
    const existing = actor.buffs.find(b => b.key === buff.key);
    if (existing) Object.assign(existing, buff, { elapsed: 0 });
    else actor.buffs.push(Object.assign({ elapsed: 0, tickTimer: 0 }, buff));
  }
  function buffTotals(actor) {
    const t = { apFlat: 0, armorPct: 0, dmgPct: 0, dmgTakenPct: 0, speedPct: 0, dodgeFlat: 0, shield: 0, immune: false, energyRegenPct: 0, rooted: false, snaredPct: 0 };
    (actor.buffs || []).forEach(b => {
      const f = b.fields || {};
      t.apFlat += f.apFlat || 0; t.armorPct += f.armorPct || 0; t.dmgPct += f.dmgPct || 0;
      t.dmgTakenPct += f.dmgTakenPct || 0; t.speedPct += f.speedPct || 0; t.dodgeFlat += f.dodgeFlat || 0;
      t.shield += b.shieldRemaining || 0; if (f.immune) t.immune = true;
      t.energyRegenPct += f.energyRegenPct || 0; if (b.kind === 'root') t.rooted = true;
      if (b.kind === 'snare') t.snaredPct = Math.max(t.snaredPct, f.snarePct || 0);
    });
    return t;
  }

  function tickBuffs(actor, dt, log) {
    if (!actor.buffs || !actor.buffs.length) return;
    actor.buffs = actor.buffs.filter(b => {
      b.elapsed += dt;
      if (b.dot) {
        b.tickTimer += dt;
        while (b.tickTimer >= b.dot.interval && b.ticksLeft > 0) {
          b.tickTimer -= b.dot.interval; b.ticksLeft--;
          if (b.healPerTick) applyHeal(actor, b.healPerTick);
          else if (b.perTick) applyDamage(actor, b.perTick, {});
        }
      }
      return b.elapsed < b.dur && actor.alive !== false;
    });
  }

  // --- resources & cooldowns -----------------------------------------------
  function tickCooldowns(actor, dt) {
    const cds = actor.cooldowns || (actor.cooldowns = {});
    Object.keys(cds).forEach(k => { cds[k] = Math.max(0, cds[k] - dt); if (cds[k] === 0) delete cds[k]; });
  }
  function tickResource(actor, dt, inCombat) {
    const cs = getCombatStats(actor);
    if (!actor.resource) return;
    actor.resource.max = cs.maxResource;
    const kind = actor.kind === 'mob' ? null : K.CLASSES[actor.cls].resource;
    if (kind === 'mana') {
      const regen = (2 + cs.spirit * 0.18) * dt * (inCombat ? 0.4 : 1);
      actor.resource.current = Math.min(cs.maxResource, actor.resource.current + regen);
    } else if (kind === 'energy') {
      const mult = 1 + buffTotals(actor).energyRegenPct;
      actor.resource.current = Math.min(100, actor.resource.current + 12 * mult * dt);
    } else if (kind === 'rage') {
      if (!inCombat) {
        const decayMod = 1 + ((cs.mods && cs.mods.rageDecayPct) || 0);
        actor.resource.current = Math.max(0, actor.resource.current - 6 * decayMod * dt);
      }
    }
  }

  // --- damage / healing --------------------------------------------------
  function applyDamage(target, amount, opts) {
    opts = opts || {};
    let dealt = Math.max(0, Math.round(amount));
    const bt = buffTotals(target);
    if (bt.immune) return 0;
    if (bt.shield > 0) {
      const absorbed = Math.min(bt.shield, dealt);
      dealt -= absorbed;
      const shieldBuff = (target.buffs || []).find(b => b.shieldRemaining > 0);
      if (shieldBuff) shieldBuff.shieldRemaining = Math.max(0, shieldBuff.shieldRemaining - absorbed);
    }
    target.hp.current = Math.max(0, target.hp.current - dealt);
    if (target.hp.current <= 0) target.alive = false;
    return dealt;
  }
  function applyHeal(target, amount) {
    const healed = Math.min(target.hp.max - target.hp.current, Math.max(0, Math.round(amount)));
    target.hp.current += healed;
    return healed;
  }

  function costFor(ability, cs) {
    const pct = (cs.mods && (cs.mods[ability.id + '.costPct'] || cs.mods.costPct)) || 0;
    return Math.max(0, Math.round((ability.cost || 0) * (1 + pct)));
  }
  function cdFor(ability, cs) {
    const pct = (cs.mods && cs.mods[ability.id + '.cdPct']) || 0;
    return Math.max(0.5, (ability.cd || 0) * (1 + pct) * (1 - cs.hastePct * 0.5));
  }

  function canUse(caster, target, ability) {
    if (caster.casting) return { ok: false, reason: 'busy' };
    if ((caster.cooldowns && caster.cooldowns['_gcd']) > 0) return { ok: false, reason: 'gcd' };
    if (caster.cooldowns && caster.cooldowns[ability.id] > 0) return { ok: false, reason: 'cooldown' };
    const cs = getCombatStats(caster);
    if (ability.finisher && !(caster.comboPoints > 0)) return { ok: false, reason: 'no combo points' };
    const cost = costFor(ability, cs);
    if (caster.resource && cost > caster.resource.current) return { ok: false, reason: 'resource' };
    if (!ability.self && ability.kind !== 'buff' && ability.kind !== 'gap' && ability.range) {
      if (!target || !target.alive) return { ok: false, reason: 'no target' };
      if (C.dist(caster.x, caster.y, target.x, target.y) > ability.range + 0.4) return { ok: false, reason: 'range' };
    }
    if (ability.execute) {
      if (!target) return { ok: false, reason: 'no target' };
      const thresh = ability.execute + ((cs.mods && cs.mods['w_execute.executeThreshold']) || 0);
      if (target.hp.current / target.hp.max > thresh) return { ok: false, reason: 'target too healthy' };
    }
    return { ok: true };
  }

  function startCast(caster, target, ability, log) {
    const chk = canUse(caster, target, ability);
    if (!chk.ok) return chk;
    const cs = getCombatStats(caster);
    const cost = costFor(ability, cs);
    if (caster.resource) caster.resource.current -= cost;
    caster.cooldowns[ability.id] = cdFor(ability, cs);
    caster.cooldowns['_gcd'] = GCD;
    const castTime = (ability.castTime || 0) * (1 - cs.hastePct * 0.5);
    if (castTime > 0.05) {
      caster.casting = { ability, target, remaining: castTime, total: castTime };
    } else {
      resolveAbility(caster, target, ability, log);
    }
    return { ok: true };
  }

  function tickCasting(caster, dt, log) {
    if (!caster.casting) return;
    caster.casting.remaining -= dt;
    if (caster.casting.remaining <= 0) {
      const { target, ability } = caster.casting;
      caster.casting = null;
      if (target ? target.alive : true) resolveAbility(caster, target, ability, log);
    }
  }
  function interruptCast(caster) { if (caster.casting) { caster.casting = null; return true; } return false; }

  function resolveAbility(caster, target, ability, log) {
    const cs = getCombatStats(caster);
    const push = m => log && log.push(m);
    if (ability.kind === 'gap') {
      const dist = target ? Math.min(ability.range, C.dist(caster.x, caster.y, target.x, target.y) - 1.2) : ability.range;
      const nx = caster.x + Math.cos(caster.angle) * (ability.blink ? ability.range : Math.max(0, dist));
      const ny = caster.y + Math.sin(caster.angle) * (ability.blink ? ability.range : Math.max(0, dist));
      if (!DS.world.blocked(caster.zone, nx, ny)) { caster.x = nx; caster.y = ny; }
      if (ability.rageGen && caster.resource) caster.resource.current = Math.min(cs.maxResource, caster.resource.current + ability.rageGen);
      push(`${caster.name || 'You'} use ${ability.name}.`);
      return;
    }
    if (ability.kind === 'buff') {
      const dur = (ability.buff.dur || 10) * (1 + ((cs.mods && cs.mods[ability.id + '.durPct']) || 0));
      const fields = {};
      if (ability.buff.apFlat) fields.apFlat = ability.buff.apFlat * (1 + ((cs.mods && cs.mods[ability.id + '.apFlatPct']) || 0));
      if (ability.buff.armorPct) fields.armorPct = ability.buff.armorPct;
      if (ability.buff.dmgPct) fields.dmgPct = ability.buff.dmgPct;
      if (ability.buff.dmgTakenPct) fields.dmgTakenPct = ability.buff.dmgTakenPct;
      if (ability.buff.speedPct) fields.speedPct = ability.buff.speedPct;
      if (ability.buff.dodgeFlat) fields.dodgeFlat = ability.buff.dodgeFlat;
      if (ability.buff.immune) fields.immune = true;
      if (ability.buff.energyRegenPct) fields.energyRegenPct = ability.buff.energyRegenPct;
      const buff = { key: ability.id, name: ability.name, icon: ability.icon, dur, fields };
      if (ability.buff.shield) {
        const amt = Math.round(ability.buff.shield * (ability.buff.scalesWith === 'sp' ? cs.spellPower : 40));
        buff.shieldRemaining = amt;
      }
      addBuff(target && !ability.self ? target : caster, buff);
      push(`${caster.name || 'You'} cast ${ability.name}.`);
      return;
    }
    if (ability.kind === 'utility') {
      if (ability.dropAggro) caster.aggroDropped = 2.0;
      push(`${caster.name || 'You'} use ${ability.name}.`);
      return;
    }
    if (!target || !target.alive) return;
    if (ability.kind === 'heal') {
      let amt = ability.power * cs.spellPower + caster.level * 1.5;
      amt *= 1 + ((cs.mods && cs.mods.healPowerPct) || 0) + ((cs.mods && cs.mods.spellDmgPct) || 0);
      const crit = rollCrit(cs.critChance);
      if (crit) amt *= 1.5;
      const healed = applyHeal(target, amt);
      if (ability.dot && ability.dot.heal) {
        addBuff(target, { key: ability.id, name: ability.name, icon: ability.icon, dur: ability.dot.ticks * ability.dot.interval, dot: ability.dot, ticksLeft: ability.dot.ticks, healPerTick: Math.round(ability.power * cs.spellPower * 0.4) });
      }
      push(`${ability.name} heals ${target.name || 'target'} for ${healed}${crit ? ' (crit)' : ''}.`);
      return;
    }
    // offensive: melee / ranged / aoe
    const bt = buffTotals(caster);
    const scaleStat = ability.scalesWith === 'sp' ? cs.spellPower : (cs.attackPower + bt.apFlat);
    let base = ability.power * scaleStat + caster.level * 1.3;
    if (ability.finisher) base *= Math.max(1, caster.comboPoints || 1);
    base *= 1 + ((cs.mods && cs.mods.spellDmgPct) || 0) + ((cs.mods && cs.mods.meleeDmgPct) || 0) + bt.dmgPct;
    const crit = rollCrit(cs.critChance);
    if (crit) base *= 1.5;
    let dealt = base;
    if (ability.scalesWith !== 'sp') {
      const tcs = getCombatStats(target);
      dealt = mitigatePhysical(dealt, tcs.armor || 0, caster.level);
    }
    const tbt = buffTotals(target);
    dealt *= 1 + tbt.dmgTakenPct;
    const finalDmg = applyDamage(target, dealt, {});
    if (ability.lifeStealPct && caster.hp) applyHeal(caster, finalDmg * ability.lifeStealPct);
    if (ability.generatesCombo && caster.comboPoints != null) caster.comboPoints = Math.min(5, caster.comboPoints + ability.generatesCombo);
    if (ability.finisher && caster.comboPoints != null) {
      const keep = (cs.mods && cs.mods.ruthlessnessChance) || 0;
      caster.comboPoints = C.chance(keep) ? 1 : 0;
    }
    if (ability.dot) {
      const perTick = Math.round((ability.power * scaleStat * 0.35 + caster.level) * (1 + tbt.dmgTakenPct));
      addBuff(target, { key: ability.id + '_dot', name: ability.name, icon: ability.icon, dur: ability.dot.ticks * ability.dot.interval, dot: ability.dot, ticksLeft: ability.dot.ticks, perTick, physical: ability.scalesWith !== 'sp', sourceId: caster.id });
    }
    if (ability.snarePct) addBuff(target, { key: 'snare', name: 'Slowed', icon: '❄️', dur: ability.snareDur || 4, kind: 'snare', fields: { snarePct: ability.snarePct } });
    if (ability.rootDur) addBuff(target, { key: 'root', name: 'Rooted', icon: '🌿', dur: ability.rootDur, kind: 'root' });
    if (ability.interrupt) interruptCast(target);
    if (ability.dropAggro) caster.aggroDropped = 2.0;
    push(`${caster.name || 'You'} hit ${target.name || 'target'} with ${ability.name} for ${finalDmg}${crit ? ' (crit)' : ''}.`);
  }

  function autoAttack(caster, target, log) {
    const cs = getCombatStats(caster);
    const dmg = mitigatePhysical((cs.attackPower || 6) * 0.55 + caster.level, getCombatStats(target).armor || 0, caster.level);
    const crit = rollCrit(cs.critChance);
    const dealt = applyDamage(target, crit ? dmg * 1.5 : dmg, {});
    log && log.push(`${caster.name || 'You'} swing at ${target.name || 'target'} for ${dealt}${crit ? ' (crit)' : ''}.`);
    if (caster.kind !== 'mob' && caster.resource && K.CLASSES[caster.cls].resource === 'rage') {
      caster.resource.current = Math.min(cs.maxResource, caster.resource.current + 4 + dealt * 0.05);
    }
    return dealt;
  }

  DS.combat = {
    GCD, getCombatStats, mitigatePhysical, rollCrit, addBuff, buffTotals, tickBuffs,
    tickCooldowns, tickResource, applyDamage, applyHeal, canUse, startCast, tickCasting,
    interruptCast, resolveAbility, autoAttack
  };
})(window.DS = window.DS || {});
