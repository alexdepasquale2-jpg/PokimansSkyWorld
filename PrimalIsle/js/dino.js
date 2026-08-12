/* Primal Isle — one animal, whether a player is steering it or not.
 *
 * The player's dinosaur and the thirty-odd others on the server run through
 * exactly the same functions. That is deliberate: it is the only way the
 * shop's advantages and the run's mutations are honestly reflected in what the
 * lobby does to you, and it lets the balance harness play both sides.
 *
 * Every stat here is: species base × growth scale × (1 + mutation modifiers),
 * in that order.
 */
(function (ISLE) {
  'use strict';
  const C = ISLE.content;
  const W = ISLE.world;
  const MU = ISLE.mutations;
  const { clamp, lerp, rnd, dist, turnToward } = ISLE.core;

  let nextId = 1;
  const mod = (d, k) => MU.mod(d, k);

  function make(opts) {
    const sp = C.SPECIES[opts.sp];
    const growth = opts.growth != null ? opts.growth : C.HATCH_GROWTH;
    const d = {
      id: opts.id || ('d' + (nextId++)),
      name: opts.name || sp.name,
      sp: sp.id,
      growth,
      x: opts.x || 0, y: opts.y || 0,
      ang: opts.ang != null ? opts.ang : rnd(0, Math.PI * 2),
      vx: 0, vy: 0, speed: 0,
      hp: 1, hunger: 78, thirst: 78, stam: 100,
      bleed: 0, bleedT: 0, bone: 0, boneT: 0, salt: 0,
      biteT: 0, combatT: 0, callT: 0, restT: 0,
      alive: true, group: opts.group || null,
      player: !!opts.player, whale: !!opts.whale, skin: opts.skin || null,
      kills: 0, born: opts.clock || 0, meals: 0,
      buffs: {},                     // armor / reveal, each { v, t }
      muts: opts.muts ? opts.muts.slice() : [],
      mods: {},
      mutMiles: 0,
      usedUndying: false,
      lastHitBy: null, lastHitT: 0,
      protect: C.SPAWN_PROTECT,      // briefly hard to notice, after hatching
      ai: null
    };
    MU.recompute(d);
    d.hp = maxHp(d);
    d.stam = maxStam(d);
    return d;
  }

  const species = d => C.SPECIES[d.sp];
  const scale = d => C.scaleOf(d.growth);
  const radius = d => species(d).size * C.sizeScale(d.growth);
  const maxHp = d => species(d).hp * scale(d) * (1 + mod(d, 'hp'));
  const maxStam = d => species(d).stam * (0.6 + 0.4 * d.growth) * (1 + mod(d, 'stamMax'));

  /* Weight decides who wins a shove and who can eat whom. */
  const mass = d => species(d).bulk * Math.pow(d.growth, 1.6) * species(d).size;
  const tier = d => species(d).tier * (0.35 + 0.65 * d.growth);

  /* Adrenal Glands and the like are conditional, so damage is computed rather
   * than cached. */
  function damage(d) {
    let v = species(d).dmg * scale(d) * (1 + mod(d, 'dmg'));
    if (d.bone) v *= 0.82;
    if (mod(d, 'lowHp') && d.hp < maxHp(d) * 0.34) v *= 1.35;
    const pack = species(d).packBonus * (1 + mod(d, 'pack'));
    if (d.groupSize > 1) v *= 1 + pack * Math.min(3, d.groupSize - 1);
    return v;
  }

  function biteCd(d) {
    return species(d).biteCd * (1 + mod(d, 'biteCd')) * (d.bone ? 1.25 : 1);
  }

  function speedOf(g, d) {
    const sp = species(d);
    let v = sp.spd * (0.55 + 0.45 * Math.pow(d.growth, 0.55)) * (1 + mod(d, 'spd'));
    v *= W.slowAt(g.world, d.x, d.y);
    if (W.isWater(g.world, d.x, d.y)) v *= sp.swim * (1 + mod(d, 'swim'));
    if (d.bone) v *= C.NEEDS.boneSlow;
    if (d.salt > 0) v *= 0.88;
    if (d.hunger < 12 || d.thirst < 12) v *= 0.8;
    if (mod(d, 'lowHp') && d.hp < maxHp(d) * 0.34) v *= 1.2;
    return v;
  }

  /* How far this animal can make anything out, right now. Night is the great
   * equaliser, except for whatever has paid or mutated its way around it. */
  function vision(g, d) {
    const day = W.daylight(g.clock);
    const night = clamp(species(d).night + mod(d, 'night'), 0, 1);
    const dark = lerp(C.NIGHT_VISION_FLOOR + night * (1 - C.NIGHT_VISION_FLOOR), 1, day);
    let r = (420 + 520 * d.growth) * dark * (1 + mod(d, 'vision'));
    if (d.buffs.reveal) r = 1e5;
    return r;
  }

  /* How visible this animal is to others: big things in the open are seen. */
  function conspicuity(g, d) {
    const cover = W.coverAt(g.world, d.x, d.y);
    let v = (0.35 + 1.15 * d.growth) * (1 - cover * 0.75) * (d.speed > 40 ? 1.25 : 1);
    v *= clamp(1 - mod(d, 'quiet'), 0.25, 1);
    if (d.protect > 0) v *= 0.25;
    return v;
  }

  function canSee(g, watcher, target) {
    return dist(watcher.x, watcher.y, target.x, target.y) < vision(g, watcher) * conspicuity(g, target);
  }

  // --- needs -------------------------------------------------------------
  function tickNeeds(g, d, dt) {
    const sp = species(d);
    const bulk = sp.bulk * (0.45 + 0.55 * d.growth);
    const club = d.player && ISLE.shop.clubActive(g) ? ISLE.store.CLUB.hungerMult : 1;
    const hMul = club * (1 + mod(d, 'hunger'));
    const tMul = club * (1 + mod(d, 'thirst'));

    d.hunger = clamp(d.hunger - C.NEEDS.hungerDrain * bulk * hMul * dt, 0, 100);
    d.thirst = clamp(d.thirst - C.NEEDS.thirstDrain * bulk * tMul * dt, 0, 100);

    // Symbiotic Algae: daylight is a slow meal.
    if (mod(d, 'photo')) {
      const day = W.daylight(g.clock);
      d.hunger = clamp(d.hunger + 1.6 * day * dt, 0, 100);
      d.thirst = clamp(d.thirst + 1.1 * day * dt, 0, 100);
    }

    if (d.salt > 0) {
      d.salt -= dt;
      d.thirst = clamp(d.thirst - 0.5 * dt, 0, 100);
    }

    if (!d.sprinting) {
      const rest = d.speed < 8 ? 1.65 : 1;
      d.stam = clamp(d.stam + sp.stamRegen * (1 + mod(d, 'stamRegen')) * rest * dt, 0, maxStam(d));
    }

    // Wounds.
    if (d.bleed > 0) {
      d.bleedT -= dt * (1 + mod(d, 'bleedRes') * 2);
      hurt(g, d, C.NEEDS.bleedDps * d.bleed * (1 - clamp(mod(d, 'bleedRes'), 0, 0.9)) * dt, null, true);
      if (d.bleedT <= 0) { d.bleed = Math.max(0, d.bleed - 1); d.bleedT = C.NEEDS.bleedDur * 0.5; }
    }
    if (d.bone) {
      d.boneT -= dt;
      if (d.boneT <= 0) d.bone = 0;
    }

    // Starvation and thirst kill, slowly, which is the point of the timers.
    if (d.hunger <= 0) hurt(g, d, C.NEEDS.starveDps * dt, null, true);
    if (d.thirst <= 0) hurt(g, d, C.NEEDS.thirstDps * dt, null, true);

    // Drowning: deep water is not a shortcut unless you swim well.
    if (W.isDeep(g.world, d.x, d.y) && species(d).swim * (1 + mod(d, 'swim')) < 1.2) {
      d.stam = clamp(d.stam - 9 * dt, 0, maxStam(d));
      if (d.stam <= 0) hurt(g, d, 8 * dt, null, true);
    }

    // Healing, when everything else is in order — or always, if it mutated.
    const knits = mod(d, 'regen');
    const canHeal = d.combatT <= 0 && (knits ? d.hunger > 15 : (d.hunger > C.NEEDS.healHunger && d.thirst > 30 && !d.bleed));
    if (canHeal) {
      d.hp = Math.min(maxHp(d), d.hp + C.NEEDS.healPerSec * (1 + knits) * scale(d) * dt);
    }

    d.combatT = Math.max(0, d.combatT - dt);
    d.biteT = Math.max(0, d.biteT - dt);
    d.callT = Math.max(0, d.callT - dt);
    if (d.protect > 0) d.protect -= dt;

    for (const k in d.buffs) {
      const b = d.buffs[k];
      b.t -= dt;
      if (b.t <= 0) delete d.buffs[k];
    }

    tickGrowth(g, d, dt);
  }

  /* Growth only moves while fed and watered. Everything the shop sells is
   * ultimately a way around this line. */
  function tickGrowth(g, d, dt) {
    if (d.growth >= C.ADULT) { d.growth = C.ADULT; return; }
    if (d.hunger < C.NEEDS.growthHunger || d.thirst < C.NEEDS.growthThirst) { d.growthStalled = true; return; }
    d.growthStalled = false;
    let rate = C.NEEDS.growthPerSec * species(d).growthRate * (1 + mod(d, 'growth'));
    if (d.player) rate *= ISLE.shop.growthMult(g);
    else if (d.whale) rate *= 1.35;
    const before = d.growth;
    d.growth = Math.min(C.ADULT, d.growth + rate * dt);
    if (d.player) ISLE.shop.onGrowth(g, d.growth - before);
    // Growing costs food: bigger animal, emptier stomach.
    d.hunger = clamp(d.hunger - (d.growth - before) * 26, 0, 100);
  }

  function hurt(g, d, amount, from, silent) {
    if (!d.alive) return 0;
    if (d.buffs.armor) amount *= 1 - d.buffs.armor.v;
    amount *= clamp(1 - mod(d, 'armor'), 0.2, 1);
    d.hp -= amount;
    if (!silent) {
      d.combatT = C.COMBAT.combatMemory;
      d.lastHitBy = from ? from.id : d.lastHitBy;
      d.lastHitT = g.clock;
    }
    if (d.hp <= 0) {
      // Undying: one killing blow a life leaves you standing on nothing.
      if (mod(d, 'undying') && !d.usedUndying) {
        d.usedUndying = true;
        d.hp = 1;
        d.buffs.armor = { v: 0.6, t: 4 };
        if (d.player) ISLE.sim.feed(g, 'Undying — you should be dead. You are not, yet.', 'great');
      } else {
        d.hp = 0; d.alive = false; d.killer = from ? from.id : null;
      }
    }
    return amount;
  }

  function heal(g, d, amount) { d.hp = Math.min(maxHp(d), d.hp + amount); }

  function clearWounds(d) { d.bleed = 0; d.bleedT = 0; d.bone = 0; d.boneT = 0; }

  // --- feeding -----------------------------------------------------------
  /* Nutrition falls off as you grow unless the food is good. A grown herbivore
   * living on ferns is losing ground; a Ruminant Gut is how it stops. */
  function nutritionMul(d, quality) {
    const need = 0.25 + 0.75 * d.growth;
    return clamp(quality / need, 0.18, 1.35);
  }

  function eatNode(g, d, n) {
    if (!n || n.amt < 0.25) return 0;
    const def = W.nodeDef(n);
    const bonus = 1 + mod(d, n.kind === 'plant' ? 'plantFood' : 'meatFood');
    const gain = def.food * nutritionMul(d, def.quality) * n.amt * bonus;
    d.hunger = clamp(d.hunger + gain, 0, 100);
    n.amt = 0;
    d.meals++;
    if (d.player) ISLE.shop.onEat(g, n.kind);
    return gain;
  }

  function eatCarcass(g, d, car) {
    if (!car || car.meat <= 0) return 0;
    // Iron Stomach does not care how long that has been lying there.
    const rot = mod(d, 'scavenge') ? 1 : clamp(1 - car.age / C.CARCASS_ROT, 0.15, 1);
    const bite = Math.min(car.meat, 0.16 + 0.2 * d.growth);
    const gain = 130 * bite * nutritionMul(d, C.MEAT_QUALITY * rot) * (1 + mod(d, 'meatFood'));
    car.meat -= bite;
    d.hunger = clamp(d.hunger + gain, 0, 100);
    d.meals++;
    if (d.player) ISLE.shop.onEat(g, 'meat');
    return gain;
  }

  function drink(g, d, dt) {
    const kind = W.drinkableAt(g.world, d.x, d.y);
    if (!kind) return null;
    if (kind === 'fresh' || mod(d, 'saltproof')) {
      d.thirst = clamp(d.thirst + 42 * dt, 0, 100);
      return 'fresh';
    }
    d.thirst = clamp(d.thirst + 12 * dt, 0, 100);
    d.salt = C.NEEDS.saltSick;
    return kind;
  }

  // --- movement ----------------------------------------------------------
  /* `input` is { mx, my, sprint }. The AI builds exactly the same shape, so
   * the steering code is shared. */
  function steer(g, d, input, dt) {
    const mag = Math.hypot(input.mx, input.my);
    const wantSprint = !!input.sprint && mag > 0.55 && d.stam > 1;
    d.sprinting = wantSprint;

    let sp = speedOf(g, d);
    if (wantSprint) {
      sp *= species(d).sprint;
      const drain = species(d).stamDrain * (1 + mod(d, 'stamDrain')) *
        (W.isWater(g.world, d.x, d.y) && mod(d, 'swim') ? 0 : 1);
      d.stam = clamp(d.stam - drain * C.COMBAT.sprintTax * dt, 0, maxStam(d));
      if (d.stam <= 0) d.sprinting = false;
    }
    if (d.stam < 12 && !wantSprint) sp *= 0.9;

    if (mag > 0.06) {
      /* Big animals turn like ships. It is the only defence a hatchling has. */
      const agility = 3.4 - 1.5 * d.growth;
      d.ang = turnToward(d.ang, Math.atan2(input.my, input.mx), agility * dt);
      d.speed = lerp(d.speed, sp * Math.min(1, mag), Math.min(1, dt * 6));
    } else {
      d.speed = lerp(d.speed, 0, Math.min(1, dt * 7));
    }

    d.vx = Math.cos(d.ang) * d.speed;
    d.vy = Math.sin(d.ang) * d.speed;
    d.x += d.vx * dt;
    d.y += d.vy * dt;

    const m = 30;
    d.x = clamp(d.x, m, C.WORLD - m);
    d.y = clamp(d.y, m, C.WORLD - m);
  }

  /* Simple separation so animals do not stack into one pixel. */
  function separate(g, list) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        const rr = radius(a) + radius(b);
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 < 0.0001) continue;
        const dd = Math.sqrt(d2);
        const push = (rr - dd) / 2;
        const ux = dx / dd, uy = dy / dd;
        const ma = mass(a), mb = mass(b);
        const total = ma + mb;
        a.x -= ux * push * (mb / total) * 2;
        a.y -= uy * push * (mb / total) * 2;
        b.x += ux * push * (ma / total) * 2;
        b.y += uy * push * (ma / total) * 2;
      }
    }
  }

  function label(d) { return C.growthLabel(d.growth); }

  ISLE.dino = {
    make, species, scale, radius, maxHp, maxStam, mass, tier, damage, biteCd,
    speedOf, vision, conspicuity, canSee, tickNeeds, tickGrowth, hurt, heal,
    clearWounds, eatNode, eatCarcass, drink, steer, separate, nutritionMul, label
  };
})(window.ISLE = window.ISLE || {});
