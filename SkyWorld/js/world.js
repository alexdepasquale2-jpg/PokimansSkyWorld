/* Skyward Reach — weather, soil, villagers, buildings and island events.
 * The layer between the sky and the ground.
 */
(function (SW) {
  'use strict';
  const C = SW.content, C2 = SW.content2;
  const { clamp, rnd, rndInt, pick, chance, fmt, hashNoise } = SW.core;

  /* ----------------------------------------------------------- 1. weather */
  function rollWeather(g) {
    // The Still suppresses violent weather; auroral nights are rarer early.
    const season = SW.boost.seasonOf(g);
    let total = 0;
    const opts = C2.WEATHER_LIST.map(w => {
      let wt = w.weight;
      if (season.id === 'still' && (w.id === 'swelter' || w.id === 'drought')) wt *= 0.2;
      if (season.id === 'high' && (w.id === 'drought' || w.id === 'swelter')) wt *= 2.2;
      if (season.id === 'greening' && w.id === 'downpour') wt *= 1.8;
      if (w.id === 'auroral' && g.day < 12) wt *= 0.25;
      total += wt;
      return { w, wt };
    });
    let r = Math.random() * total;
    for (const o of opts) { r -= o.wt; if (r <= 0) return o.w.id; }
    return 'clear';
  }

  function advanceWeather(g) {
    if (!g.weather) g.weather = { today: 'clear', tomorrow: rollWeather(g) };
    g.weather.today = g.weather.tomorrow;
    g.weather.tomorrow = rollWeather(g);
    const w = C2.WEATHER[g.weather.today];
    // Downpour fills every plot; a gale rips at ripe ones.
    if (w.water) for (const p of g.plots) if (p.crop) p.water = 100;
    SW.ui.log(g, `${w.glyph} ${w.name}. ${w.blurb}`, w.id === 'auroral' ? 'great' : 'info');
    if (w.mood) g.creature.mood = clamp(g.creature.mood + w.mood, 0, 100);
  }

  function seasonProgress(g) {
    return ((g.day - 1) % C2.SEASON_LEN) / C2.SEASON_LEN;
  }
  function daysToSeasonEnd(g) {
    return C2.SEASON_LEN - ((g.day - 1) % C2.SEASON_LEN);
  }

  /* -------------------------------------------------------------- 2. soil */
  function soilOf(p) { return p.soil === undefined ? 100 : clamp(p.soil, 0, C2.SOIL.max); }

  function soilYield(g, p) {
    let m = C2.SOIL.yieldAt(soilOf(p));
    if (p.rotated) m += C2.SOIL.rotationBonus;
    return m;
  }

  function fertilise(g, p, id) {
    const f = C2.FERTILISERS[id];
    if (!f) return false;
    if (soilOf(p) >= C2.SOIL.max - 1) { SW.ui.log(g, 'That ground is already as rich as it gets.', 'warn'); return false; }
    const cost = f.cost;
    if (cost.food && g.village.food < cost.food) return fail(g, 'Not enough food in the granary.');
    // A kiln burns the ash for you, so it costs less wood.
    const woodCost = id === 'ash' ? Math.ceil(cost.wood * (1 - SW.boost.buildingTier(g, 'kiln') * 0.22)) : cost.wood;
    if (cost.wood && g.res.wood < woodCost) return fail(g, 'Not enough wood.');
    if (cost.mats) for (const k in cost.mats) if ((g.mats[k] | 0) < cost.mats[k]) return fail(g, `Not enough ${C.MATERIALS[k].name.toLowerCase()}.`);
    if (cost.food) g.village.food -= cost.food;
    if (cost.wood) g.res.wood -= woodCost;
    if (cost.mats) for (const k in cost.mats) g.mats[k] -= cost.mats[k];
    p.soil = clamp(soilOf(p) + f.soil, 0, C2.SOIL.max);
    SW.ui.log(g, `${f.glyph} ${f.name} worked into plot ${p.i + 1}. Soil at ${Math.round(p.soil)}%.`, 'good');
    return true;
  }

  function fail(g, msg) { SW.ui.log(g, msg, 'warn'); return false; }

  function tickSoil(g, dt) {
    for (const p of g.plots) {
      if (p.soil === undefined) p.soil = 100;
      // Ground left empty comes back on its own; a granary means there is
      // waste to turn back into it, so it recovers everywhere.
      const idle = (p.state === 'raw' || p.state === 'tilled') ? 1 : 0.22;
      const rate = C2.SOIL.fallowRecovery * idle * (1 + SW.boost.buildingTier(g, 'granary') * 0.35);
      p.soil = clamp(p.soil + rate * dt, 0, C2.SOIL.max);
    }
  }

  /* --------------------------------------------------- 3. named villagers */
  function makePerson(g) {
    const used = new Set((g.people || []).map(p => p.name));
    const pool = C2.VILLAGER_NAMES.filter(n => !used.has(n));
    const name = pool.length ? pick(pool) : 'Newcomer ' + ((g.people || []).length + 1);
    const trait = chance(0.45) ? pick(C2.VILLAGER_TRAITS).id : null;
    return { name, role: 'idle', trait, mood: 60, since: g.day };
  }

  /* Keep the named roster in step with the headcount the village sim tracks. */
  function syncPeople(g) {
    if (!g.people) g.people = [];
    while (g.people.length < g.village.villagers) g.people.push(makePerson(g));
    while (g.people.length > g.village.villagers) {
      // whoever is unhappiest leaves first
      let worst = 0;
      for (let i = 1; i < g.people.length; i++) if (g.people[i].mood < g.people[worst].mood) worst = i;
      g.people.splice(worst, 1);
    }
  }

  function assign(g, name, role) {
    const p = g.people.find(x => x.name === name);
    if (!p) return false;
    p.role = role;
    return true;
  }

  function tickPeople(g, dt) {
    if (!g.people) return;
    const v = g.village;
    for (const p of g.people) {
      const target = clamp(v.faith * 0.7 + 30 - v.unrest * 0.5 + (p.trait === 'sour' ? -15 : 0), 0, 100);
      p.mood += (target - p.mood) * 0.004 * dt;
    }
    // Farmhands quietly water things; scouts turn up materials; the clever
    // occasionally work something out.
    const hands = SW.boost.roleCount(g, 'farmhand');
    if (hands > 0 && chance(0.012 * hands * dt)) {
      const dry = SW.farm.thirstiest(g);
      if (dry) { SW.farm.water(g, dry); }
    }
    const scouts = SW.boost.roleCount(g, 'scout');
    if (scouts > 0 && chance(0.006 * scouts * dt)) {
      const m = pick(['fibre', 'clay']);
      g.mats[m] = (g.mats[m] | 0) + 1;
    }
    const clever = g.people.filter(p => p.trait === 'clever').length;
    if (clever > 0 && chance(0.0018 * clever * dt)) g.insight += 1;
  }

  const extraEaters = g => (g.people || []).filter(p => p.trait === 'hungry').length;
  const devoutBonus = g => (g.people || []).filter(p => p.trait === 'devout').length * 0.04;

  /* --------------------------------------------------------- 4. buildings */
  function buildingCost(g, id) {
    const b = C2.BUILDINGS[id];
    const tier = SW.boost.buildingTier(g, id);
    const scale = Math.pow(2.6, tier);
    const off = SW.boost.buildCost(g);
    const mats = {};
    for (const k in b.mats) mats[k] = Math.ceil(b.mats[k] * (tier + 1));
    return {
      wood: Math.ceil(b.wood * scale * off),
      coin: Math.ceil(b.coin * scale * off),
      mats: mats,
      tier: tier + 1
    };
  }

  function canBuild(g, id) {
    const b = C2.BUILDINGS[id];
    if (!b) return 'no such building';
    if (SW.boost.buildingTier(g, id) >= b.tiers) return 'already at its final tier';
    if ((b.ring || 0) > (g.ring | 0)) return `needs ${C.RINGS[b.ring].name}`;
    return null;
  }

  function build(g, id) {
    const why = canBuild(g, id);
    if (why) return fail(g, 'You cannot build that — ' + why + '.');
    const b = C2.BUILDINGS[id];
    const cost = buildingCost(g, id);
    if (g.res.wood < cost.wood || g.res.coin < cost.coin) return fail(g, 'Not enough wood and coin.');
    for (const k in cost.mats) if ((g.mats[k] | 0) < cost.mats[k]) return fail(g, `Not enough ${C.MATERIALS[k].name.toLowerCase()}.`);
    g.res.wood -= cost.wood; g.res.coin -= cost.coin;
    for (const k in cost.mats) g.mats[k] -= cost.mats[k];
    g.buildings[id] = cost.tier;
    SW.discovery.firstTime(g, 'built:' + id, 4, `raising a ${b.name.toLowerCase()}`);
    SW.ui.log(g, `${b.glyph} ${b.name} ${cost.tier > 1 ? 'improved to tier ' + cost.tier : 'built'}. ${b.blurb}`, 'great');
    return true;
  }

  /* The watchtower gradually reveals the ground you have not walked. */
  function tickWatchtower(g, dt) {
    const tier = SW.boost.buildingTier(g, 'watchtower');
    if (!tier) return;
    if (!chance(0.0012 * tier * dt)) return;
    const hidden = g.features.filter(f => !f.found && f.ring <= g.ring);
    if (!hidden.length) return;
    const inst = pick(hidden);
    const def = C.FEATURES.find(f => f.id === inst.fid);
    SW.ui.log(g, `From the watchtower you make out ${def.name} out on the ${C.RINGS[inst.ring].name.toLowerCase()}.`, 'info');
    inst.marked = true;
  }

  /* ------------------------------------------------------------ 5. events */
  function maybeEvent(g) {
    if (g.event) return;
    const pool = C2.EVENTS.filter(e => g.day >= (e.min || 0) && !(g.eventSeen && g.eventSeen[e.id] && chance(0.6)));
    if (!pool.length) return;
    let total = 0;
    for (const e of pool) total += e.weight;
    let r = Math.random() * total;
    for (const e of pool) { r -= e.weight; if (r <= 0) { g.event = { id: e.id, day: g.day }; return; } }
  }

  function eventDef(g) {
    return g.event ? C2.EVENTS.find(e => e.id === g.event.id) : null;
  }

  function resolveEvent(g, choiceIndex) {
    const def = eventDef(g);
    if (!def) return false;
    const ch = def.choices[choiceIndex];
    if (!ch) return false;
    applyEffect(g, ch.effect || {});
    if (!g.eventSeen) g.eventSeen = {};
    g.eventSeen[def.id] = g.day;
    g.eventLog.unshift({ day: g.day, title: def.title, choice: ch.label, note: ch.note });
    if (g.eventLog.length > 40) g.eventLog.length = 40;
    SW.ui.log(g, `${def.title} — ${ch.label}. ${ch.note}`, 'great');
    g.event = null;
    return true;
  }

  function applyEffect(g, e) {
    const v = g.village, c = g.creature;
    if (e.villagers) { v.villagers = Math.max(0, v.villagers + e.villagers); syncPeople(g); }
    if (e.food) v.food = Math.max(0, v.food + e.food);
    if (e.faith) v.faith = clamp(v.faith + e.faith, 0, 100);
    if (e.awe) v.awe = clamp(v.awe + e.awe, 0, 100);
    if (e.unrest) v.unrest = clamp(v.unrest + e.unrest, 0, 100);
    if (e.wood) g.res.wood = Math.max(0, g.res.wood + e.wood);
    if (e.prayer) g.res.prayer = Math.max(0, g.res.prayer + e.prayer);
    if (e.insight) g.insight += e.insight;
    if (e.renown) g.res.renown = Math.max(0, g.res.renown + e.renown);
    // Scaled by the day rather than by what you already have: a percentage of
    // a late-game total is an absurd swing from a single click.
    if (e.renownMul) g.res.renown = Math.max(0, g.res.renown + e.renownMul * (400 + g.day * 40));
    if (e.coinMul) g.res.coin = Math.max(0, g.res.coin + e.coinMul * (2000 + g.day * 500));
    if (e.bond) c.bond = clamp(c.bond + e.bond, 0, 100);
    if (e.mood) c.mood = clamp(c.mood + e.mood, 0, 100);
    if (e.hunger) c.hunger = clamp(c.hunger + e.hunger, 0, 130);
    if (e.kind) c.kind = clamp(c.kind + e.kind, -100, 100);
    if (e.vigorCost) c.vigor = clamp(c.vigor - e.vigorCost, 0, 100);
    if (e.mats) for (const k in e.mats) g.mats[k] = (g.mats[k] | 0) + e.mats[k];
    if (e.seedsAll) for (const cr of C.CROP_LIST) g.seeds[cr.id] = (g.seeds[cr.id] | 0) + e.seedsAll;
    if (e.soilAll) for (const p of g.plots) p.soil = clamp(soilOf(p) + e.soilAll, 0, C2.SOIL.max);
    if (e.waterAll) for (const p of g.plots) p.water = clamp(p.water + e.waterAll, 0, 100);
    if (e.burnPlots) {
      let n = e.burnPlots;
      for (const p of g.plots) { if (n <= 0) break; if (p.crop) { p.state = 'tilled'; p.crop = null; p.growth = 0; n--; } }
    }
    if (e.techReps) SW.beast.trainTechnique(g, e.techReps, 8);
    if (e.relicRoll) SW.relics.grant(g);
    if (e.diplo) for (const r of g.rivals) g.diplo[r.name] = clamp((g.diplo[r.name] || 0) + e.diplo, -100, 100);
    if (e.mate) g.mateOffer = SW.beast.rollMate(g);
    if (e.arena) g.arenaChallenge = true;
    if (e.grandeurTemp) g.grandeurBonus = (g.grandeurBonus || 0) + 12;
  }

  /* ------------------------------------------------------------- 6. oaths */
  function counterValue(g, kind) {
    switch (kind) {
      case 'harvests': return g.stats.harvests;
      case 'sold': return g.stats.sold;
      case 'praised': return g.creature.praised + (g.stats.praisedTotal || 0);
      case 'crafted': return Object.values(g.crafted).reduce((a, b) => a + b, 0);
      case 'found': return Object.keys(g.discovered).length;
      case 'fished': return g.stats.fished || 0;
      case 'chores': return g.creature.chores + (g.stats.choresTotal || 0);
      default: return 0;
    }
  }

  function rollOaths(g) {
    g.oaths = [];
    const pool = [...C2.OATH_TEMPLATES];
    for (let i = 0; i < 3 && pool.length; i++) {
      const t = pool.splice(rndInt(0, pool.length - 1), 1)[0];
      const need = Math.max(1, Math.round(t.base + t.scale * g.day));
      g.oaths.push({
        id: t.id, kind: t.kind, need,
        from: counterValue(g, t.kind),
        name: t.name.replace('{n}', need),
        renown: Math.round(t.renown * (1 + g.day * 0.04)),
        insight: t.insight, done: false
      });
    }
    g.oathDay = g.day;
  }

  function oathProgress(g, o) {
    return clamp((counterValue(g, o.kind) - o.from) / o.need, 0, 1);
  }

  function checkOaths(g) {
    if (!g.oaths) return;
    for (const o of g.oaths) {
      if (o.done) continue;
      if (oathProgress(g, o) >= 1) {
        o.done = true;
        g.res.renown += o.renown;
        g.insight += o.insight;
        SW.ui.log(g, `Oath kept — ${o.name}. +${o.renown} renown, +${o.insight} insight.`, 'great');
      }
    }
  }

  /* ------------------------------------------------------------- 7. tick  */
  function tick(g, dt) {
    tickSoil(g, dt);
    tickPeople(g, dt);
    tickWatchtower(g, dt);
    checkOaths(g);
  }

  function newDay(g) {
    advanceWeather(g);
    syncPeople(g);
    if (!g.oathDay || g.day - g.oathDay >= 3) rollOaths(g);
    if (chance(0.16)) maybeEvent(g);
    if (g.grandeurBonus) g.grandeurBonus = Math.max(0, g.grandeurBonus - 0.4);
  }

  SW.world = {
    rollWeather, advanceWeather, seasonProgress, daysToSeasonEnd,
    soilOf, soilYield, fertilise, tickSoil,
    makePerson, syncPeople, assign, extraEaters, devoutBonus,
    buildingCost, canBuild, build,
    maybeEvent, eventDef, resolveEvent, applyEffect,
    rollOaths, oathProgress, checkOaths, counterValue,
    tick, newDay
  };
})(window.SW = window.SW || {});
