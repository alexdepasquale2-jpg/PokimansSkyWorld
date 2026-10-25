/* Coremind — reputation network. Standing between Cores was a scalar.
 * This is a directed graph: colonies remember colonies, and they remember
 * species. Overhunt a grazer and the herd learns your smell.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  function key(fromId, toId) { return fromId + '>' + toId; }
  function speciesNode(speciesId) { return 'wild:' + speciesId; }

  function ensure(game) {
    if (!game.rep) game.rep = { edges: {} };
    return game.rep;
  }

  function edge(game, fromId, toId) {
    const rep = ensure(game);
    const k = key(fromId, toId);
    if (!rep.edges[k]) rep.edges[k] = { favor: 0, n: 0, last: 0, kind: null };
    return rep.edges[k];
  }

  function of(game, fromId, toId) {
    if (!game || !game.rep || !fromId || !toId || fromId === toId) return 0;
    const e = game.rep.edges[key(fromId, toId)];
    return e ? e.favor : 0;
  }

  function touch(game, fromId, toId, delta, kind) {
    if (!game || !fromId || !toId || fromId === toId) return 0;
    const e = edge(game, fromId, toId);
    e.favor = K.clamp(e.favor + delta, -1, 1);
    e.n += 1;
    e.last = game.simTime || 0;
    e.kind = kind || e.kind;
    return e.favor;
  }

  function labelOf(game, id) {
    if (!id) return '?';
    if (id.indexOf('wild:') === 0) {
      const sp = CM.traits && CM.traits.WILD_BY_ID[id.slice(5)];
      return sp ? sp.name : id.slice(5);
    }
    const c = game.coloniesById && game.coloniesById[id];
    return c ? c.name : id;
  }

  function colorOf(game, id) {
    if (id.indexOf('wild:') === 0) return '#8aa3ab';
    const c = game.coloniesById && game.coloniesById[id];
    return c ? c.color : '#8899aa';
  }

  /* Prey that you have butchered too often leave earlier. */
  function speciesBias(game, hunter, prey) {
    if (!hunter || !prey || prey.ownerId !== 'wild' || !prey.speciesId) return 1;
    const fav = of(game, hunter.ownerId, speciesNode(prey.speciesId));
    if (fav >= -0.15) return 1;
    return 1 + Math.min(0.85, (-0.15 - fav) * 1.6);
  }

  function onKill(game, killer, victim) {
    if (!killer || !victim) return;
    if (victim.ownerId === 'wild' && victim.speciesId) {
      const sn = speciesNode(victim.speciesId);
      touch(game, killer.ownerId, sn, -0.08, 'kill');
      if (of(game, killer.ownerId, sn) < -0.4 && CM.aura) {
        const x = victim.x != null ? victim.x : killer.x;
        const y = victim.y != null ? victim.y : killer.y;
        const d = victim.depth != null ? victim.depth : (killer.depth || 0);
        if (x != null && y != null) CM.aura.stamp(game, d || 0, x, y, 'dread', 0.6, 3);
      }
    } else if (victim.ownerId && victim.ownerId !== 'wild') {
      touch(game, victim.ownerId, killer.ownerId, -0.12, 'kill');
      touch(game, killer.ownerId, victim.ownerId, -0.05, 'kill');
    }
  }

  /* Graph first: a cold edge is open hostility, a warm one keeps the peace.
   * No edge (or a mild one) falls back to colonial standing. */
  function areHostile(game, aId, bId) {
    if (!aId || !bId || aId === bId) return false;
    if (aId === 'wild' || bId === 'wild') return false;
    const ab = of(game, aId, bId);
    const ba = of(game, bId, aId);
    if (ab < -0.15 || ba < -0.15) return true;
    if (ab > 0.25 || ba > 0.25) return false;
    if (CM.colony && CM.colony.standingBetween) {
      const at = CM.colony.HOSTILE_AT != null ? CM.colony.HOSTILE_AT : -0.55;
      return CM.colony.standingBetween(game, aId, bId) <= at
          || CM.colony.standingBetween(game, bId, aId) <= at;
    }
    return false;
  }

  function onSight(game, watcher, speciesId) {
    if (!watcher || !speciesId) return;
    touch(game, watcher.ownerId || 'player', speciesNode(speciesId), 0.02, 'sight');
  }

  function onExtract(game, speciesId) {
    if (!speciesId) return;
    touch(game, 'player', speciesNode(speciesId), -0.04, 'extract');
  }

  function tribute(game, fromId, toId, amount) {
    const from = game.coloniesById[fromId], to = game.coloniesById[toId];
    if (!from || !to || !from.alive || !to.alive) return { ok: false, reason: 'No mind to receive it.' };
    const cost = amount != null ? amount : 8;
    if (from.biomass < cost) return { ok: false, reason: 'Not enough biomass to offer.' };
    from.biomass -= cost;
    to.biomass = Math.min(to.biomassCap, to.biomass + cost * 0.65);
    touch(game, fromId, toId, 0.18, 'gift');
    touch(game, toId, fromId, 0.18, 'gift');
    if (from.standing) from.standing[toId] = K.clamp((from.standing[toId] || 0) + 0.18, -1, 1);
    if (to.standing) to.standing[fromId] = K.clamp((to.standing[fromId] || 0) + 0.18, -1, 1);
    return { ok: true, cost };
  }

  function tickPeace(game, dt) {
    if (!game.organisms || !game.colonies) return;
    const player = game.organisms.filter(o => o.alive && o.ownerId === 'player');
    if (!player.length) return;
    for (const other of game.organisms) {
      if (!other.alive || other.ownerId === 'player' || other.ownerId === 'wild') continue;
      if (other.state === 'ATTACK') continue;
      for (const me of player) {
        if ((me.depth || 0) !== (other.depth || 0)) continue;
        if (me.state === 'ATTACK') continue;
        if (K.dist(me.x, me.y, other.x, other.y) > 7) continue;
        const e = edge(game, 'player', other.ownerId);
        if ((e.peaceAcc || 0) > 0.15) continue;
        const step = 0.002 * dt;
        e.peaceAcc = (e.peaceAcc || 0) + step;
        touch(game, 'player', other.ownerId, step, 'near');
        break;
      }
    }
  }

  function constellation(game) {
    const nodes = [];
    const seen = {};
    function add(id) {
      if (!id || seen[id]) return;
      seen[id] = true;
      nodes.push({ id, name: labelOf(game, id), color: colorOf(game, id) });
    }
    add('player');
    const edges = [];
    const bag = (game.rep && game.rep.edges) || {};
    const keys = Object.keys(bag);
    keys.sort((a, b) => Math.abs(bag[b].favor) - Math.abs(bag[a].favor));
    for (let i = 0; i < keys.length && edges.length < 14; i++) {
      const k = keys[i];
      const e = bag[k];
      if (Math.abs(e.favor) < 0.04 && e.n < 2) continue;
      const parts = k.split('>');
      add(parts[0]); add(parts[1]);
      edges.push({ from: parts[0], to: parts[1], favor: e.favor, n: e.n, kind: e.kind });
    }
    for (const c of (game.colonies || [])) if (c.alive) add(c.id);
    return { nodes, edges };
  }

  function serialize(game) {
    return game.rep ? { edges: game.rep.edges } : { edges: {} };
  }

  function hydrate(game, data) {
    game.rep = { edges: (data && data.edges) || {} };
  }

  CM.reputation = {
    ensure, of, touch, edge, speciesNode, speciesBias, areHostile,
    onKill, onSight, onExtract, tribute, tickPeace,
    constellation, labelOf, serialize, hydrate
  };
})(window.CM = window.CM || {});
