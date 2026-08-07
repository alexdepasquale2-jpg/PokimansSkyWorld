/* Skyward Reach — the creature's brain.
 *
 * The whole design rests here. The creature is never commanded. It picks an
 * act by softmax over learned weights, does it in front of you, and then you
 * get a short window to praise or scold. Praise multiplies the weight for
 * that act; scolding divides it and makes the creature a little meaner.
 * Everything you eventually get for free — a watered, harvested, self-running
 * farm — is something you had to sit and teach.
 */
(function (SW) {
  'use strict';
  const C = SW.content;
  const F = SW.farm;
  const { clamp, rnd, rndInt, chance, pick } = SW.core;

  const W_MIN = 0.08, W_MAX = 14;
  const PRAISE_WINDOW = 9;   // ticks you have to react

  const lineage = g => C.LINEAGES[g.creature.lineage];
  // Age, evolution tier and lineage stock, resolved together.
  const traits = g => SW.lineage.traits(g);

  /* Display value: how well it knows a chore, 0..1. */
  function mastery(g, actId) {
    const w = g.creature.weights[actId] || 0;
    return clamp(1 - 1 / (1 + w / 2.5), 0, 1);
  }

  function masteredCount(g, threshold) {
    let n = 0;
    for (const id of C.TRAINABLE) {
      if (C.ACTS[id].useful && mastery(g, id) >= threshold) n++;
    }
    return n;
  }

  const FARM_CHORES = ['water', 'harvest', 'sow', 'till', 'forage'];
  function farmChoresMastered(g, threshold) {
    return FARM_CHORES.every(id => mastery(g, id) >= threshold);
  }

  function learnRate(g) {
    const c = g.creature;
    const fear = c.mood < 25 ? 0.55 : 1;          // a terrified beast learns badly
    return 1 + 0.26 * traits(g).wits * SW.discovery.mods.learn(g) * (0.55 + c.bond / 140) * fear;
  }

  // --- feasibility -------------------------------------------------------
  /* Each entry answers "can it do this right now, and at what". */
  const FEASIBLE = {
    water:   g => { const p = F.thirstiest(g); return p ? { kind: 'plot', i: p.i } : null; },
    harvest: g => { const p = F.ripePlots(g)[0]; return p ? { kind: 'plot', i: p.i } : null; },
    till:    g => { const p = F.rawPlots(g)[0]; return p ? { kind: 'plot', i: p.i } : null; },
    sow:     g => { const p = F.tilledPlots(g)[0]; return p && F.bestSeed(g) ? { kind: 'plot', i: p.i } : null; },
    forage:  g => ({ kind: 'wood' }),
    tithe:   g => (F.stockCount(g) > 0 && g.village.food < 60 ? { kind: 'village' } : null),
    play:    g => (g.village.villagers > 0 ? { kind: 'village' } : null),
    perform: g => (g.village.villagers > 0 && g.creature.bond >= 25 ? { kind: 'shrine' } : null),
    graze:   g => { const p = F.ripePlots(g)[0] || F.growingPlots(g)[0]; return p ? { kind: 'plot', i: p.i } : null; },
    feast:   g => (g.village.food >= 4 ? { kind: 'village' } : null),
    terrorize: g => (g.village.villagers > 0 ? { kind: 'village' } : null),
    rest:    g => ({ kind: 'home' }),
    wander:  g => ({ kind: 'roam' })
  };

  /* Situational multipliers layered on top of the learned weight. Needs win
   * over training: a starving creature will eat your field no matter what it
   * was taught, which is exactly the lesson. */
  function drive(g, actId) {
    const c = g.creature;
    const a = C.ACTS[actId];
    let m = 1;

    if (a.vigor > 0 && c.vigor < a.vigor * 1.6) m *= 0.25;
    if (a.vigor > 0 && c.vigor < a.vigor) return 0;

    if (actId === 'graze' || actId === 'feast') {
      m *= 1 + Math.pow(clamp((55 - c.hunger) / 55, 0, 1), 1.6) * 7;
      if (c.hunger > 78) m *= 0.18;
    }
    if (actId === 'rest') {
      m *= 1 + Math.pow(clamp((50 - c.vigor) / 50, 0, 1), 1.5) * 8;
      if (c.vigor > 82) m *= 0.1;
    }
    if (actId === 'play' || actId === 'wander') {
      m *= 1 + clamp((45 - c.mood) / 45, 0, 1) * 2.2;
    }
    if (actId === 'terrorize') {
      m *= 1 + clamp(-c.kind / 100, 0, 1) * 2.2;
      if (c.kind > 45) m *= 0.25;
    }
    if (a.useful) {
      // Industriousness is its own appetite.
      m *= 1 + clamp(c.diligence / 100, -0.7, 1) * 0.9;
    }
    if (actId === 'perform') m *= 1 + c.stats.grace / 30;
    if (actId === 'graze' && SW.beast.hasTech(g, 'graze_x')) m *= 0.35;
    // At night an untrained beast winds down; a night worker does not.
    const night = (g.dayTick / C.TICKS_PER_DAY) > 0.72;
    if (night && a.useful && !SW.beast.hasTech(g, 'nightwork')) m *= 0.55;

    switch (c.leash) {
      case 'compassion':
        if (a.kind > 0.3 || a.useful) m *= 2.3;
        if (a.kind < -0.2) m *= 0.14;
        break;
      case 'aggression':
        if (a.kind < -0.2) m *= 2.4;
        if (a.kind > 0.5) m *= 0.4;
        if (actId === 'perform') m *= 1.8;
        break;
      case 'learning':
        m *= 1.05;  // attentive, slightly more active
        break;
    }
    return m;
  }

  function chooseAct(g) {
    const c = g.creature;
    const options = [];
    let total = 0;
    for (const id in c.weights) {
      const fn = FEASIBLE[id];
      if (!fn) continue;
      const target = fn(g);
      if (!target) continue;
      const w = clamp(c.weights[id], W_MIN, W_MAX) * drive(g, id);
      if (w <= 0) continue;
      options.push({ id, target, w });
      total += w;
    }
    if (!options.length) return { id: 'wander', target: { kind: 'roam' } };
    let r = Math.random() * total;
    for (const o of options) { r -= o.w; if (r <= 0) return o; }
    return options[options.length - 1];
  }

  // --- doing the thing ---------------------------------------------------
  function emit(g, text, tone) {
    if (SW.ui) SW.ui.log(g, text, tone || 'creature');
  }
  function pop(g, text, tone) {
    g.fx.push({ at: 'creature', text: text, tone: tone || 'neutral', life: 1.6, t: 0 });
  }

  function applyAct(g, actId, target) {
    const c = g.creature;
    const a = C.ACTS[actId];
    const name = c.name;
    let ok = true;

    switch (actId) {
      case 'water': {
        const p = g.plots.find(p => p.i === target.i);
        ok = F.water(g, p);
        if (ok) { pop(g, '💧', 'good'); emit(g, `${name} waters the ${C.CROPS[p.crop] ? C.CROPS[p.crop].name.toLowerCase() : 'soil'}.`); }
        break;
      }
      case 'harvest': {
        const p = g.plots.find(p => p.i === target.i);
        const r = F.harvest(g, p, (0.85 + c.stats.strength / 40) * (SW.beast.hasTech(g, 'haul') ? 1.35 : 1));
        ok = !!r;
        if (ok) { pop(g, '🧺+' + r.amount, 'good'); emit(g, `${name} brings in ${r.amount} ${r.crop.name}.`); }
        break;
      }
      case 'till': {
        const p = g.plots.find(p => p.i === target.i);
        ok = F.till(g, p);
        if (ok) { pop(g, '⛏️', 'good'); emit(g, `${name} breaks the soil open.`); }
        break;
      }
      case 'sow': {
        const p = g.plots.find(p => p.i === target.i);
        const seed = F.bestSeed(g);
        ok = seed ? F.sow(g, p, seed.id) : false;
        if (ok) { pop(g, '🌱', 'good'); emit(g, `${name} presses a ${seed.name} seed into the ground.`); }
        break;
      }
      case 'forage': {
        let n = 1 + Math.floor(c.stats.strength / 7);
        if (SW.beast.hasTech(g, 'haul')) n *= 2;
        if (SW.beast.hasTech(g, 'dig') && chance(0.35)) {
          const m = SW.core.pick(g.ring >= 2 ? ['fibre', 'clay', 'resin', 'bone', 'glass'] : ['fibre', 'clay']);
          g.mats[m] = (g.mats[m] | 0) + 1;
          pop(g, C.MATERIALS[m].glyph, 'good');
        }
        g.res.wood += n;
        pop(g, '🪵+' + n, 'good');
        emit(g, `${name} drags ${n} wood back from the treeline.`);
        break;
      }
      case 'tithe': {
        const crop = F.bestStock(g);
        ok = !!crop;
        if (ok) {
          const food = F.mill(g, crop.id, 1);
          g.village.faith = clamp(g.village.faith + 1.6, 0, 100);
          pop(g, '🥣', 'good');
          emit(g, `${name} carries ${crop.name} down to the village. They eat because of your beast.`, 'good');
        }
        break;
      }
      case 'play': {
        c.mood = clamp(c.mood + 9, 0, 100);
        g.village.faith = clamp(g.village.faith + 0.9 * (SW.beast.hasTech(g, 'sing') ? 2.2 : 1), 0, 100);
        pop(g, '🎈', 'good');
        emit(g, `${name} plays with the village children.`);
        break;
      }
      case 'perform': {
        const gain = (1 + c.stats.grace / 5 + c.bond / 40) * (SW.beast.hasTech(g, 'show') ? 2 : 1);
        g.res.renown += gain;
        g.village.faith = clamp(g.village.faith + 0.6, 0, 100);
        c.mood = clamp(c.mood + 6, 0, 100);
        pop(g, '🎭+' + Math.round(gain), 'good');
        emit(g, `${name} performs. Word of it travels.`, 'good');
        break;
      }
      case 'graze': {
        const p = g.plots.find(p => p.i === target.i);
        const r = F.devour(g, p);
        ok = !!r;
        if (ok) {
          c.hunger = clamp(c.hunger + r.crop.feed * r.ripeness, 0, 130);
          c.fed++;
          pop(g, '😋', 'bad');
          emit(g, `${name} eats your ${r.crop.name} straight out of the ground.`, 'bad');
        }
        break;
      }
      case 'feast': {
        const take = Math.min(g.village.food, 14);
        g.village.food -= take;
        c.hunger = clamp(c.hunger + take * 1.6, 0, 130);
        c.fed++;
        g.village.faith = clamp(g.village.faith - 1.2, 0, 100);
        pop(g, '🍖', 'bad');
        emit(g, `${name} raids the granary. The village counts what is left.`, 'bad');
        break;
      }
      case 'terrorize': {
        g.village.awe = clamp(g.village.awe + 2.6, 0, 100);
        g.village.faith = clamp(g.village.faith - 2.1, 0, 100);
        g.village.unrest = clamp(g.village.unrest + 3, 0, 100);
        c.mood = clamp(c.mood + (c.kind < 0 ? 8 : -4), 0, 100);
        pop(g, '💀', 'bad');
        emit(g, `${name} goes through the village roaring. They will remember it.`, 'bad');
        break;
      }
      case 'rest': {
        pop(g, '💤', 'neutral');
        break;
      }
      default:
        break;
    }

    if (!ok) return false;
    SW.discovery.firstTime(g, 'act:' + actId, 2, `watching it ${a.name}`);
    SW.beast.onAct(g, actId);

    // Cost, drift, and slow physical growth.
    c.vigor = clamp(c.vigor - a.vigor, 0, 100);
    c.kind = clamp(c.kind + a.kind * 0.16, -100, 100);
    c.diligence = clamp(c.diligence + a.diligent * 0.14, -100, 100);
    if (a.useful) { c.chores++; c.bond = clamp(c.bond + 0.06, 0, 100); }

    if (actId === 'till' || actId === 'forage' || actId === 'harvest') c.stats.strength += 0.022;
    if (actId === 'sow' || actId === 'water' || actId === 'terrorize') c.stats.cunning += 0.022;
    if (actId === 'play' || actId === 'perform' || actId === 'tithe') c.stats.grace += 0.022;

    return true;
  }

  // --- the per-tick state machine ---------------------------------------
  function beginAct(g) {
    const c = g.creature;
    const chosen = chooseAct(g);
    const quick = 1 / ((0.8 + c.stats.cunning / 45) * traits(g).speed * SW.beast.workFactor(g));
    c.act = {
      id: chosen.id,
      anchor: chosen.target,
      phase: 'travel',
      t: 0,
      travel: 2 * quick,
      work: 2 * quick,
      idle: rnd(1, 3) * quick
    };
  }

  function tick(g, dt) {
    const c = g.creature;
    const L = lineage(g);
    const T = traits(g);

    // Needs.
    c.hunger = clamp(c.hunger - 0.22 * T.appetite * (0.7 + c.size * 0.4) * dt, 0, 130);
    c.vigor = clamp(c.vigor + (c.act && c.act.id === 'rest' ? 2.2 : 0.42) * T.stamina * dt, 0, 100);
    c.mood = clamp(c.mood - 0.12 * dt + (c.hunger < 20 ? -0.35 * dt : 0) + (c.bond > 60 ? 0.05 * dt : 0), 0, 100);
    if (c.hunger <= 0) {
      c.vigor = clamp(c.vigor - 0.5 * dt, 0, 100);
      c.mood = clamp(c.mood - 0.3 * dt, 0, 100);
    }
    // Well-fed creatures grow. Growth is one-way; you cannot shrink a beast.
    if (c.hunger > 78) c.size = clamp(c.size + 0.0009 * dt, 0.6, T.sizeCap);

    // Praise window expiry.
    if (c.pending) {
      c.pending.t += dt;
      if (c.pending.t >= PRAISE_WINDOW) c.pending = null;
    }

    // Slow forgetting toward instinct — thistlebeaks lose it fastest.
    const forget = 0.00035 * L.wits * SW.discovery.mods.forget(g) * dt;
    for (const id in c.weights) {
      const base = (L.instinct[id] || 1);
      c.weights[id] += (base - c.weights[id]) * forget;
      c.weights[id] = clamp(c.weights[id], W_MIN, W_MAX);
    }

    // Act state machine.
    if (!c.act) { beginAct(g); return; }
    const a = c.act;
    a.t += dt;
    if (a.phase === 'travel' && a.t >= a.travel) { a.phase = 'work'; a.t = 0; }
    else if (a.phase === 'work' && a.t >= a.work) {
      const done = applyAct(g, a.id, a.anchor);
      if (done && a.id !== 'wander') {
        c.pending = { act: a.id, t: 0 };
        c.__didAct = a.id;
      }
      a.phase = 'idle'; a.t = 0;
    } else if (a.phase === 'idle' && a.t >= a.idle) {
      c.act = null;
    }
  }

  // --- teaching ----------------------------------------------------------
  function praise(g) {
    const c = g.creature;
    if (!c.pending) return false;
    const id = c.pending.act;
    const a = C.ACTS[id];
    const mul = learnRate(g);
    c.weights[id] = clamp(c.weights[id] * mul, W_MIN, W_MAX);
    c.bond = clamp(c.bond + 2.4, 0, 100);
    c.mood = clamp(c.mood + 7, 0, 100);
    // You are not just reinforcing a chore, you are endorsing a character.
    c.kind = clamp(c.kind + a.kind * 1.7, -100, 100);
    c.diligence = clamp(c.diligence + a.diligent * 1.3, -100, 100);
    c.praised++;
    c.pending = null;
    // Drilling a behaviour it already knows well is what puts it into the line.
    const dug = SW.lineage.ingrain(g, id, 0.055);
    pop(g, dug > 0 ? '❤ ✚' : '❤', 'good');
    SW.ui && SW.ui.log(g, dug > 0
      ? `You lay a hand on ${c.name}. It will ${a.name} again — and so will its whelps.`
      : `You lay a hand on ${c.name}. It will ${a.name} again.`, 'good');
    return true;
  }

  function scold(g) {
    const c = g.creature;
    if (!c.pending) return false;
    const id = c.pending.act;
    const a = C.ACTS[id];
    const mul = learnRate(g) * 1.1;
    c.weights[id] = clamp(c.weights[id] / mul, W_MIN, W_MAX);
    c.bond = clamp(c.bond - 1.7, 0, 100);
    c.mood = clamp(c.mood - 10, 0, 100);
    c.vigor = clamp(c.vigor - 2, 0, 100);
    c.kind = clamp(c.kind - a.kind * 1.1 - 0.7, -100, 100);
    c.diligence = clamp(c.diligence - a.diligent * 0.8, -100, 100);
    c.scolded++;
    c.pending = null;
    pop(g, '✋', 'bad');
    SW.ui && SW.ui.log(g, `You strike ${c.name}. It flinches, and files the lesson away.`, 'bad');
    return true;
  }

  /* Imitation. On the Leash of Learning, whatever you do with your own hands
   * bleeds into the creature's weights. Slower than praise, but free. */
  function observe(g, actId) {
    const c = g.creature;
    if (c.leash !== 'learning') return;
    if (!c.weights[actId]) return;
    const gain = 1 + 0.075 * lineage(g).wits * (0.6 + c.bond / 200);
    c.weights[actId] = clamp(c.weights[actId] * gain, W_MIN, W_MAX);
    if (chance(0.12)) {
      g.fx.push({ at: 'creature', text: '👁️', tone: 'neutral', life: 1.2, t: 0 });
    }
  }

  function feed(g, cropId) {
    const c = g.creature;
    if ((g.stock[cropId] | 0) <= 0) return false;
    g.stock[cropId]--;
    const crop = C.CROPS[cropId];
    c.hunger = clamp(c.hunger + crop.feed, 0, 130);
    c.mood = clamp(c.mood + 4, 0, 100);
    c.bond = clamp(c.bond + 1.1, 0, 100);
    c.fed++;
    pop(g, crop.glyph, 'good');
    SW.ui && SW.ui.log(g, `You feed ${c.name} a ${crop.name}. It leans into your hand.`, 'good');
    return true;
  }

  // --- appearance --------------------------------------------------------
  /* Everything visible about the creature is downstream of how you raised it.
   * This is the payoff for all that praising and slapping. */
  function look(g) {
    const c = g.creature;
    const L = lineage(g);
    const k = c.kind / 100;          // -1 cruel .. +1 kind
    const d = c.diligence / 100;
    const plump = clamp((c.hunger - 40) / 90, -0.3, 0.7);
    const hue = (base, target, t) => mixHex(base, target, clamp(t, 0, 1));
    let hide = L.palette.hide;
    if (k < 0) hide = hue(hide, '#8e2f3f', -k * 0.8);
    else hide = hue(hide, '#f2e7b0', k * 0.55);
    let mark = k < 0 ? hue(L.palette.mark, '#3b0d18', -k * 0.85) : hue(L.palette.mark, '#ffd97a', k * 0.6);
    return {
      hide, mark,
      belly: hue(L.palette.belly, k < 0 ? '#7a2b34' : '#fffdf0', Math.abs(k) * 0.62),
      size: c.size,
      spikes: clamp(-k, 0, 1),
      bloom: clamp(k, 0, 1),
      plump,
      posture: clamp(0.35 + d * 0.4 + c.vigor / 260, 0, 1),
      eye: c.mood < 30 ? 'sad' : c.mood > 75 ? 'bright' : 'calm',
      glow: clamp((c.bond - 50) / 60, 0, 1),
      lineage: L.id
    };
  }

  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (gg << 8) | bl).toString(16).slice(1);
  }

  /* A one-line read on the beast, for the creature card. */
  function describe(g) {
    const c = g.creature;
    const k = c.kind, d = c.diligence;
    const moral = k > 60 ? 'saintly' : k > 20 ? 'gentle' : k > -20 ? 'unformed' : k > -60 ? 'mean' : 'monstrous';
    const work = d > 60 ? 'tireless' : d > 20 ? 'willing' : d > -20 ? 'aimless' : d > -60 ? 'lazy' : 'utterly indolent';
    return `${SW.core.titleCase(moral)} and ${work}.`;
  }

  SW.creature = {
    W_MIN, W_MAX, PRAISE_WINDOW, mastery, masteredCount, farmChoresMastered,
    tick, praise, scold, observe, feed, look, describe, chooseAct, learnRate, lineage
  };
})(window.SW = window.SW || {});
