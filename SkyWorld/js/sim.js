/* Skyward Reach — the world tick: village, economy, rivals, festivals, feats,
 * plus every action the player themself can take. */
(function (SW) {
  'use strict';
  const C = SW.content;
  const F = SW.farm;
  const Cr = SW.creature;
  const { clamp, hashNoise, chance, pick, fmt } = SW.core;

  const OFFLINE_CAP_TICKS = 4 * 60 * 60;   // four hours of catch-up, at most
  const FOCUS_REGEN = 0.55;

  const COST = { till: 3, sow: 1, water: 1, harvest: 2, forage: 3 };

  // --- rank --------------------------------------------------------------
  function rankOf(g) {
    let r = C.RANKS[0];
    for (const rk of C.RANKS) if (g.res.renown >= rk.renown) r = rk;
    return r;
  }
  function nextRank(g) {
    const cur = rankOf(g);
    return C.RANKS[Math.min(cur.id + 1, C.RANKS.length - 1)] === cur ? null : C.RANKS[cur.id + 1];
  }
  const grandeur = g => C.SHRINE_TIERS[g.shrine].grandeur;

  // --- player actions ----------------------------------------------------
  function spend(g, focus) {
    if (g.res.focus < focus) return false;
    g.res.focus -= focus;
    return true;
  }

  function playerTill(g, plot) {
    if (plot.state !== 'raw') return fail(g, 'That soil is already broken.');
    if (!spend(g, COST.till)) return fail(g, 'Not enough focus.');
    F.till(g, plot);
    Cr.observe(g, 'till');
    return true;
  }

  function playerSow(g, plot, cropId) {
    if (plot.state !== 'tilled') return fail(g, 'Break the soil first.');
    if ((g.seeds[cropId] | 0) <= 0) return fail(g, `No ${C.CROPS[cropId].name} seed left.`);
    if (!spend(g, COST.sow)) return fail(g, 'Not enough focus.');
    F.sow(g, plot, cropId);
    Cr.observe(g, 'sow');
    return true;
  }

  function playerWater(g, plot) {
    if (plot.state !== 'growing' && plot.state !== 'ripe') return fail(g, 'Nothing there to water.');
    if (!spend(g, COST.water)) return fail(g, 'Not enough focus.');
    F.water(g, plot);
    Cr.observe(g, 'water');
    return true;
  }

  function playerHarvest(g, plot) {
    if (plot.state !== 'ripe') return fail(g, 'Not ready.');
    if (!spend(g, COST.harvest)) return fail(g, 'Not enough focus.');
    const r = F.harvest(g, plot, 1);
    Cr.observe(g, 'harvest');
    if (r) SW.ui.log(g, `You gather ${r.amount} ${r.crop.name}.`);
    return true;
  }

  function playerForage(g) {
    if (!spend(g, COST.forage)) return fail(g, 'Not enough focus.');
    const n = 3;
    g.res.wood += n;
    Cr.observe(g, 'forage');
    SW.ui.log(g, `You haul ${n} wood out of the treeline.`);
    return true;
  }

  function fail(g, msg) { SW.ui.log(g, msg, 'warn'); return false; }

  // --- building ----------------------------------------------------------
  function hutCost(g) {
    const n = g.village.huts;
    return {
      wood: Math.ceil(C.HUT_COST.wood * Math.pow(C.HUT_COST.scale, n - 3)),
      coin: Math.ceil(C.HUT_COST.coin * Math.pow(C.HUT_COST.scale, n - 3))
    };
  }
  function plotCost(g) {
    const n = g.plots.length;
    return {
      wood: Math.ceil(C.PLOT_COST.wood * Math.pow(C.PLOT_COST.scale, n - 3)),
      coin: Math.ceil(C.PLOT_COST.coin * Math.pow(C.PLOT_COST.scale, n - 3))
    };
  }

  function buildHut(g) {
    const c = hutCost(g);
    if (g.res.wood < c.wood || g.res.coin < c.coin) return fail(g, 'You cannot afford another hut.');
    g.res.wood -= c.wood; g.res.coin -= c.coin;
    g.village.huts++;
    SW.ui.log(g, 'A new hut goes up. Somewhere below, someone hears about it.', 'good');
    return true;
  }

  function clearPlot(g) {
    if (!g.lockedPlots.length) return fail(g, 'There is no more island to break.');
    const c = plotCost(g);
    if (g.res.wood < c.wood || g.res.coin < c.coin) return fail(g, 'Not enough wood and coin.');
    g.res.wood -= c.wood; g.res.coin -= c.coin;
    g.plots.push(g.lockedPlots.shift());
    SW.ui.log(g, 'New ground, cleared and claimed.', 'good');
    return true;
  }

  function upgradeShrine(g) {
    const next = C.SHRINE_TIERS[g.shrine + 1];
    if (!next) return fail(g, 'The shrine is already everything it can be.');
    if (rankOf(g).id < next.rank) return fail(g, `You must stand at ${C.RANKS[next.rank].name} before the stones will hold.`);
    if (g.res.wood < next.wood || g.res.coin < next.coin) return fail(g, 'Not enough wood and coin.');
    g.res.wood -= next.wood; g.res.coin -= next.coin;
    g.shrine++;
    g.village.faith = clamp(g.village.faith + 6, 0, 100);
    SW.ui.log(g, `The shrine rises. It is a ${next.name} now, and it can be seen from other islands.`, 'great');
    return true;
  }

  // --- miracles ----------------------------------------------------------
  function castMiracle(g, id) {
    const m = C.MIRACLES[id];
    if (!m) return false;
    if (rankOf(g).id < m.rank) return fail(g, 'That power is beyond your standing.');
    if (g.res.prayer < m.cost) return fail(g, 'Not enough prayer.');
    g.res.prayer -= m.cost;
    g.stats.miracles++;
    switch (id) {
      case 'rain':
        for (const p of g.plots) if (p.crop) { p.water = 100; p.rot = Math.max(0, p.rot - 30); }
        g.fx.push({ at: 'sky', kind: 'rain', life: 6, t: 0 });
        SW.ui.log(g, 'Rain, on your say-so. Every plot drinks.', 'good');
        break;
      case 'quickening':
        for (const p of g.plots) if (p.state === 'growing') {
          p.growth += C.CROPS[p.crop].growTicks * 0.25;
          if (p.growth >= C.CROPS[p.crop].growTicks) { p.state = 'ripe'; p.growth = C.CROPS[p.crop].growTicks; }
        }
        g.fx.push({ at: 'sky', kind: 'shine', life: 2.5, t: 0 });
        SW.ui.log(g, 'The fields lurch forward a season in a heartbeat.', 'good');
        break;
      case 'bounty':
        g.village.food += 42;
        g.village.faith = clamp(g.village.faith + 3, 0, 100);
        SW.ui.log(g, 'Bread out of nothing. The granary is full and they know who filled it.', 'good');
        break;
      case 'mend':
        g.creature.vigor = 100;
        g.creature.hunger = clamp(g.creature.hunger + 45, 0, 130);
        g.creature.mood = clamp(g.creature.mood + 12, 0, 100);
        g.creature.bond = clamp(g.creature.bond + 1.5, 0, 100);
        g.fx.push({ at: 'creature', text: '💗', tone: 'good', life: 1.8, t: 0 });
        SW.ui.log(g, `${g.creature.name} straightens up, whole again.`, 'good');
        break;
      case 'storm':
        g.village.awe = clamp(g.village.awe + 14, 0, 100);
        g.village.faith = clamp(g.village.faith - 6, 0, 100);
        g.village.unrest = clamp(g.village.unrest + 8, 0, 100);
        g.creature.mood = clamp(g.creature.mood - 6, 0, 100);
        g.fx.push({ at: 'sky', kind: 'storm', life: 4, t: 0 });
        SW.ui.log(g, 'You break the sky over their heads. Nobody will forget the date.', 'bad');
        break;
    }
    return true;
  }

  // --- world tick --------------------------------------------------------
  function tickVillage(g, dt) {
    const v = g.village;
    const eaten = v.villagers * 0.085 * dt;
    if (v.food >= eaten) {
      v.food -= eaten;
      v.faith = clamp(v.faith + 0.028 * dt, 0, 100);
      v.unrest = clamp(v.unrest - 0.05 * dt, 0, 100);
    } else {
      v.food = 0;
      v.faith = clamp(v.faith - 0.13 * dt, 0, 100);
      v.unrest = clamp(v.unrest + 0.09 * dt, 0, 100);
    }
    // Faith settles toward what you visibly provide — a shrine to look at, a
    // full granary, neighbours who stayed — less whatever they are afraid of.
    // A people who fear you do not also love you, so the two paths compete
    // instead of stacking.
    const pull = clamp(18 + grandeur(g) * 1.8 + (v.food > 40 ? 18 : 0) + v.villagers * 0.8
      - v.awe * 0.62 - v.unrest * 0.45, 0, 100);
    v.faith += (pull - v.faith) * 0.0022 * dt;
    v.faith = clamp(v.faith, 0, 100);
    v.awe = clamp(v.awe - 0.022 * dt, 0, 100);
    // Living under a terror is exhausting. Awe keeps unrest topped up on its
    // own, so a fear empire steadily bleeds the villagers it multiplies.
    v.unrest = clamp(v.unrest + v.awe * 0.0042 * dt, 0, 100);

    // Prayer: love gives it freely, terror gives it grudgingly.
    const rate = v.villagers * (v.faith / 100 * 0.055 + v.awe / 100 * 0.03);
    g.res.prayer += rate * dt;

    // Standing compounds. A congregation is worth what it feels about you,
    // multiplied by how far away your shrine can be seen. Neither half alone
    // gets you up the Register — this is the engine the whole grind feeds.
    const devotion = v.villagers * (v.faith + v.awe) / 100;
    g.res.renown += (1 + grandeur(g) * 0.05) * devotion * 0.09 * dt;
  }

  function checkFeats(g) {
    for (const f of C.FEATS) {
      if (g.feats[f.id]) continue;
      let ok = false;
      try { ok = f.check(g); } catch (e) { ok = false; }
      if (ok) {
        g.feats[f.id] = g.day;
        g.res.renown += f.renown;
        SW.ui.log(g, `Feat — ${f.name}. +${f.renown} renown.`, 'great');
        g.fx.push({ at: 'banner', text: 'FEAT · ' + f.name, life: 4, t: 0 });
      }
    }
  }

  // A rival's ceiling on daily growth. Their curve accelerates for the first
  // ~70 days and then levels off for good: an established god is not getting
  // any more established. A fully built island out-earns even the fastest of
  // them, which is what makes first place reachable instead of a treadmill.
  const RIVAL_MAX_GAIN = 650;

  function tickRivals(g) {
    // Rivals climb their own curve and never chase you. Nothing rubber-bands,
    // which is the whole reason passing one of them means anything.
    for (const r of g.rivals) {
      const n = hashNoise(r.seed, g.day);
      const curve = Math.min(25 + 4.5 * Math.pow(g.day, 1.15), RIVAL_MAX_GAIN);
      let gain = r.pace * curve * (0.72 + n * 0.62);
      if (hashNoise(r.seed + 5, g.day) < r.spike * 0.25) gain *= 2.2;    // a good week
      r.renown += gain;
    }
  }

  function standings(g) {
    const rows = g.rivals.map(r => ({ name: r.name, renown: Math.floor(r.renown), you: false, tone: r.tone }));
    rows.push({ name: g.godName, renown: Math.floor(g.res.renown), you: true, tone: 'you' });
    rows.sort((a, b) => b.renown - a.renown);
    rows.forEach((r, i) => { r.place = i + 1; });
    return rows;
  }

  function tickChatter(g) {
    const rows = standings(g);
    const me = rows.find(r => r.you);
    g.lastStanding = me.place;
    if (!chance(0.75)) return;
    const rival = pick(g.rivals);
    const rel = rival.renown > g.res.renown * 1.15 ? 'ahead'
      : rival.renown < g.res.renown * 0.85 ? 'behind' : 'near';
    const line = pick(C.BARBS[rel][rival.tone]).replace(/\{r\}/g, rival.name);
    g.chatter.unshift({ day: g.day, text: line, rel });
    if (g.chatter.length > 40) g.chatter.length = 40;
  }

  // --- festivals ---------------------------------------------------------
  function festivalScore(g, cat) {
    const c = g.creature;
    switch (cat.id) {
      case 'harvest': {
        let best = 0, total = 0;
        for (const cr of C.CROP_LIST) {
          const n = g.stock[cr.id] | 0;
          total += n;
          best = Math.max(best, F.price(g, cr.id) * n);
        }
        return best + total * 3;
      }
      case 'beast': {
        let m = 0;
        for (const id of C.TRAINABLE) if (C.ACTS[id].useful) m += Cr.mastery(g, id);
        return (c.stats.strength + c.stats.cunning + c.stats.grace) * 8
          + c.bond * 2.2 + c.size * 55 + m * 34 + Math.abs(c.kind) * 0.7;
      }
      case 'rite':
      default:
        return grandeur(g) * 6.5 + g.village.faith * 2.2 + g.village.awe * 1.7 + g.village.villagers * 9;
    }
  }

  function runFestival(g) {
    const cat = C.FESTIVALS[g.festival.index % C.FESTIVALS.length];
    const mine = festivalScore(g, cat);
    // Rivals are scored against a par curve for the category, not against their
    // renown — otherwise a runaway leader would sweep every event forever.
    const par = cat.par(g.day);
    const field = g.rivals.map(r => ({
      name: r.name,
      score: par * (0.5 + r.pace * 0.5) * (0.6 + hashNoise(r.seed + 31, g.day) * 0.8)
    }));
    field.push({ name: g.godName, score: mine, you: true });
    field.sort((a, b) => b.score - a.score);
    const place = field.findIndex(f => f.you) + 1;

    const payout = place === 1 ? Math.round(150 + g.day * 14)
      : place === 2 ? Math.round(85 + g.day * 8)
      : place === 3 ? Math.round(50 + g.day * 5)
      : Math.round(8 + g.day);
    g.res.renown += payout;
    g.stats.festivals++;
    if (place === 1) g.stats.festivalWins++;
    if (place <= 3) g.trophies.push({ fest: cat.id, name: cat.name, place, day: g.day });

    g.festival.lastResult = { cat: cat.id, name: cat.name, place, score: Math.round(mine), payout, day: g.day, field: field.slice(0, 5).map(f => ({ name: f.name, score: Math.round(f.score), you: !!f.you })) };
    g.festival.index++;
    g.festival.nextDay = g.day + 5;

    const tone = place === 1 ? 'great' : place <= 3 ? 'good' : 'warn';
    const ord = place === 1 ? 'first' : place === 2 ? 'second' : place === 3 ? 'third' : `${place}th`;
    SW.ui.log(g, `${cat.name}: you place ${ord}. +${payout} renown.`, tone);
    g.fx.push({ at: 'banner', text: `${cat.glyph} ${cat.name} — ${ord}`, life: 5, t: 0 });
    return g.festival.lastResult;
  }

  // --- day rollover ------------------------------------------------------
  function newDay(g) {
    g.day++;
    g.stats.days++;
    F.rollPrices(g);
    tickRivals(g);
    tickChatter(g);

    // Arrivals: people move toward a god who feeds them and has room.
    const v = g.village;
    if (v.huts > v.villagers && v.faith > 42 && v.food > 12 && chance(0.6)) {
      v.villagers++;
      SW.ui.log(g, 'Someone new climbs up out of the cloud and asks to stay.', 'good');
    }
    if (v.unrest > 75 && v.villagers > 1 && chance(0.5)) {
      v.villagers--;
      v.unrest -= 25;
      SW.ui.log(g, 'A family leaves in the night. Word of that travels too.', 'bad');
    }

    const before = rankOf(g).id;
    checkFeats(g);
    if (g.day >= g.festival.nextDay) runFestival(g);
    checkFeats(g);
    const after = rankOf(g).id;
    if (after > before) {
      const rk = C.RANKS[after];
      SW.ui.log(g, `The Register lists you as ${rk.name}. ${rk.unlock || ''}`, 'great');
      g.fx.push({ at: 'banner', text: 'RANK · ' + rk.name, life: 5, t: 0 });
    }
  }

  function tick(g, dt) {
    g.tick += dt;
    g.dayTick += dt;
    g.res.focus = clamp(g.res.focus + FOCUS_REGEN * dt, 0, g.res.focusMax);

    F.tickPlots(g, dt);
    Cr.tick(g, dt);
    tickVillage(g, dt);

    while (g.dayTick >= C.TICKS_PER_DAY) {
      g.dayTick -= C.TICKS_PER_DAY;
      newDay(g);
    }
  }

  /* Catch-up when the tab has been closed. Coarse but honest: the same rules,
   * just stepped in bigger chunks. */
  function runOffline(g) {
    const now = Date.now();
    const elapsed = Math.max(0, Math.floor((now - (g.__savedAt || now)) / 1000));
    const ticks = Math.min(elapsed, OFFLINE_CAP_TICKS);
    if (ticks < 30) return null;
    const before = { renown: g.res.renown, coin: g.res.coin, harvests: g.stats.harvests, day: g.day };
    // Step one tick at a time. Bigger batches skip phases of the creature's
    // act loop, which quietly starves the farm it was trained to run — and the
    // whole point of training it is that it keeps working while you are gone.
    // Four hours is 14,400 iterations, a few tens of milliseconds.
    const quiet = SW.ui.log;
    SW.ui.log = () => {};
    try {
      for (let t = 0; t < ticks; t++) tick(g, 1);
    } finally {
      SW.ui.log = quiet;
    }
    const mins = Math.round(ticks / 60);
    return {
      minutes: mins,
      days: g.day - before.day,
      renown: Math.floor(g.res.renown - before.renown),
      coin: Math.floor(g.res.coin - before.coin),
      harvests: g.stats.harvests - before.harvests
    };
  }

  /* What a competent rival is expected to score at this festival today. Shown
   * to the player so an entry is a decision, not a coin flip. */
  function festivalPar(g, cat) { return cat.par(g.day); }

  SW.sim = {
    COST, rankOf, nextRank, grandeur, tick, newDay, runOffline, festivalPar,
    playerTill, playerSow, playerWater, playerHarvest, playerForage,
    hutCost, plotCost, buildHut, clearPlot, upgradeShrine, castMiracle,
    standings, checkFeats, festivalScore, runFestival
  };
})(window.SW = window.SW || {});
