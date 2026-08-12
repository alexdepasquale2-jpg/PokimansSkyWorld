/* Primal Isle — the other thirty-four players.
 *
 * There is no server. The lobby is simulated locally, with the same needs,
 * the same growth curve and the same combat as the player — and with the same
 * shop advantages applied to the third of them who "pay". A free player is
 * therefore genuinely outnumbered by better animals, which is the honest
 * version of what the store is selling a way out of.
 */
(function (ISLE) {
  'use strict';
  const C = ISLE.content;
  const W = ISLE.world;
  const D = ISLE.dino;
  const K = ISLE.combat;
  const { clamp, rnd, rndInt, pick, chance, dist } = ISLE.core;

  function waterPoints(w) {
    if (w.__water) return w.__water;
    const pts = w.lakes.map(l => ({ x: l.x, y: l.y }));
    for (let i = 0; i < w.river.length; i += 6) pts.push({ x: w.river[i].x, y: w.river[i].y });
    w.__water = pts;
    return pts;
  }

  function nearestWater(w, x, y) {
    let best = null, bd = Infinity;
    for (const p of waterPoints(w)) {
      const d = dist(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /* A newcomer to the server. Species and starting growth are drawn so the
   * lobby always holds a spread — a few adults to be afraid of, a lot of
   * juveniles to compete with, and some hatchlings to eat. */
  function spawn(g, opts) {
    opts = opts || {};
    const whale = opts.whale != null ? opts.whale : chance(C.AI_WHALE_RATE);
    let spId;
    if (whale && chance(0.55)) spId = pick(C.PREMIUM_SPECIES);
    else spId = pick(C.FREE_SPECIES);

    const roll = Math.random();
    let growth;
    if (roll < 0.34) growth = rnd(0.06, 0.2);
    else if (roll < 0.72) growth = rnd(0.2, 0.55);
    else if (roll < 0.93) growth = rnd(0.55, 0.85);
    else growth = rnd(0.85, 1);
    if (whale) growth = clamp(growth * 1.35, 0.1, 1);

    const at = opts.at || W.spawnPoint(g.world);
    const used = new Set(g.dinos.map(d => d.name));
    let name = pick(C.NAMES);
    for (let i = 0; i < 20 && used.has(name); i++) name = pick(C.NAMES) + rndInt(2, 99);

    const d = D.make({
      sp: spId, growth, x: at.x, y: at.y, name, whale, clock: g.clock,
      skin: whale && chance(0.5) ? pick(['gilded', 'prism', 'void']) : null
    });
    d.ai = {
      state: 'wander',
      kos: chance(C.AI_KOS_RATE) || D.species(d).tier >= 4,
      nerve: rnd(0.7, 1.45),          // how favourable a fight has to look
      skill: rnd(0.55, 1.0),
      think: rnd(0, 0.6),
      gx: at.x, gy: at.y,
      targetId: null, until: 0
    };
    /* The lobby mutates too. A grown rival carrying three of these is why an
     * adult is frightening rather than merely large. */
    ISLE.mutations.seedAi(d);
    g.dinos.push(d);
    return d;
  }

  /* Keep the lobby full, with a trickle rather than a burst. */
  function maintain(g, dt) {
    g.spawnAcc = (g.spawnAcc || 0) + dt;
    const alive = g.dinos.filter(d => d.alive && !d.player).length;
    if (alive < C.SERVER_CAP && g.spawnAcc > 1.6) {
      g.spawnAcc = 0;
      spawn(g);
    }
  }

  function nearestNode(g, d, r) {
    const diet = D.species(d).diet;
    const list = W.nodesNear(g.world, d.x, d.y, r, diet === 'herbivore' ? 'herbivore' : 'carnivore');
    let best = null, bd = Infinity;
    for (const n of list) {
      const dd = dist(d.x, d.y, n.x, n.y);
      if (dd < bd) { bd = dd; best = n; }
    }
    return best;
  }

  /* Who is worth attacking, and who should be run from. Both answers come out
   * of the same matchup number. */
  function assess(g, d) {
    let prey = null, preyScore = 0, threat = null, threatScore = 0;
    for (const o of g.dinos) {
      if (o === d || !o.alive) continue;
      if (o.group && o.group === d.group) continue;
      if (!D.canSee(g, d, o)) continue;
      const m = K.matchup(d, o);
      const dd = dist(d.x, d.y, o.x, o.y);
      const near = clamp(1 - dd / 900, 0.05, 1);
      // A hatchling is not worth the walk unless you are genuinely starving.
      const beneathNotice = o.growth < C.IGNORE_GROWTH && d.hunger > 30;
      if (m > d.ai.nerve && !beneathNotice) {
        const s = m * near * (1 + o.growth);
        if (s > preyScore) { preyScore = s; prey = o; }
      } else if (m < 0.72) {
        const s = (1 / Math.max(0.05, m)) * near;
        if (s > threatScore) { threatScore = s; threat = o; }
      }
    }
    return { prey, threat, threatScore };
  }

  function think(g, d, dt) {
    const a = d.ai;
    a.think -= dt;
    if (a.think > 0) return;
    a.think = rnd(0.35, 0.8);

    const sp = D.species(d);
    const carn = sp.diet === 'carnivore';
    const { prey, threat } = assess(g, d);

    // 1. Anything scary and close beats every other consideration.
    const hurtBadly = d.hp < D.maxHp(d) * 0.42;
    if (threat && (hurtBadly || dist(d.x, d.y, threat.x, threat.y) < 340)) {
      a.state = 'flee'; a.targetId = threat.id; return;
    }
    if (hurtBadly && d.combatT > 0) { a.state = 'flee'; a.targetId = null; return; }

    // 2. Thirst, then hunger. A dying-of-thirst animal takes risks.
    if (d.thirst < 38) {
      const p = nearestWater(g.world, d.x, d.y);
      if (p) { a.state = 'drink'; a.gx = p.x; a.gy = p.y; return; }
    }
    if (d.hunger < 58) {
      if (carn) {
        const car = K.carcassNear(g, d.x, d.y, D.vision(g, d) * 1.2);
        if (car) { a.state = 'scavenge'; a.gx = car.x; a.gy = car.y; a.car = car; return; }
        if (prey) { a.state = 'hunt'; a.targetId = prey.id; return; }
        const n = nearestNode(g, d, 700);
        if (n) { a.state = 'forage'; a.gx = n.x; a.gy = n.y; a.node = n; return; }
      } else {
        const n = nearestNode(g, d, 900);
        if (n) { a.state = 'forage'; a.gx = n.x; a.gy = n.y; a.node = n; return; }
      }
    }

    // 3. Kill-on-sight players go looking for a fight they can win.
    if (a.kos && prey && d.stam > D.maxStam(d) * 0.45 && d.hunger > 25) {
      a.state = 'hunt'; a.targetId = prey.id; return;
    }

    // 4. Otherwise drift. Grown animals patrol the middle; small ones hide.
    if (a.state !== 'wander' || dist(d.x, d.y, a.gx, a.gy) < 90) {
      a.state = 'wander';
      const w = g.world;
      const bias = d.growth > 0.6 ? 0.45 : 0.9;
      const ang = rnd(0, Math.PI * 2);
      const r = w.baseR * rnd(0.2, bias);
      a.gx = clamp(w.cx + Math.cos(ang) * r, 60, C.WORLD - 60);
      a.gy = clamp(w.cy + Math.sin(ang) * r, 60, C.WORLD - 60);
    }
  }

  function act(g, d, dt) {
    const a = d.ai;
    const input = { mx: 0, my: 0, sprint: false };
    const target = a.targetId ? g.byId[a.targetId] : null;

    switch (a.state) {
      case 'flee': {
        if (target && target.alive) {
          const ang = Math.atan2(d.y - target.y, d.x - target.x);
          input.mx = Math.cos(ang); input.my = Math.sin(ang);
          input.sprint = d.stam > 8;
          // Cornered and out of stamina: turn and bite.
          if (dist(d.x, d.y, target.x, target.y) < D.radius(d) * 2.2 && d.stam < 12) {
            faceAndBite(g, d, target, input);
          }
        } else {
          const ang = Math.atan2(g.world.cy - d.y, g.world.cx - d.x) + Math.PI;
          input.mx = Math.cos(ang); input.my = Math.sin(ang);
          input.sprint = d.stam > 30 && d.combatT > 0;
        }
        break;
      }
      case 'hunt': {
        if (!target || !target.alive) { a.state = 'wander'; break; }
        const dd = dist(d.x, d.y, target.x, target.y);
        if (dd > D.vision(g, d) * 1.6) { a.state = 'wander'; break; }
        faceAndBite(g, d, target, input);
        input.sprint = dd < 420 && d.stam > 18;
        break;
      }
      case 'drink': {
        moveTo(d, a.gx, a.gy, input);
        if (W.drinkableAt(g.world, d.x, d.y) === 'fresh') {
          D.drink(g, d, dt);
          if (d.thirst > 92) a.state = 'wander';
          input.mx = input.my = 0;
        }
        break;
      }
      case 'forage': {
        const n = a.node;
        if (!n || n.amt < 0.25) { a.state = 'wander'; break; }
        moveTo(d, n.x, n.y, input);
        if (dist(d.x, d.y, n.x, n.y) < D.radius(d) + 26) {
          D.eatNode(g, d, n);
          a.state = 'wander';
        }
        break;
      }
      case 'scavenge': {
        const c = a.car;
        if (!c || c.meat <= 0.02 || g.carcasses.indexOf(c) < 0) { a.state = 'wander'; break; }
        moveTo(d, c.x, c.y, input);
        if (dist(d.x, d.y, c.x, c.y) < D.radius(d) + 30) {
          D.eatCarcass(g, d, c);
          input.mx = input.my = 0;
          if (d.hunger > 92) a.state = 'wander';
        }
        break;
      }
      default: {
        moveTo(d, a.gx, a.gy, input);
        if (d.stam < D.maxStam(d) * 0.3) { input.mx *= 0.4; input.my *= 0.4; }
      }
    }

    // Nobody with any sense swims the open sea.
    if (W.isDeep(g.world, d.x, d.y) && D.species(d).swim < 1.2) {
      const ashore = W.nudgeAshore(g.world, d.x, d.y);
      const ang = Math.atan2(ashore.y - d.y, ashore.x - d.x);
      input.mx = Math.cos(ang); input.my = Math.sin(ang); input.sprint = true;
    }

    D.steer(g, d, input, dt);

    // Calls: mostly the ones that give the map away, because that is what
    // players actually do.
    if (d.callT <= 0 && chance(dt * 0.035)) {
      d.callT = 9;
      ISLE.sim.emitCall(g, d, d.combatT > 0 ? 'distress' : 'broadcast');
    }
  }

  function moveTo(d, x, y, input) {
    const ang = Math.atan2(y - d.y, x - d.x);
    input.mx = Math.cos(ang); input.my = Math.sin(ang);
  }

  function faceAndBite(g, d, target, input) {
    const ang = Math.atan2(target.y - d.y, target.x - d.x);
    input.mx = Math.cos(ang); input.my = Math.sin(ang);
    const reach = (D.radius(d) + D.radius(target)) * C.COMBAT.biteReach;
    if (dist(d.x, d.y, target.x, target.y) <= reach * 0.95 && K.canBite(d)) {
      if (chance(d.ai.skill)) K.bite(g, d);
    }
  }

  /* Grouping: same species, close, and neither of them already in a big herd.
   * The pack bonus is real, which is why a lone free player is at the bottom
   * of every fight. */
  function tickGroups(g) {
    for (const d of g.dinos) d.groupSize = 0;
    const counts = {};
    for (const d of g.dinos) {
      if (!d.alive || !d.group) continue;
      counts[d.group] = (counts[d.group] || 0) + 1;
    }
    for (const d of g.dinos) {
      if (d.group) d.groupSize = counts[d.group] || 1;
      else d.groupSize = 1;
    }
  }

  function autoGroup(g) {
    for (const d of g.dinos) {
      if (!d.alive || d.player || d.group) continue;
      for (const o of g.dinos) {
        if (o === d || !o.alive || o.player || o.sp !== d.sp) continue;
        if (dist(d.x, d.y, o.x, o.y) > C.COMBAT.packRange) continue;
        d.group = o.group || (o.group = 'g' + o.id);
        break;
      }
    }
  }

  ISLE.ai = { spawn, maintain, think, act, tickGroups, autoGroup, nearestWater, assess };
})(window.ISLE = window.ISLE || {});
