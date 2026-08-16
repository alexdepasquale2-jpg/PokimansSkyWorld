/* DoomSpire — the tick: turning and movement, targeting, combat, respawns,
 * and the automatic zone exit at a map edge. Everything else (panels,
 * rendering) reads what this produces.
 */
(function (DS) {
  'use strict';
  const C = DS.core;
  const K = DS.content;
  const CB = DS.combat;

  const MOVE_SPEED = 3.3;
  const AUTO_ATTACK_RANGE = 1.7;
  const TARGET_RANGE = 22;
  const TARGET_CONE = 0.55;
  const LOG_MAX = 60;

  function log(game, msg) {
    game.combatLog.push(msg);
    if (game.combatLog.length > LOG_MAX) game.combatLog.splice(0, game.combatLog.length - LOG_MAX);
  }

  function pickTarget(player, mobs) {
    const cur = mobs.find(m => m.id === player.__targetId && m.alive);
    if (cur && C.dist(player.x, player.y, cur.x, cur.y) <= TARGET_RANGE * 1.3) return cur;
    let best = null, bestScore = Infinity;
    mobs.forEach(m => {
      if (!m.alive) return;
      const d = C.dist(player.x, player.y, m.x, m.y);
      if (d > TARGET_RANGE) return;
      const ang = Math.atan2(m.y - player.y, m.x - player.x);
      const diff = Math.abs(C.angDelta(player.angle, ang));
      if (diff > TARGET_CONE && d > 2.2) return;
      const score = d + diff * 5;
      if (score < bestScore) { bestScore = score; best = m; }
    });
    return best;
  }

  function moveActor(actor, mx, my, speed, dt, zoneId) {
    const len = Math.hypot(mx, my);
    if (len < 1e-4) return;
    if (len > 1) { mx /= len; my /= len; }
    const fx = Math.cos(actor.angle), fy = Math.sin(actor.angle);
    const rx = -Math.sin(actor.angle), ry = Math.cos(actor.angle);
    const wx = fx * (-my) + rx * mx, wy = fy * (-my) + ry * mx;
    const step = speed * dt;
    const nx = actor.x + wx * step, ny = actor.y + wy * step;
    if (!DS.world.blocked(zoneId, nx, ny)) { actor.x = nx; actor.y = ny; }
    else if (!DS.world.blocked(zoneId, nx, actor.y)) actor.x = nx;
    else if (!DS.world.blocked(zoneId, actor.x, ny)) actor.y = ny;
  }

  function handleMobDeath(game, mob) {
    if (mob.deathProcessed) return;
    mob.deathProcessed = true;
    const player = game.player;
    const tpl = K.BESTIARY[mob.tplId];
    const gained = DS.player.grantXP(player, tpl.xp);
    log(game, `${mob.name} dies. (+${tpl.xp} xp${gained.leveled ? `, level ${player.level}!` : ''})`);
    const loot = DS.ai.rollLoot(mob);
    if (loot.gold) { player.gold += loot.gold; }
    if (loot.item) { if (!DS.player.addItem(player, loot.item)) log(game, `Bags full — ${loot.item.name} was lost.`); else log(game, `Loot: ${loot.item.name}.`); }
    if (loot.questItem) {
      if (!DS.player.addItem(player, loot.questItem)) log(game, `Bags full — ${loot.questItem.name} was lost.`);
      else { log(game, `Picked up ${loot.questItem.name}.`); DS.player.noteCollect(player, loot.questItem.tplId); }
    }
    DS.player.noteKill(player, mob.tplId);
    if (player.__targetId === mob.id) player.__targetId = null;
  }

  function respawnPlayer(game) {
    const player = game.player;
    const zone = K.ZONES[player.zone] || K.ZONES.scar;
    player.zone = zone.id;
    player.x = zone.spawn.x; player.y = zone.spawn.y; player.angle = zone.spawn.facing || 0;
    player.alive = true;
    DS.player.refreshVitals(player);
    player.hp.current = player.hp.max;
    player.gold = Math.max(0, player.gold - Math.round(player.gold * 0.1));
    DS.state.ensureZoneRuntime(game, player.zone);
    log(game, 'You return to the world, a little poorer.');
  }

  function useAbility(game, abilityId) {
    const player = game.player;
    if (!player.alive) return { ok: false, reason: 'dead' };
    const ability = DS.player.abilityList(player).find(a => a.id === abilityId);
    if (!ability) return { ok: false, reason: 'unknown' };
    const target = ability.self || ability.kind === 'buff' || ability.kind === 'heal' || ability.kind === 'utility' ? player : game.target;
    const res = CB.startCast(player, target, ability, game.combatLog);
    if (game.combatLog.length > LOG_MAX) game.combatLog.splice(0, game.combatLog.length - LOG_MAX);
    return res;
  }

  function tick(game, dt, input) {
    const player = game.player;
    const rt = DS.state.currentRuntime(game);
    const companions = DS.state.syncCompanions(game).filter(c => player.companions[c.defId] && player.companions[c.defId].recruited);
    game.clock += dt;

    if (!player.alive) return;

    const axes = input.frameAxes();
    player.angle += axes.turn;

    const bt = CB.buffTotals(player);
    const speedMult = (1 + bt.speedPct) * (1 - bt.snaredPct) * (bt.rooted ? 0 : 1);
    if (!player.casting) moveActor(player, axes.mx, axes.my, MOVE_SPEED * speedMult, dt, player.zone);

    CB.tickCooldowns(player, dt);
    CB.tickBuffs(player, dt);
    CB.tickCasting(player, dt, game.combatLog);

    const liveMobs = rt.mobs.filter(m => m.alive);
    const target = pickTarget(player, liveMobs);
    player.__targetId = target ? target.id : null;
    game.target = target;

    const inCombat = !!target || liveMobs.some(m => m.target === player || companions.includes(m.target));
    CB.tickResource(player, dt, inCombat);

    player.autoAttackTimer = (player.autoAttackTimer || 0) - dt;
    if (target && !player.casting && C.dist(player.x, player.y, target.x, target.y) <= AUTO_ATTACK_RANGE) {
      if (player.autoAttackTimer <= 0) { player.autoAttackTimer = 1.9; CB.autoAttack(player, target, game.combatLog); }
    }

    companions.forEach(c => DS.ai.tickCompanion(c, player, liveMobs, dt, player.zone, game.combatLog));
    rt.mobs.forEach(m => {
      if (m.alive) DS.ai.tickMob(m, [player].concat(companions), player.zone, dt, game.combatLog);
      else handleMobDeath(game, m);
    });
    DS.world.tickRespawns(rt, dt);

    if (game.combatLog.length > LOG_MAX) game.combatLog.splice(0, game.combatLog.length - LOG_MAX);

    if (player.hp.current <= 0 && player.alive) { player.alive = false; log(game, 'You have fallen.'); }

    const exit = DS.world.checkAutoTransition(player, rt);
    if (exit) {
      DS.state.warp(game, exit.toZone, exit.toX, exit.toY, exit.toFacing);
      log(game, `You enter ${K.ZONES[exit.toZone].name}.`);
    }
  }

  DS.sim = { tick, useAbility, pickTarget, respawnPlayer, log, MOVE_SPEED, AUTO_ATTACK_RANGE };
})(window.DS = window.DS || {});
