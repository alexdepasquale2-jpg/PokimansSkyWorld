/* DoomSpire — mob and companion brains, and loot rolls.
 *
 * A mob is a small state machine: idle until something wanders into its
 * aggro radius, then chase, melee, occasionally use its one special move,
 * and leash home if the target runs far enough. A companion is the same
 * movement loop pointed at the player instead of a spawn point, choosing
 * abilities with a two- or three-line heuristic instead of a script.
 */
(function (DS) {
  'use strict';
  const C = DS.core;
  const K = DS.content;
  let nextId = 1;

  function cloneCurated(key, rng) {
    const base = K.CURATED_ITEMS[key];
    const r = (rng ? rng() : Math.random());
    return Object.assign({}, base, { iid: base.iid + '_' + Math.floor(r * 1e9).toString(36), tplId: key });
  }

  function spawnMob(tplId, x, y, opts) {
    opts = opts || {};
    const tpl = K.BESTIARY[tplId];
    const level = opts.level || C.rndInt(tpl.level[0], tpl.level[1]);
    const maxHealth = Math.round(tpl.hp);
    const sprites = tpl.sprites || [tpl.icon];
    const mob = {
      id: 'm' + (nextId++), kind: 'mob', tplId, name: tpl.name, icon: tpl.icon,
      x, y, angle: Math.random() * Math.PI * 2, level, faction: tpl.faction,
      elite: !!tpl.elite, boss: !!tpl.boss, speed: tpl.speed,
      aggroRadius: tpl.aggroRadius, leashX: x, leashY: y, leashRadius: (opts.radius || 6) + 10,
      hp: { current: maxHealth, max: maxHealth },
      combat: {
        attackPower: Math.max(6, Math.round(tpl.dmg * 1.8)), spellPower: 0, armor: tpl.armor,
        maxHealth, maxResource: 0, resKind: null,
        critChance: tpl.boss ? 0.15 : tpl.elite ? 0.1 : 0.05, hastePct: 0, mods: {}
      },
      target: null, atkTimer: C.rnd(0.5, 1.4), abilityTimer: tpl.ability ? C.rnd(2, tpl.ability.every) : Infinity,
      enraged: false, buffs: [], cooldowns: {}, alive: true,
      sprites, spriteIdx: 0, walkAnimTime: 0
    };
    return mob;
  }

  function nearestHostileTarget(mob, candidates) {
    let best = null, bestD = mob.aggroRadius;
    candidates.forEach(c => {
      if (!c || !c.alive) return;
      const d = C.dist(mob.x, mob.y, c.x, c.y);
      if (d < bestD) { bestD = d; best = c; }
    });
    return best;
  }

  function updateMobSprite(mob, moved) {
    if (moved) {
      mob.walkAnimTime = (mob.walkAnimTime || 0) + 0.15;
      if (mob.walkAnimTime >= 0.5) {
        mob.walkAnimTime = 0;
        mob.spriteIdx = (mob.spriteIdx + 1) % mob.sprites.length;
      }
    }
    mob.icon = mob.sprites[mob.spriteIdx];
  }

  function tickMob(mob, candidates, zone, dt, log) {
    if (!mob.alive) return;
    DS.combat.tickCooldowns(mob, dt);
    DS.combat.tickBuffs(mob, dt);

    if (mob.enrageAbilityTpl == null) mob.enrageAbilityTpl = K.BESTIARY[mob.tplId].enrageAbility || null;
    const tpl = K.BESTIARY[mob.tplId];
    if (tpl.enrageAt && !mob.enraged && mob.hp.current / mob.hp.max <= tpl.enrageAt) {
      mob.enraged = true;
      log && log.push(`${mob.name} flies into a rage!`);
    }

    if (mob.target && (!mob.target.alive || C.dist(mob.x, mob.y, mob.target.x, mob.target.y) > mob.aggroRadius * 2.2)) mob.target = null;
    if (!mob.target) mob.target = nearestHostileTarget(mob, candidates);
    if (C.dist(mob.x, mob.y, mob.leashX, mob.leashY) > mob.leashRadius) {
      mob.target = null;
      const dx = mob.leashX - mob.x, dy = mob.leashY - mob.y, d = Math.hypot(dx, dy) || 1;
      const step = mob.speed * dt * 1.6;
      const nx = mob.x + (dx / d) * step, ny = mob.y + (dy / d) * step;
      if (!DS.world.blocked(zone, nx, ny)) { mob.x = nx; mob.y = ny; updateMobSprite(mob, true); }
      mob.hp.current = Math.min(mob.hp.max, mob.hp.current + mob.hp.max * 0.15 * dt);
      return;
    }
    if (!mob.target) { updateMobSprite(mob, false); return; }

    const d = C.dist(mob.x, mob.y, mob.target.x, mob.target.y);
    mob.angle = Math.atan2(mob.target.y - mob.y, mob.target.x - mob.x);
    const meleeRange = 1.5;
    if (d > meleeRange) {
      const step = mob.speed * dt;
      const nx = mob.x + Math.cos(mob.angle) * step, ny = mob.y + Math.sin(mob.angle) * step;
      let moved = false;
      if (!DS.world.blocked(zone, nx, ny)) { mob.x = nx; mob.y = ny; moved = true; }
      else if (!DS.world.blocked(zone, nx, mob.y)) { mob.x = nx; moved = true; }
      else if (!DS.world.blocked(zone, mob.x, ny)) { mob.y = ny; moved = true; }
      updateMobSprite(mob, moved);
    } else {
      mob.atkTimer -= dt;
      if (mob.atkTimer <= 0) {
        mob.atkTimer = 1.3 + Math.random() * 0.6;
        DS.combat.autoAttack(mob, mob.target, log);
      }
      updateMobSprite(mob, false);
    }
    const ability = mob.enraged && mob.enrageAbilityTpl ? mob.enrageAbilityTpl : tpl.ability;
    if (ability) {
      mob.abilityTimer -= dt;
      if (mob.abilityTimer <= 0 && d <= ability.radius + 3) {
        mob.abilityTimer = ability.every;
        [mob.target].concat(candidates.filter(c => c !== mob.target && c && c.alive && C.dist(mob.x, mob.y, c.x, c.y) <= ability.radius))
          .forEach(t => { if (t && t.alive) DS.combat.applyDamage(t, ability.dmg, {}); });
        log && log.push(`${mob.name} uses ${ability.name}!`);
      }
    }
  }

  // --- companions -----------------------------------------------------------
  const COMPANION_DEFS = {
    bruggo: { id: 'bruggo', name: 'Bruggo Ironhide', icon: '🛡️', cls: 'warrior', role: 'tank' },
    vell: { id: 'vell', name: 'Sister Vell', icon: '✝️', cls: 'priest', role: 'heal' }
  };

  function makeCompanionActor(id, player) {
    const def = COMPANION_DEFS[id];
    const actor = {
      kind: 'companion', id: 'c_' + id, defId: id, name: def.name, icon: def.icon, cls: def.cls,
      level: player.level, x: player.x, y: player.y, angle: player.angle, zone: player.zone,
      equip: {}, talents: {}, hp: { current: 1, max: 1 }, resource: { current: null },
      comboPoints: 0, buffs: [], cooldowns: {}, alive: true,
      sprites: [def.icon], spriteIdx: 0, walkAnimTime: 0
    };
    DS.player.refreshVitals(actor);
    actor.hp.current = actor.hp.max;
    actor.resource.current = actor.resource.max;
    return actor;
  }

  function tickCompanion(comp, player, mobs, dt, zone, log) {
    if (!comp.alive) {
      comp.reviveTimer = (comp.reviveTimer || 0) - dt;
      if (comp.reviveTimer <= 0) { comp.alive = true; comp.hp.current = Math.round(comp.hp.max * 0.5); comp.reviveTimer = null; }
      return;
    }
    DS.combat.tickCooldowns(comp, dt);
    DS.combat.tickBuffs(comp, dt);
    DS.combat.tickResource(comp, dt, !!comp.inCombat);
    DS.combat.tickCasting(comp, dt, log);

    const followD = C.dist(comp.x, comp.y, player.x, player.y);
    const abilities = DS.player.abilityList(comp);
    const def = COMPANION_DEFS[comp.defId];
    const liveMobs = mobs.filter(m => m.alive);
    const nearest = liveMobs.reduce((best, m) => {
      const d = C.dist(comp.x, comp.y, m.x, m.y);
      return (d < 14 && (!best || d < best.d)) ? { m, d } : best;
    }, null);
    comp.inCombat = !!nearest;

    if (def.role === 'heal') {
      const woundedAlly = [player, comp].filter(a => a.alive && a.hp.current / a.hp.max < 0.75)
        .sort((a, b) => (a.hp.current / a.hp.max) - (b.hp.current / b.hp.max))[0];
      if (woundedAlly && !comp.casting) {
        const heal = abilities.find(a => a.kind === 'heal' && a.id !== 'pr_renew') || abilities.find(a => a.kind === 'heal');
        if (heal) { comp.angle = Math.atan2(woundedAlly.y - comp.y, woundedAlly.x - comp.x); DS.combat.startCast(comp, woundedAlly, heal, log); }
      } else if (nearest && nearest.d <= 20 && !comp.casting) {
        const dmg = abilities.find(a => a.kind === 'ranged');
        if (dmg) { comp.angle = Math.atan2(nearest.m.y - comp.y, nearest.m.x - comp.x); DS.combat.startCast(comp, nearest.m, dmg, log); }
      }
      moveToward(comp, player, followD > 3.5 ? player : (nearest && nearest.d > 8 ? null : player), zone, dt, 3.5);
      return;
    }

    // tank/melee companion: stick close to whatever the player is fighting
    if (nearest && nearest.d <= 1.6) {
      comp.angle = Math.atan2(nearest.m.y - comp.y, nearest.m.x - comp.x);
      comp.atkTimer = (comp.atkTimer || 0) - dt;
      if (comp.atkTimer <= 0) { comp.atkTimer = 1.4; DS.combat.autoAttack(comp, nearest.m, log); }
      const shout = abilities.find(a => a.id === 'w_shout');
      if (shout && DS.combat.canUse(comp, comp, shout).ok && Math.random() < 0.02) DS.combat.startCast(comp, comp, shout, log);
    } else if (nearest) {
      moveTowardPoint(comp, nearest.m.x, nearest.m.y, zone, dt, 2.6);
    } else {
      moveTowardPoint(comp, player.x, player.y, zone, dt, followD > 2 ? 3.0 : 0);
    }
  }
  function moveTowardPoint(actor, tx, ty, zone, dt, speed) {
    if (!speed) { if (actor.sprites) updateMobSprite(actor, false); return; }
    const dx = tx - actor.x, dy = ty - actor.y, d = Math.hypot(dx, dy) || 1;
    if (d < 0.3) { if (actor.sprites) updateMobSprite(actor, false); return; }
    actor.angle = Math.atan2(dy, dx);
    const step = speed * dt;
    const nx = actor.x + (dx / d) * step, ny = actor.y + (dy / d) * step;
    let moved = false;
    if (!DS.world.blocked(zone, nx, ny)) { actor.x = nx; actor.y = ny; moved = true; }
    if (actor.sprites) updateMobSprite(actor, moved);
  }
  function moveToward(comp, player, target, zone, dt, speed) {
    if (!target) return;
    moveTowardPoint(comp, target.x, target.y, zone, dt, C.dist(comp.x, comp.y, player.x, player.y) > 1.5 ? speed : 0);
  }

  // --- loot -----------------------------------------------------------------
  function rollLoot(mob, rng) {
    rng = rng || Math.random;
    const tpl = K.BESTIARY[mob.tplId];
    const table = K.LOOT_TABLES[tpl.loot];
    const result = { gold: C.rndInt(table.gold[0], table.gold[1]), item: null, questItem: null };
    if (tpl.dropItem && rng() < tpl.dropItem.chance) result.questItem = cloneCurated(tpl.dropItem.id, rng);
    let guaranteedHit = null;
    (table.guaranteed || []).forEach(g => { if (!guaranteedHit && rng() < g.chance) guaranteedHit = g.id; });
    if (guaranteedHit) { result.item = cloneCurated(guaranteedHit, rng); return result; }
    if (rng() < table.itemChance) {
      const slot = C.pick(K.SLOTS);
      const ilvl = Math.max(1, mob.level + table.ilvlBonus);
      const quality = K.rollQuality(rng, table.qualityFloor);
      result.item = K.rollItem(rng, ilvl, slot, quality);
    }
    return result;
  }

  DS.ai = { spawnMob, tickMob, makeCompanionActor, tickCompanion, rollLoot, cloneCurated, COMPANION_DEFS };
})(window.DS = window.DS || {});
