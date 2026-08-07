/* Skyward Reach — the line.
 *
 * The Ancestors idea, applied to the creature you were already teaching:
 * anything learned inside one lifetime dies with the animal. Only behaviour
 * you deliberately *ingrained* — drilled after it was already well known —
 * survives into the next generation. Breeding is therefore the real progress
 * track, and every third leap the whole line changes shape for good.
 */
(function (SW) {
  'use strict';
  const C = SW.content;
  const { clamp, rnd, chance } = SW.core;

  // --- age ---------------------------------------------------------------
  function lifespan(g) {
    return C.LIFESPAN * SW.boost.get(g, 'life');
  }

  function ageOf(g) {
    const a = g.creature.age || 0;
    let cur = C.AGES[0];
    for (const st of C.AGES) if (a >= st.from) cur = st;
    return cur;
  }

  const evolutionOf = g => C.EVOLUTIONS[clamp(g.evo | 0, 0, C.EVOLUTIONS.length - 1)];

  function nextEvolution(g) {
    const nxt = C.EVOLUTIONS[(g.evo | 0) + 1];
    return nxt || null;
  }

  /* Accumulated permanent bonus from every evolution reached so far. */
  function bonus(g, key) {
    let total = 0;
    for (let i = 0; i <= (g.evo | 0) && i < C.EVOLUTIONS.length; i++) {
      total += C.EVOLUTIONS[i].bonus[key] || 0;
    }
    return total;
  }

  /* One place that answers "how capable is this animal right now" — lineage
   * stock, times age, times everything the line has evolved into. */
  function traits(g) {
    const L = C.LINEAGES[g.creature.lineage];
    const age = ageOf(g);
    return {
      wits: L.wits * age.wits * (1 + bonus(g, 'wits')),
      stamina: L.stamina * age.stamina * (1 + bonus(g, 'stamina')),
      appetite: L.appetite,
      speed: 1 + bonus(g, 'speed'),
      statMul: age.statMul,
      sizeCap: Math.min(age.sizeCap, 3.2) + bonus(g, 'strength'),
      age: age
    };
  }

  // --- ingraining --------------------------------------------------------
  /* You can only ingrain what the creature already does well. Drilling a
   * behaviour it barely knows does nothing, which is what makes the order of
   * operations — teach, then drill, then breed — the actual game. */
  const IN_MIN_MASTERY = 0.5;

  function ingrainedOf(g, actId) {
    return clamp((g.creature.ingrained && g.creature.ingrained[actId]) || 0, 0, 1);
  }

  function canIngrain(g, actId) {
    return SW.creature.mastery(g, actId) >= IN_MIN_MASTERY;
  }

  function ingrain(g, actId, amount) {
    const c = g.creature;
    if (!c.ingrained) c.ingrained = {};
    if (!canIngrain(g, actId)) return 0;
    const mul = (g.neurons && g.neurons.memory ? 2 : 1) * traits(g).wits;
    const before = ingrainedOf(g, actId);
    c.ingrained[actId] = clamp(before + amount * mul, 0, 1);
    return c.ingrained[actId] - before;
  }

  function ingrainedCount(g, threshold) {
    let n = 0;
    for (const id of C.TRAINABLE) if (ingrainedOf(g, id) >= threshold) n++;
    return n;
  }

  // --- breeding ----------------------------------------------------------
  function canBreed(g) {
    const c = g.creature;
    return ageOf(g).id !== 'whelp' && c.bond >= 35;
  }

  function breedBlocker(g) {
    const c = g.creature;
    if (ageOf(g).id === 'whelp') return 'It is still a whelp.';
    if (c.bond < 35) return `It does not trust you enough yet (bond ${Math.round(c.bond)}/35).`;
    return null;
  }

  /* The generation leap. `natural` means the animal died of old age without
   * you choosing the moment, which costs you most of the inheritance. */
  function breed(g, natural) {
    const parent = g.creature;
    const L = C.LINEAGES[parent.lineage];
    const heritable = 0.38 * SW.boost.get(g, 'herit') * (natural ? 0.45 : 1);
    const carryIngrained = (g.neurons && g.neurons.lineage ? 0.5 : 0.32) * (natural ? 0.5 : 1);

    const child = SW.state.newCreature(parent.lineage, parent.name);
    child.gen = (parent.gen || 1) + 1;
    child.age = 0;
    child.ingrained = {};

    for (const id of C.TRAINABLE.concat(['wander'])) {
      const instinct = L.instinct[id] || 1;
      const pw = parent.weights[id] || instinct;
      const ing = ingrainedOf(g, id);
      // Unreinforced learning reverts to instinct. Reinforced learning carries.
      child.weights[id] = clamp(instinct + (pw - instinct) * ing * heritable, SW.creature.W_MIN, SW.creature.W_MAX);
      child.ingrained[id] = clamp(ing * carryIngrained, 0, 1);
    }

    // Stats drift toward the parent's, with a little mutation each time.
    for (const k of ['strength', 'cunning', 'grace']) {
      const base = L.base[k];
      const inherited = base + (parent.stats[k] - base) * 0.35 * (natural ? 0.6 : 1);
      child.stats[k] = Math.max(1, inherited * rnd(0.94, 1.10));
    }
    child.kind = parent.kind * 0.45;
    child.diligence = parent.diligence * 0.45;
    child.leash = parent.leash;
    child.name = parent.name;
    child.x = parent.x; child.y = parent.y; child.tx = parent.x; child.ty = parent.y;

    // Technique repetitions are muscle memory; some of it carries, scaled by
    // the same heritability that governs behaviour.
    child.techniques = {};
    for (const t in (parent.techniques || {})) {
      child.techniques[t] = Math.floor(parent.techniques[t] * clamp(heritable * 1.4, 0.2, 0.95));
    }
    SW.beast.applyMate(g, child);
    // Lifetime counters survive the animal even though the animal does not.
    g.stats.praisedTotal = (g.stats.praisedTotal || 0) + parent.praised;
    g.stats.choresTotal = (g.stats.choresTotal || 0) + parent.chores;
    g.creature = child;
    g.equippedTech = [];
    g.gens = (g.gens || 0) + 1;

    const reward = Math.round(90 * Math.pow(g.gens, 1.25));
    g.res.renown += reward;
    SW.discovery.firstTime(g, 'gen', 8, 'taking the line forward');

    if (natural) {
      SW.ui.log(g, `${parent.name} dies of old age. A whelp of its line takes its place, and most of what the old one knew is simply gone.`, 'bad');
    } else {
      SW.ui.log(g, `Generation ${child.gen}. What you drilled into ${parent.name} is already in the whelp. +${reward} renown.`, 'great');
    }
    g.fx.push({ at: 'banner', text: 'GENERATION ' + child.gen, life: 4.5, t: 0 });

    // Every third leap or so, the line itself changes.
    const nxt = nextEvolution(g);
    if (nxt && g.gens >= nxt.gens) {
      g.evo = (g.evo | 0) + 1;
      SW.discovery.firstTime(g, 'evo:' + g.evo, 14, 'watching the line change shape');
      const bonusRenown = Math.round(600 * Math.pow(g.evo, 1.4));
      g.res.renown += bonusRenown;
      SW.ui.log(g, `The line turns over into something new: ${nxt.name}. ${nxt.blurb} +${bonusRenown} renown.`, 'great');
      g.fx.push({ at: 'banner', text: nxt.glyph + ' ' + nxt.name.toUpperCase(), life: 6, t: 0 });
    }
    return child;
  }

  // --- per-tick ----------------------------------------------------------
  function tick(g, dt) {
    const c = g.creature;
    c.age = (c.age || 0) + dt / C.TICKS_PER_DAY;

    // Doing something it already knows well, well, wears the groove deeper.
    // Slow: praising is far faster, which is the point of praising.
    if (c.__didAct) {
      const id = c.__didAct;
      c.__didAct = null;
      if (SW.creature.mastery(g, id) > 0.72) ingrain(g, id, 0.0035);
    }

    const span = lifespan(g);
    if (c.age >= span * 0.86 && !c.__warned) {
      c.__warned = true;
      SW.ui.log(g, `${c.name} is going grey. Whatever you still want in the line, drill it now.`, 'warn');
    }
    if (c.age >= span) breed(g, true);
  }

  /* Progress of the current life, for the card. */
  function lifeProgress(g) {
    return clamp((g.creature.age || 0) / lifespan(g), 0, 1);
  }

  SW.lineage = {
    IN_MIN_MASTERY, lifespan, ageOf, evolutionOf, nextEvolution, bonus, traits,
    ingrainedOf, canIngrain, ingrain, ingrainedCount,
    canBreed, breedBlocker, breed, tick, lifeProgress
  };
})(window.SW = window.SW || {});
