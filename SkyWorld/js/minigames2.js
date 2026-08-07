/* Skyward Reach — two more things you play rather than manage.
 *
 * Cloud fishing: a three-stage timing game. Each stage you stop a sweeping
 * marker inside a window that gets narrower and faster; clear more stages and
 * something bigger comes up.
 *
 * Chanting: call and response. The shrine sings a sequence of tones, you sing
 * it back. Get it all and the miracle lands at full strength; fumble it and
 * you get part of one.
 */
(function (SW) {
  'use strict';
  const C = SW.content, C2 = SW.content2;
  const { clamp, rnd, rndInt, pick, chance, fmt } = SW.core;

  const fail = (g, m) => { SW.ui.log(g, m, 'warn'); return false; };

  /* ------------------------------------------------------------ fishing  */
  const CAST_FOCUS = 5;
  const STAGES = 3;

  function fishingUnlocked(g) { return (g.ring | 0) >= 0 && !!g.neurons.listening; }

  function startFishing(g) {
    if (!fishingUnlocked(g)) return fail(g, 'You would not know what to listen for. Grow The Listening first.');
    if (g.fishing || g.listen || g.chant) return false;
    if (g.res.focus < CAST_FOCUS) return fail(g, 'Not enough focus to cast.');
    g.res.focus -= CAST_FOCUS;
    g.fishing = newStage(g, 0);
    SW.ui.log(g, 'You drop a line off the rim into open cloud.', 'info');
    return true;
  }

  function newStage(g, stage) {
    const tight = 1 - stage * 0.26;
    return {
      stage,
      pos: 0, dir: 1,
      speed: 0.85 + stage * 0.38 + Math.min(g.day, 60) * 0.004,
      zone: rnd(0.12, 0.88 - 0.20 * tight),
      zoneW: 0.22 * tight,
      t: 0, result: null, cleared: stage
    };
  }

  function tickFishing(g, dt) {
    const f = g.fishing;
    if (!f) return;
    if (f.result) {
      f.t += dt;
      if (f.t > 1.4) finishFishing(g);
      return;
    }
    f.pos += f.dir * f.speed * dt;
    if (f.pos >= 1) { f.pos = 1; f.dir = -1; }
    if (f.pos <= 0) { f.pos = 0; f.dir = 1; }
    f.t += dt;
    // Give up after a while so a forgotten line does not sit forever.
    if (f.t > 14) { f.result = 'lost'; f.t = 0; }
  }

  /* The click. Inside the window advances a stage; outside ends the cast. */
  function strike(g) {
    const f = g.fishing;
    if (!f || f.result) return false;
    const hit = f.pos >= f.zone && f.pos <= f.zone + f.zoneW;
    if (!hit) {
      f.result = f.stage === 0 ? 'lost' : 'partial';
      f.t = 0;
      return true;
    }
    if (f.stage + 1 >= STAGES) {
      f.result = 'full';
      f.cleared = STAGES;
      f.t = 0;
      return true;
    }
    const next = newStage(g, f.stage + 1);
    next.cleared = f.stage + 1;
    g.fishing = next;
    g.fx.push({ at: 'banner', text: '✔ ' + (f.stage + 1) + '/' + STAGES, life: 1.1, t: 0 });
    return true;
  }

  function pickFish(g, cleared) {
    const night = (g.dayTick / C.TICKS_PER_DAY) > 0.72;
    const pool = C2.FISH.filter(fh => fh.ring <= (g.ring | 0) && (!fh.night || night));
    if (!pool.length) return C2.FISH[0];
    // More stages cleared shifts the draw toward the rare end.
    const target = 1 + cleared * 1.3 + (chance(0.15) ? 1 : 0);
    let best = pool[0];
    for (const fh of pool) {
      if (fh.rarity <= target && fh.rarity >= best.rarity) best = fh;
    }
    // A small chance at something well above your level, which is the hook.
    if (cleared >= STAGES && chance(0.14)) {
      const big = pool.filter(fh => fh.rarity > best.rarity);
      if (big.length) best = pick(big);
    }
    return best;
  }

  function finishFishing(g) {
    const f = g.fishing;
    g.fishing = null;
    if (f.result === 'lost' && f.cleared === 0) {
      SW.ui.log(g, 'The line goes slack. Nothing.', 'warn');
      return;
    }
    const fish = pickFish(g, f.cleared);
    g.fish[fish.id] = (g.fish[fish.id] | 0) + 1;
    g.stats.fished = (g.stats.fished || 0) + 1;
    if (fish.mat) g.mats[fish.mat] = (g.mats[fish.mat] | 0) + 1;
    SW.discovery.firstTime(g, 'fish:' + fish.id, 3, `landing a ${fish.name.toLowerCase()}`);
    SW.ui.log(g, `${fish.glyph} ${fish.name}. ${fish.blurb}`, fish.rarity >= 3 ? 'great' : 'good');
    if (fish.rarity >= 4) {
      g.fx.push({ at: 'banner', text: fish.glyph + ' ' + fish.name, life: 4, t: 0 });
      if (chance(0.22)) SW.relics.grant(g);   // something was inside it
    }
    SW.beast.trainTechnique(g, 'sense', 1);
  }

  function sellFish(g, id, n) {
    const fh = C2.FISH.find(x => x.id === id);
    const have = g.fish[id] | 0;
    const want = Math.min(n, have);
    if (want <= 0) return 0;
    g.fish[id] -= want;
    const coin = Math.round(fh.coin * want * SW.boost.get(g, 'coin'));
    g.res.coin += coin;
    g.stats.coinEarned += coin;
    return coin;
  }

  function eatFish(g, id, n) {
    const fh = C2.FISH.find(x => x.id === id);
    const have = g.fish[id] | 0;
    const want = Math.min(n, have);
    if (want <= 0) return 0;
    g.fish[id] -= want;
    g.village.food += fh.feed * want;
    return fh.feed * want;
  }

  /* ----------------------------------------------------------- chanting  */
  function chantUnlocked(g) { return (g.shrine | 0) >= 2; }

  function startChant(g, id) {
    const ch = C2.CHANTS.find(x => x.id === id);
    if (!ch) return false;
    if (!chantUnlocked(g)) return fail(g, 'You need a shrine worth chanting at.');
    if ((g.ring | 0) < ch.ring) return fail(g, `That one belongs to ${C.RINGS[ch.ring].name}.`);
    if (g.chant || g.listen || g.fishing) return false;
    if (g.res.prayer < ch.prayer) return fail(g, 'Not enough prayer.');
    g.res.prayer -= ch.prayer;
    const seq = [];
    for (let i = 0; i < ch.len; i++) seq.push(rndInt(0, C2.CHANT_TONES.length - 1));
    g.chant = { id, seq, input: [], phase: 'show', shown: 0, t: 0, lit: -1 };
    return true;
  }

  const SHOW_ON = 0.42, SHOW_OFF = 0.20;

  function tickChant(g, dt) {
    const ch = g.chant;
    if (!ch) return;
    ch.t += dt;
    if (ch.phase === 'show') {
      const step = SHOW_ON + SHOW_OFF;
      const i = Math.floor(ch.t / step);
      if (i >= ch.seq.length) { ch.phase = 'input'; ch.lit = -1; ch.t = 0; return; }
      ch.lit = (ch.t - i * step) < SHOW_ON ? ch.seq[i] : -1;
    } else if (ch.phase === 'input') {
      if (ch.t > 3.5 + ch.seq.length * 1.3) resolveChant(g);
    } else if (ch.phase === 'done') {
      if (ch.t > 1.2) g.chant = null;
    }
  }

  function chantInput(g, tone) {
    const ch = g.chant;
    if (!ch || ch.phase !== 'input') return false;
    ch.input.push(tone);
    ch.lit = tone;
    ch.flash = 0.18;
    if (ch.input.length >= ch.seq.length) resolveChant(g);
    return true;
  }

  function resolveChant(g) {
    const ch = g.chant;
    const def = C2.CHANTS.find(x => x.id === ch.id);
    let right = 0;
    for (let i = 0; i < ch.seq.length; i++) if (ch.input[i] === ch.seq[i]) right++;
    const acc = right / ch.seq.length;
    ch.phase = 'done';
    ch.t = 0;
    ch.acc = acc;
    applyChant(g, def, acc);
  }

  function applyChant(g, def, acc) {
    if (acc <= 0.34) {
      SW.ui.log(g, `The ${def.name} falls apart in your mouth. The prayer is spent regardless.`, 'bad');
      return;
    }
    const p = acc;
    switch (def.id) {
      case 'growth':
        for (const pl of g.plots) if (pl.state === 'growing') {
          pl.growth += C.CROPS[pl.crop].growTicks * 0.35 * p;
          if (pl.growth >= C.CROPS[pl.crop].growTicks) { pl.state = 'ripe'; pl.growth = C.CROPS[pl.crop].growTicks; }
        }
        g.fx.push({ at: 'sky', kind: 'shine', life: 2, t: 0 });
        break;
      case 'calm':
        g.village.unrest = clamp(g.village.unrest - 45 * p, 0, 100);
        g.creature.mood = clamp(g.creature.mood + 30 * p, 0, 100);
        break;
      case 'plenty':
        g.village.food += 130 * p;
        g.village.faith = clamp(g.village.faith + 7 * p, 0, 100);
        break;
      case 'fear':
        g.village.awe = clamp(g.village.awe + 26 * p, 0, 100);
        g.village.faith = clamp(g.village.faith - 6 * p, 0, 100);
        g.fx.push({ at: 'sky', kind: 'storm', life: 3, t: 0 });
        break;
      case 'insight':
        g.insight += Math.round(14 * p * SW.boost.get(g, 'insight'));
        break;
      case 'renewal':
        for (const pl of g.plots) pl.soil = clamp(SW.world.soilOf(pl) + 55 * p, 0, C2.SOIL.max);
        break;
    }
    const word = acc >= 0.999 ? 'perfectly' : acc >= 0.7 ? 'well enough' : 'badly';
    SW.ui.log(g, `${def.glyph} ${def.name}, sung ${word}. ${def.blurb}`, acc >= 0.999 ? 'great' : 'good');
    g.stats.chants = (g.stats.chants || 0) + 1;
    SW.discovery.firstTime(g, 'chant:' + def.id, 5, `singing the ${def.name}`);
    if (acc >= 0.999) SW.discovery.firstTime(g, 'chantperfect', 8, 'singing one without a mistake');
  }

  function tick(g, dt) {
    tickFishing(g, dt);
    tickChant(g, dt);
  }

  const busy = g => !!(g.listen || g.fishing || g.chant);

  SW.mini2 = {
    CAST_FOCUS, STAGES, fishingUnlocked, startFishing, tickFishing, strike, finishFishing,
    sellFish, eatFish, chantUnlocked, startChant, tickChant, chantInput, tick, busy
  };
})(window.SW = window.SW || {});
