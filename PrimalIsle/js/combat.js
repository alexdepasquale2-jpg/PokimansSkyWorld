/* Primal Isle — bites, bleeding, and what a body leaves behind.
 *
 * There are no combos and no dodge button. A fight is decided by who is
 * bigger, who brought friends, what each of them mutated into, and who has
 * stamina left to leave.
 */
(function (ISLE) {
  'use strict';
  const C = ISLE.content;
  const D = ISLE.dino;
  const MU = ISLE.mutations;
  const { clamp, dist, angDelta, chance } = ISLE.core;

  const mod = (d, k) => MU.mod(d, k);

  /* The animal in front of you, within reach, closest first. */
  function biteTarget(g, a) {
    let best = null, bestD = Infinity;
    const ar = D.radius(a);
    for (const b of g.dinos) {
      if (b === a || !b.alive) continue;
      if (b.group && b.group === a.group) continue;      // no biting the herd
      const dd = dist(a.x, a.y, b.x, b.y);
      const reach = (ar + D.radius(b)) * C.COMBAT.biteReach;
      if (dd > reach) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (Math.abs(angDelta(a.ang, ang)) > C.COMBAT.biteArc) continue;
      if (dd < bestD) { bestD = dd; best = b; }
    }
    return best;
  }

  function canBite(a) { return a.alive && a.biteT <= 0 && a.stam > C.COMBAT.biteStam * 0.5; }

  function bite(g, a) {
    if (!canBite(a)) return null;
    const b = biteTarget(g, a);
    a.biteT = D.biteCd(a);
    a.stam = clamp(a.stam - C.COMBAT.biteStam, 0, D.maxStam(a));
    a.combatT = C.COMBAT.combatMemory;
    if (!b) return { miss: true };

    let dmg = D.damage(a);
    // Ambush Predator: the first bite on something that has not been in a
    // fight yet lands twice as hard.
    const ambushed = mod(a, 'ambush') && b.combatT <= 0;
    if (ambushed) dmg *= 2;

    const dealt = D.hurt(g, b, dmg, a);
    b.combatT = C.COMBAT.combatMemory;

    if (mod(a, 'lifesteal')) D.heal(g, a, dealt * mod(a, 'lifesteal'));

    // Wounds. Bleeding is what kills the ones that get away.
    const sizeEdge = clamp(D.mass(a) / Math.max(0.01, D.mass(b)), 0.3, 3);
    const bleedChance = (C.COMBAT.bleedChance + mod(a, 'bleedOn')) * clamp(sizeEdge, 0.4, 1.6);
    if (chance(bleedChance)) {
      b.bleed = Math.min(5, b.bleed + 1);
      b.bleedT = C.NEEDS.bleedDur;
    }
    if (chance(C.COMBAT.boneChance * sizeEdge) && !b.bone) {
      b.bone = 1; b.boneT = C.NEEDS.boneHeal;
    }

    // Knockback, for the species and the mutations built around it.
    const kb = (D.species(a).knockback || 0) + mod(a, 'knock');
    if (kb) {
      const push = kb * clamp(sizeEdge, 0.2, 2.2);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      b.x += Math.cos(ang) * push;
      b.y += Math.sin(ang) * push;
      b.stam = clamp(b.stam - push * 0.12, 0, D.maxStam(b));
    }

    const res = { target: b, dmg: dealt, killed: !b.alive, ambushed };
    if (!b.alive) onKill(g, a, b);
    return res;
  }

  function onKill(g, killer, victim) {
    victim.alive = false;
    victim.diedAt = g.clock;
    killer.kills++;
    makeCarcass(g, victim);

    // Apex Instinct: a kill puts you back to full.
    if (mod(killer, 'killheal')) D.heal(g, killer, D.maxHp(killer));

    if (killer.player) {
      ISLE.shop.onKill(g, victim);
      ISLE.sim.feed(g, `You killed ${victim.name} (${D.label(victim)} ${D.species(victim).name}).`, 'good');
    } else if (victim.player) {
      ISLE.sim.feed(g, `${victim.name} was killed by ${killer.name}.`, 'bad');
    } else {
      ISLE.sim.feed(g, `${killer.name} killed ${victim.name}.`, 'dim');
    }
  }

  function makeCarcass(g, d) {
    g.carcasses.push({
      x: d.x, y: d.y, sp: d.sp, name: d.name,
      growth: d.growth,
      meat: 0.5 + 2.6 * d.growth * D.species(d).bulk,
      age: 0, seedv: (Math.random() * 1000) | 0
    });
    if (g.carcasses.length > 40) g.carcasses.shift();
  }

  function tickCarcasses(g, dt) {
    for (let i = g.carcasses.length - 1; i >= 0; i--) {
      const c = g.carcasses[i];
      c.age += dt;
      if (c.age > C.CARCASS_ROT * 1.8 || c.meat <= 0.02) g.carcasses.splice(i, 1);
    }
  }

  function carcassNear(g, x, y, r) {
    let best = null, bd = r;
    for (const c of g.carcasses) {
      const dd = dist(x, y, c.x, c.y);
      if (dd < bd && c.meat > 0.02) { bd = dd; best = c; }
    }
    return best;
  }

  /* Would I win? Used by the AI to decide, and by the threat readout to tell
   * the player what the thing across the clearing is going to do about them. */
  function matchup(a, b) {
    const mine = D.damage(a) * (a.hp / Math.max(1, D.maxHp(a))) * (0.6 + 0.4 * a.stam / D.maxStam(a));
    const theirs = D.damage(b) * (b.hp / Math.max(1, D.maxHp(b))) * (0.6 + 0.4 * b.stam / D.maxStam(b));
    const durability = D.maxHp(a) / Math.max(1, D.maxHp(b));
    return (mine / Math.max(0.01, theirs)) * Math.sqrt(durability);
  }

  ISLE.combat = { bite, canBite, biteTarget, onKill, makeCarcass, tickCarcasses, carcassNear, matchup };
})(window.ISLE = window.ISLE || {});
