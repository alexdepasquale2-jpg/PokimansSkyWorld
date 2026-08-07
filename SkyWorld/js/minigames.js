/* Skyward Reach — the two things you play rather than manage.
 *
 * The Listening: stop working, sweep the island, and click what answers before
 * it goes quiet again. The only reliable source of storm glass and skymetal.
 *
 * The Bench: put two materials together and find out what happens. There is no
 * recipe list. Five of the twenty-one pairings are dead ends, and finding one
 * out is worth a little on its own.
 */
(function (SW) {
  'use strict';
  const C = SW.content;
  const D = SW.discovery;
  const { clamp, rnd, rndInt, pick, chance, fmt } = SW.core;

  // ---------------------------------------------------------------- listen
  const LISTEN_FOCUS = 8;
  const LISTEN_DUR = 15;        // ticks
  const LISTEN_COOLDOWN = 50;   // ticks
  const NODE_LIFE = 2.4;
  const NODE_GAP = 1.25;

  function listenUnlocked(g) { return !!g.neurons.listening; }

  function listenReady(g) {
    return listenUnlocked(g) && !g.listen && (g.tick - (g.listenAt || -9999)) >= LISTEN_COOLDOWN;
  }

  function listenCooldown(g) {
    return Math.max(0, LISTEN_COOLDOWN - (g.tick - (g.listenAt || -9999)));
  }

  /* Which materials the island is willing to give up, by how far out you have
   * built. Skymetal only exists once you have reached The Far Reach. */
  function matPool(g) {
    const pool = ['fibre', 'fibre', 'clay', 'clay'];
    if (g.ring >= 1) pool.push('resin', 'bone');
    if (g.ring >= 2) pool.push('glass', 'glass');
    if (g.ring >= 3) pool.push('metal', 'metal');
    return pool;
  }

  function startListen(g) {
    if (!listenUnlocked(g)) { SW.ui.log(g, 'You do not know how to listen yet.', 'warn'); return false; }
    if (g.listen || g.fishing || g.chant) return false;
    if (listenCooldown(g) > 0) {
      SW.ui.log(g, `Too soon. The island is still ringing (${Math.ceil(listenCooldown(g))}s).`, 'warn');
      return false;
    }
    if (g.res.focus < LISTEN_FOCUS) { SW.ui.log(g, 'Not enough focus to listen properly.', 'warn'); return false; }
    g.res.focus -= LISTEN_FOCUS;
    g.listen = { t: 0, next: 0.5, nodes: [], hits: 0, spawned: 0, take: { insight: 0, wood: 0, coin: 0, mats: {} } };
    SW.ui.log(g, 'You go still and listen. The island starts giving itself away.', 'good');
    return true;
  }

  function spawnNode(g) {
    const L = g.listen;
    const radius = D.ringOf(g).radius;
    const roll = Math.random();
    const kind = roll < 0.30 ? 'insight' : roll < 0.55 ? 'mat' : roll < 0.80 ? 'coin' : 'wood';
    L.nodes.push({
      ang: rnd(0, Math.PI * 2),
      dist: rnd(0.22, radius * 0.92),
      t: 0,
      life: NODE_LIFE,
      kind: kind,
      hit: false
    });
    L.spawned++;
  }

  function tick(g, dt) {
    const L = g.listen;
    if (!L) return;
    L.t += dt;
    L.next -= dt;
    if (L.next <= 0 && L.t < LISTEN_DUR - NODE_LIFE * 0.5) {
      spawnNode(g);
      L.next = NODE_GAP * rnd(0.75, 1.3);
    }
    for (let i = L.nodes.length - 1; i >= 0; i--) {
      const n = L.nodes[i];
      n.t += dt;
      if (n.t >= n.life) L.nodes.splice(i, 1);
    }
    if (L.t >= LISTEN_DUR) finishListen(g);
  }

  function collect(g, node) {
    const L = g.listen;
    const t = L.take;
    switch (node.kind) {
      case 'insight': {
        // The only repeatable source of Insight in the game, so it has to be
        // worth stopping work for — and worth more the further out you build.
        const n = Math.max(1, Math.round((2 + g.ring * 2) * D.insightMul(g) * SW.boost.get(g, 'listen')));
        g.insight += n; t.insight += n;
        break;
      }
      case 'wood': {
        const n = 8 + g.ring * 12;
        g.res.wood += n; t.wood += n;
        break;
      }
      case 'coin': {
        const n = Math.round(55 * (1 + g.day * 0.06) * (1 + g.ring * 0.5) * SW.boost.get(g, 'listen') * SW.boost.get(g, 'coin'));
        g.res.coin += n; t.coin += n;
        break;
      }
      case 'mat': {
        const m = pick(matPool(g));
        g.mats[m] = (g.mats[m] | 0) + 1;
        t.mats[m] = (t.mats[m] | 0) + 1;
        break;
      }
    }
  }

  /* Awarding a caught node, split out so the headless harness can drive the
   * mini-game without going through pixel coordinates. */
  function hitListenNode(g, n) {
    collect(g, n);
    n.t = Math.max(n.t, n.life - 0.35);
    const p = SW.render.featurePoint(n.ang, n.dist);
    g.fx.push({ at: 'point', x: p.x, y: p.y, text: '✦', tone: 'good', life: 0.9, t: 0 });
  }

  /* Called with scene coordinates from the canvas click handler. */
  function hitListen(g, wx, wy) {
    const L = g.listen;
    if (!L) return false;
    for (const n of L.nodes) {
      if (n.hit) continue;
      const p = SW.render.featurePoint(n.ang, n.dist);
      if (Math.hypot(wx - p.x, wy - p.y) <= 30) {
        n.hit = true;
        L.hits++;
        hitListenNode(g, n);
        return true;
      }
    }
    return false;
  }

  function finishListen(g) {
    const L = g.listen;
    g.listen = null;
    g.listenAt = g.tick;
    const t = L.take;
    const bits = [];
    if (t.insight) bits.push(`${t.insight} insight`);
    if (t.coin) bits.push(`${fmt(t.coin)} coin`);
    if (t.wood) bits.push(`${t.wood} wood`);
    for (const m in t.mats) bits.push(`${t.mats[m]} ${C.MATERIALS[m].name.toLowerCase()}`);
    if (!bits.length) {
      SW.ui.log(g, 'You listened, and heard nothing you could catch.', 'warn');
    } else {
      SW.ui.log(g, `${L.hits} of ${L.spawned} answered: ${bits.join(', ')}.`, 'great');
    }
  }

  // ----------------------------------------------------------------- bench
  function benchUnlocked(g) { return !!g.neurons.bench; }

  const pairKey = (a, b) => [a, b].sort().join('+');

  function recipeFor(a, b) {
    const k = pairKey(a, b);
    return C.RECIPES.find(r => pairKey(r.a, r.b) === k) || null;
  }

  function craftValue(g, r) {
    return Math.round(r.coin * D.mods.craft(g));
  }

  /* Combine two materials. Consumes one of each either way — a dead end still
   * costs you, but the first time you find one it is worth an insight. */
  const CRAFT_FOCUS = 3;

  function combine(g, a, b) {
    if (!benchUnlocked(g)) return false;
    const need = a === b ? 2 : 1;
    if ((g.mats[a] | 0) < need || (g.mats[b] | 0) < (a === b ? 0 : 1)) {
      SW.ui.log(g, 'You do not have both of those.', 'warn');
      return false;
    }
    // Bench work is your own labour, and it competes with the farm for it.
    if (g.res.focus < CRAFT_FOCUS) { SW.ui.log(g, 'Not enough focus to work the bench.', 'warn'); return false; }
    g.res.focus -= CRAFT_FOCUS;
    g.mats[a] -= need;
    if (a !== b) g.mats[b] -= 1;

    const r = recipeFor(a, b);
    if (!r) {
      const k = pairKey(a, b);
      if (!g.deadEnds[k]) {
        g.deadEnds[k] = g.day;
        g.insight += 1;
        SW.ui.log(g, `${C.MATERIALS[a].name} and ${C.MATERIALS[b].name} make nothing at all. Now you know. +1 insight.`, 'warn');
      } else {
        SW.ui.log(g, 'Nothing, again. You knew that.', 'warn');
      }
      return false;
    }

    const value = craftValue(g, r);
    g.res.coin += value;
    g.stats.coinEarned += value;
    g.crafted[r.id] = (g.crafted[r.id] | 0) + 1;
    if (r.wood) g.res.wood += r.wood;
    if (r.faith) g.village.faith = clamp(g.village.faith + r.faith, 0, 100);

    if (!g.recipes[r.id]) {
      g.recipes[r.id] = g.day;
      const ins = Math.max(1, Math.round(r.insight * D.insightMul(g)));
      g.insight += ins;
      // The hardest pairings turn up something older than the materials.
      if (r.coin >= 1400 && chance(0.28)) SW.relics.grant(g);
      SW.ui.log(g, `${r.glyph} ${r.name}. You had not made one before. +${ins} insight, +${fmt(value)} coin.`, 'great');
      g.fx.push({ at: 'banner', text: r.glyph + ' ' + r.name, life: 3.5, t: 0 });
    } else {
      SW.ui.log(g, `${r.glyph} ${r.name} — sold for ${fmt(value)} coin.`, 'good');
    }
    return true;
  }

  function buyMaterial(g, id, n) {
    const m = C.MATERIALS[id];
    if (!m || !m.buy) { SW.ui.log(g, 'Nobody sells that. You have to find it.', 'warn'); return 0; }
    const afford = Math.min(n, Math.floor(g.res.coin / m.buy));
    if (afford <= 0) { SW.ui.log(g, 'Not enough coin.', 'warn'); return 0; }
    g.res.coin -= m.buy * afford;
    g.mats[id] = (g.mats[id] | 0) + afford;
    return afford;
  }

  function matCount(g) {
    let n = 0;
    for (const k in g.mats) n += g.mats[k] | 0;
    return n;
  }

  SW.minigames = {
    LISTEN_FOCUS, LISTEN_DUR, CRAFT_FOCUS, listenUnlocked, listenReady, listenCooldown,
    startListen, tick, hitListen, hitListenNode, listenReady, benchUnlocked, recipeFor, craftValue,
    combine, buyMaterial, matCount, pairKey
  };
})(window.SW = window.SW || {});
