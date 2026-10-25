/* Skyward Reach — the creature beyond training: illness, techniques,
 * bloodlines, and the Trial Ring. */
(function (SW) {
  'use strict';
  const C = SW.content, C2 = SW.content2;
  const { clamp, rnd, rndInt, pick, chance, fmt, hashNoise } = SW.core;

  const fail = (g, m) => { SW.ui.log(g, m, 'warn'); return false; };

  /* --------------------------------------------------------- 1. illness  */
  /* Each ailment has a cause you can actually see coming, which is the point:
   * a creature that gets sick is a creature you mismanaged. */
  function illnessRisk(g, id) {
    const c = g.creature, w = SW.boost.weatherOf(g);
    const care = SW.boost.get(g, 'careUp');
    let r = 0;
    switch (id) {
      case 'bloat':    r = c.hunger > 118 ? 0.0016 : 0; break;
      case 'rotlung':  r = (w.id === 'downpour' || w.id === 'mist') ? 0.0009 : 0.0001; break;
      case 'sunsick':  r = (w.id === 'swelter' || w.id === 'drought') ? 0.0011 : 0.0001; break;
      case 'lameness': r = c.vigor < 12 ? 0.0014 : 0; break;
      case 'despair':  r = (c.mood < 18 && c.scolded > c.praised) ? 0.0013 : 0; break;
    }
    return r / care;
  }

  function tickIllness(g, dt) {
    const c = g.creature;
    if (c.ailment) {
      const a = C2.AILMENTS[c.ailment];
      c.ailDays = (c.ailDays || 0) + dt / C.TICKS_PER_DAY;
      c.vigor = clamp(c.vigor + a.vigor * dt * 0.1, 0, 100);
      c.mood = clamp(c.mood + a.mood * dt * 0.1, 0, 100);
      // It shakes some off on its own, faster with a beast house and a herbalist.
      const selfHeal = 0.0008 * SW.boost.get(g, 'careUp') * dt;
      if (chance(selfHeal)) {
        SW.ui.log(g, `${c.name} has thrown off the ${a.name.toLowerCase()}.`, 'good');
        c.ailment = null; c.ailDays = 0;
      }
      return;
    }
    for (const id in C2.AILMENTS) {
      if (chance(illnessRisk(g, id) * dt)) {
        c.ailment = id; c.ailDays = 0;
        const a = C2.AILMENTS[id];
        SW.ui.log(g, `${c.name} has come down with ${a.name.toLowerCase()}. ${a.blurb}`, 'bad');
        g.fx.push({ at: 'banner', text: a.glyph + ' ' + a.name.toUpperCase(), life: 4, t: 0 });
        return;
      }
    }
  }

  function cure(g) {
    const c = g.creature;
    if (!c.ailment) return fail(g, 'Nothing wrong with it.');
    const a = C2.AILMENTS[c.ailment];
    const r = C2.REMEDIES[a.remedy];
    const cost = r.cost;
    if (cost.food && g.village.food < cost.food) return fail(g, 'Not enough food.');
    if (cost.wood && g.res.wood < cost.wood) return fail(g, 'Not enough wood.');
    if (cost.prayer && g.res.prayer < cost.prayer) return fail(g, 'Not enough prayer.');
    if (cost.mats) for (const k in cost.mats) if ((g.mats[k] | 0) < cost.mats[k]) return fail(g, 'Missing materials.');
    if (cost.food) g.village.food -= cost.food;
    if (cost.wood) g.res.wood -= cost.wood;
    if (cost.prayer) g.res.prayer -= cost.prayer;
    if (cost.mats) for (const k in cost.mats) g.mats[k] -= cost.mats[k];
    c.ailment = null; c.ailDays = 0;
    c.bond = clamp(c.bond + 3, 0, 100);
    SW.ui.log(g, `${r.glyph} ${r.name}. ${c.name} is itself again, and remembers who fixed it.`, 'great');
    return true;
  }

  /* How much of its work an ill creature actually manages. */
  function workFactor(g) {
    const c = g.creature;
    let m = SW.boost.get(g, 'work');
    if (c.ailment) m *= C2.AILMENTS[c.ailment].work;
    if (hasTech(g, 'sprint')) m *= 1.2;
    return m;
  }

  /* ------------------------------------------------------ 2. techniques  */
  const reps = (g, id) => (g.creature.techniques && g.creature.techniques[id]) | 0;
  const hasTech = (g, id) => (g.equippedTech || []).includes(id) && reps(g, id) >= C2.TECHNIQUES[id].reps;
  const techKnown = (g, id) => reps(g, id) >= C2.TECHNIQUES[id].reps;

  function techSlots(g) {
    return C2.TECH_SLOTS_BASE + Math.floor((g.evo | 0) / 2) + (SW.boost.buildingTier(g, 'arena') > 0 ? 1 : 0);
  }

  function trainTechnique(g, id, n) {
    if (!C2.TECHNIQUES[id]) return;
    const c = g.creature;
    if (!c.techniques) c.techniques = {};
    const before = techKnown(g, id);
    c.techniques[id] = reps(g, id) + (n || 1);
    if (!before && techKnown(g, id)) {
      const t = C2.TECHNIQUES[id];
      SW.ui.log(g, `${c.name} has worked out how to ${t.name.toLowerCase()}. ${t.blurb}`, 'great');
      g.fx.push({ at: 'banner', text: t.glyph + ' ' + t.name.toUpperCase(), life: 4, t: 0 });
      SW.discovery.firstTime(g, 'tech:' + id, 5, `seeing it learn ${t.name.toLowerCase()}`);
    }
  }

  /* Which acts drill which techniques. */
  const ACT_TECH = {
    forage: ['haul', 'dig'], harvest: ['haul'], water: ['sprint'], sow: ['sprint'],
    till: ['dig'], play: ['sing'], perform: ['sing', 'show'], tithe: ['sing'],
    terrorize: ['guard'], rest: ['nightwork']
  };

  function onAct(g, actId) {
    const list = ACT_TECH[actId];
    if (list) for (const t of list) if (chance(0.5)) trainTechnique(g, t, 1);
    // Working at night is its own lesson.
    const night = (g.dayTick / C.TICKS_PER_DAY) > 0.72;
    if (night && actId !== 'rest') trainTechnique(g, 'nightwork', 1);
  }

  function equipTech(g, id) {
    if (!techKnown(g, id)) return fail(g, 'It does not know that yet.');
    if (!g.equippedTech) g.equippedTech = [];
    const i = g.equippedTech.indexOf(id);
    if (i >= 0) { g.equippedTech.splice(i, 1); return true; }
    if (g.equippedTech.length >= techSlots(g)) return fail(g, 'No room. Set something else down first.');
    g.equippedTech.push(id);
    return true;
  }

  /* ------------------------------------------------------ 3. bloodlines  */
  function rollMate(g) {
    const lin = pick(C.LINEAGE_LIST);
    const q = 0.6 + Math.random() * 0.9;
    return {
      lineage: lin.id,
      name: pick(['Wild', 'Grey', 'Thorn', 'Ash', 'Bramble', 'Pale', 'Fen']) + ' ' + lin.name,
      strength: Math.round(lin.base.strength * q * 10) / 10,
      cunning: Math.round(lin.base.cunning * q * 10) / 10,
      grace: Math.round(lin.base.grace * q * 10) / 10,
      vigour: q,
      day: g.day
    };
  }

  function acceptMate(g) {
    if (!g.mateOffer) return false;
    g.mate = g.mateOffer;
    g.mateOffer = null;
    SW.ui.log(g, `${g.mate.name} stays. The next whelp will carry both lines.`, 'good');
    return true;
  }
  function refuseMate(g) { g.mateOffer = null; return true; }

  /* Called by lineage.breed to blend in the mate, then consume it. */
  function applyMate(g, child) {
    const m = g.mate;
    if (!m) { g.pedigree = g.pedigree || []; return; }
    child.stats.strength = (child.stats.strength + m.strength) / 2 * 1.06;
    child.stats.cunning = (child.stats.cunning + m.cunning) / 2 * 1.06;
    child.stats.grace = (child.stats.grace + m.grace) / 2 * 1.06;
    // Hybrid vigour: a different lineage is worth more than the same one.
    if (m.lineage !== child.lineage) {
      child.hybrid = m.lineage;
      for (const k of ['strength', 'cunning', 'grace']) child.stats[k] *= 1.08;
      SW.ui.log(g, `The whelp is a cross — ${C.LINEAGES[child.lineage].name} out of ${C.LINEAGES[m.lineage].name}. It is stronger for it.`, 'great');
    } else {
      g.inbreeding = (g.inbreeding || 0) + 1;
      if (g.inbreeding >= 3) {
        for (const k of ['strength', 'cunning', 'grace']) child.stats[k] *= 0.94;
        SW.ui.log(g, 'The line is getting narrow. The whelp is a little weaker than it should be.', 'warn');
      }
    }
    g.pedigree = g.pedigree || [];
    g.pedigree.unshift({ gen: child.gen, mate: m.name, day: g.day, hybrid: !!child.hybrid });
    if (g.pedigree.length > 30) g.pedigree.length = 30;
    g.mate = null;
  }

  /* ---------------------------------------------------------- 4. arena   */
  /* What the ring is actually measuring. A freshly bred whelp has poor stats
   * by design, so the trial has to see the whole line behind it — what it was
   * born knowing, what it has worked out, and how many generations of work sit
   * underneath. Otherwise breeding, the central loop, would be a penalty. */
  function beastPower(g) {
    const c = g.creature;
    let p = (c.stats.strength * 1.4 + c.stats.cunning * 1.1 + c.stats.grace * 0.9)
      * (0.6 + c.size * 0.5) * (0.55 + c.vigor / 140) * (0.7 + c.bond / 200);
    if (hasTech(g, 'show')) p *= 1.25;
    if (hasTech(g, 'guard')) p *= 1.15;
    if (hasTech(g, 'sprint')) p *= 1.1;
    if (c.ailment) p *= 0.6;
    p *= 1 + (g.evo | 0) * 0.18;

    let ingrained = 0;
    for (const id of C.TRAINABLE) ingrained += SW.lineage.ingrainedOf(g, id);
    let known = 0;
    for (const id in C2.TECHNIQUES) if (techKnown(g, id)) known++;
    return p + ingrained * 30 + known * 12 + (g.gens | 0) * 3;
  }

  function arenaOpponents(g) {
    return g.rivals.map((r, i) => ({
      name: r.name,
      power: (20 + Math.pow(g.day, 1.0) * 1.9) * r.pace * (0.7 + hashNoise(r.seed + 91, Math.floor(g.day / 3)) * 0.7),
      index: i
    })).sort((a, b) => a.power - b.power);
  }

  /* Three rounds, each a noisy comparison. Best of three takes it. */
  function fight(g, opponentIndex) {
    if (!SW.boost.buildingTier(g, 'arena')) return fail(g, 'You have nowhere to hold a trial.');
    const c = g.creature;
    if (c.vigor < 30) return fail(g, 'It is in no state to fight.');
    // One trial a day. The ring is an event, not a renown tap.
    if (g.arenaDay === g.day) return fail(g, 'It has already fought today.');
    g.arenaDay = g.day;
    const opp = arenaOpponents(g)[opponentIndex];
    if (!opp) return false;
    c.vigor = clamp(c.vigor - 28, 0, 100);
    const mine = beastPower(g);
    const rounds = [];
    let wins = 0;
    for (let i = 0; i < 3; i++) {
      const a = mine * rnd(0.7, 1.35);
      const b = opp.power * rnd(0.7, 1.35);
      const won = a >= b;
      if (won) wins++;
      rounds.push({ mine: Math.round(a), theirs: Math.round(b), won });
    }
    const won = wins >= 2;
    const stake = Math.round(90 + g.day * 6);
    if (won) {
      g.res.renown += stake;
      g.stats.arenaWins = (g.stats.arenaWins || 0) + 1;
      c.bond = clamp(c.bond + 4, 0, 100);
      // A gentle champion is loved for it; a vicious one is feared. Winning
      // should not quietly turn a faith empire into a terror one.
      if (c.kind >= 0) g.village.faith = clamp(g.village.faith + 1.5, 0, 100);
      else g.village.awe = clamp(g.village.awe + 1.5, 0, 100);
      trainTechnique(g, 'show', 4);
      if (chance(0.18)) SW.relics.grant(g);
      SW.ui.log(g, `Trial won against ${opp.name}, ${wins}–${3 - wins}. +${stake} renown.`, 'great');
    } else {
      g.res.renown = Math.max(0, g.res.renown - Math.round(stake * 0.3));
      c.mood = clamp(c.mood - 10, 0, 100);
      g.stats.arenaLosses = (g.stats.arenaLosses || 0) + 1;
      SW.ui.log(g, `Beaten by ${opp.name}, ${wins}–${3 - wins}. It limps off.`, 'bad');
    }
    g.diplo[opp.name] = clamp((g.diplo[opp.name] || 0) + (won ? -8 : 4), -100, 100);
    g.arenaResult = { opponent: opp.name, rounds, won, stake, day: g.day };
    g.arenaChallenge = false;
    SW.discovery.firstTime(g, 'arena', 6, 'putting it in the ring');
    return true;
  }

  function tick(g, dt) {
    tickIllness(g, dt);
  }

  SW.beast = {
    illnessRisk, tickIllness, cure, workFactor,
    reps, hasTech, techKnown, techSlots, trainTechnique, onAct, equipTech,
    rollMate, acceptMate, refuseMate, applyMate,
    beastPower, arenaOpponents, fight, tick
  };
})(window.SW = window.SW || {});
