/* Coremind — sentiment net. The colony has a mood because a small
 * network feels the weather, the grudges, and the scars, then leans
 * the utility AI. Not a metaphor: 8 → 6 → 4, tanh, Hebbian.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const INPUTS = ['hunger', 'dread', 'brood', 'war', 'trust', 'awe', 'grief', 'curiosity'];
  const HIDDEN = ['pulse', 'coil', 'hearth', 'veil', 'fang', 'root'];
  const OUTPUTS = ['forage', 'fight', 'nest', 'wonder'];
  const NI = INPUTS.length, NH = HIDDEN.length, NO = OUTPUTS.length;
  const RATE = 0.012;
  const WMAX = 2;

  const MOODS = {
    forage: { hunger: 'Starving', dread: 'Wary', brood: 'Hungry', war: 'Hungry',
      trust: 'Hungry', awe: 'Hungry', grief: 'Hollow-gut', curiosity: 'Foraging' },
    fight: { hunger: 'Bloodied', dread: 'Cornered', brood: 'Fighting', war: 'Fighting',
      trust: 'Fighting', awe: 'Fighting', grief: 'Fighting', curiosity: 'Hunting' },
    nest: { hunger: 'Resting', dread: 'Hiding', brood: 'Brooding', war: 'Dug-in',
      trust: 'Resting', awe: 'Resting', grief: 'Mourning', curiosity: 'Resting' },
    wonder: { hunger: 'Exploring', dread: 'Wary', brood: 'Exploring', war: 'Scouting',
      trust: 'Exploring', awe: 'Awestruck', grief: 'Wandering', curiosity: 'Curious' }
  };

  function tanh(x) { return Math.tanh(x); }

  function freshNet(seed) {
    const rng = K.rngFrom((seed || 1) ^ 0xA11A);
    const w1 = new Float32Array(NH * NI);
    const bh = new Float32Array(NH);
    const w2 = new Float32Array(NO * NH);
    const bo = new Float32Array(NO);
    for (let i = 0; i < w1.length; i++) w1[i] = (rng() * 2 - 1) * 0.55;
    for (let i = 0; i < bh.length; i++) bh[i] = (rng() * 2 - 1) * 0.15;
    for (let i = 0; i < w2.length; i++) w2[i] = (rng() * 2 - 1) * 0.55;
    for (let i = 0; i < bo.length; i++) bo[i] = (rng() * 2 - 1) * 0.1;
    return { w1, bh, w2, bo };
  }

  function pack(net) {
    return {
      w1: Array.from(net.w1), bh: Array.from(net.bh),
      w2: Array.from(net.w2), bo: Array.from(net.bo)
    };
  }

  function unpack(data, seed) {
    if (!data || !data.w1) return freshNet(seed);
    const net = freshNet(seed);
    net.w1.set(data.w1); net.bh.set(data.bh);
    net.w2.set(data.w2); net.bo.set(data.bo);
    return net;
  }

  function ensure(game) {
    if (!game) return null;
    if (!game.sentiment) {
      game.sentiment = {
        net: freshNet(game.seed),
        last: null,
        grief: 0
      };
    } else if (!game.sentiment.net || !game.sentiment.net.w1) {
      game.sentiment.net = freshNet(game.seed);
    }
    return game.sentiment;
  }

  function aura01(game, ch) {
    if (!CM.aura || !game.core) return 0;
    const d = game.viewDepth || 0;
    return K.clamp01(CM.aura.sample(game, game.core.x, game.core.y, d, ch) / 3.2);
  }

  function gatherInputs(game) {
    const x = new Float32Array(NI);
    let hunger = aura01(game, 'hunger');
    if (game.organisms) {
      let n = 0, h = 0;
      for (const o of game.organisms) {
        if (!o.alive || o.ownerId !== 'player') continue;
        h += o.hunger || 0; n++;
      }
      if (n) hunger = Math.max(hunger, K.clamp01((h / n) / 100));
    }
    x[0] = hunger;
    x[1] = aura01(game, 'dread');
    x[2] = aura01(game, 'brood');
    x[3] = aura01(game, 'war');

    let trust = 0.5, tn = 0;
    if (game.core && game.core.standing) {
      for (const id in game.core.standing) {
        trust += (game.core.standing[id] + 1) * 0.5;
        tn++;
      }
      if (tn) trust = trust / (tn + 1);
    }
    x[4] = K.clamp01(trust);
    x[5] = K.clamp01((game.viewDepth || 0) / 10);
    const scars = game.economy ? game.economy.scars || 0 : 0;
    x[6] = K.clamp01((game.sentiment && game.sentiment.grief || 0) * 0.2 + scars * 0.12);
    let cur = 0;
    if (game.discovery && game.discovery.observations) {
      for (const k in game.discovery.observations) {
        const v = game.discovery.observations[k];
        if (v && v < 1) cur += 1;
      }
    }
    x[7] = K.clamp01(cur / 8);
    return x;
  }

  function forward(net, x) {
    const h = new Float32Array(NH);
    for (let i = 0; i < NH; i++) {
      let s = net.bh[i];
      const off = i * NI;
      for (let j = 0; j < NI; j++) s += net.w1[off + j] * x[j];
      h[i] = tanh(s);
    }
    const y = new Float32Array(NO);
    for (let k = 0; k < NO; k++) {
      let s = net.bo[k];
      const off = k * NH;
      for (let i = 0; i < NH; i++) s += net.w2[off + i] * h[i];
      y[k] = (tanh(s) + 1) * 0.5;
    }
    return { h, y };
  }

  function feel(game) {
    const st = ensure(game);
    const x = gatherInputs(game);
    const { h, y } = forward(st.net, x);
    let bi = 0, bj = 0;
    for (let k = 1; k < NO; k++) if (y[k] > y[bi]) bi = k;
    for (let j = 1; j < NI; j++) if (x[j] > x[bj]) bj = j;
    const outName = OUTPUTS[bi];
    const inName = INPUTS[bj];
    const label = (MOODS[outName] && MOODS[outName][inName]) || 'Exploring';
    const last = {
      x: Array.from(x), h: Array.from(h), y: Array.from(y),
      mood: outName, flavor: inName, label
    };
    st.last = last;
    return last;
  }

  /* Outcome nudges the output that should grow next time those inputs fire. */
  const OUTCOME_TARGET = {
    fed: 0, kill: 1, fled: 2, sighted: 3, gift: 2, created: 3
  };

  function learn(game, outcome) {
    const st = ensure(game);
    const last = st.last || feel(game);
    const t = OUTCOME_TARGET[outcome];
    if (t == null) return;
    const net = st.net;
    const h = last.h, x = last.x;
    for (let i = 0; i < NH; i++) {
      const idx = t * NH + i;
      net.w2[idx] = K.clamp(net.w2[idx] + RATE * h[i], -WMAX, WMAX);
    }
    net.bo[t] = K.clamp(net.bo[t] + RATE * 0.4, -WMAX, WMAX);
    for (let i = 0; i < NH; i++) {
      for (let j = 0; j < NI; j++) {
        const idx = i * NI + j;
        net.w1[idx] = K.clamp(net.w1[idx] + RATE * 0.35 * x[j] * h[i], -WMAX, WMAX);
      }
    }
    if (outcome === 'kill') st.grief = Math.min(8, (st.grief || 0) + 0.35);
    if (outcome === 'gift' || outcome === 'fed') st.grief = Math.max(0, (st.grief || 0) - 0.2);
  }

  function tick(game, dt) {
    const st = ensure(game);
    st.grief = Math.max(0, (st.grief || 0) - 0.05 * dt);
    feel(game);
  }

  function aiMul(game, org, stateKey) {
    if (!game || !org || org.ownerId === 'wild') return 1;
    const last = (game.sentiment && game.sentiment.last) || feel(game);
    const y = last.y;
    if (stateKey === 'SEEK_FOOD') return 0.72 + 0.85 * y[0];
    if (stateKey === 'HUNT' || stateKey === 'ATTACK') return 0.68 + 0.95 * y[1];
    if (stateKey === 'SHELTER' || stateKey === 'REPRODUCE') return 0.72 + 0.8 * y[2];
    if (stateKey === 'EXPLORE' || stateKey === 'INVESTIGATE') return 0.7 + 0.9 * y[3];
    return 1;
  }

  function serialize(game) {
    const st = game && game.sentiment;
    if (!st) return null;
    return { net: pack(st.net), grief: st.grief || 0 };
  }

  function hydrate(game, data) {
    game.sentiment = {
      net: unpack(data && data.net, game.seed),
      last: null,
      grief: data && data.grief || 0
    };
    feel(game);
  }

  CM.sentiment = {
    INPUTS, HIDDEN, OUTPUTS, MOODS,
    ensure, feel, learn, tick, aiMul, serialize, hydrate, freshNet, forward
  };
})(window.CM = window.CM || {});
