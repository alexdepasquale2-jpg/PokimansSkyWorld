/* Coremind — 4X-style individual orders.
 *
 * Colony directives are the macro. This is the micro: a selected organism
 * (or group) can be told to walk somewhere, hit something, hold ground, or
 * garrison a chamber. The simulation still owns movement and combat; this
 * file only records intent and turns a tap into an order.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const KINDS = ['MOVE', 'ATTACK', 'ATTACK_MOVE', 'HOLD', 'GARRISON', 'PATROL', 'RETREAT', 'STOP'];

  function selectedIds(game) {
    if (game.selectedIds && game.selectedIds.length) return game.selectedIds.slice();
    return game.selection ? [game.selection] : [];
  }

  function selectedOrgs(game) {
    return selectedIds(game).map(id => game.byId[id]).filter(o => o && o.alive);
  }

  function selectedPlayerOrgs(game) {
    return selectedOrgs(game).filter(o => o.ownerId === 'player');
  }

  function formationOffset(i, n) {
    if (n < 2) return { x: 0, y: 0 };
    const cols = Math.ceil(Math.sqrt(n));
    const gx = (i % cols) - (cols - 1) / 2;
    const gy = Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2;
    return { x: gx * 1.45, y: gy * 1.45 };
  }

  function issue(game, orgs, order) {
    if (!orgs || !orgs.length) return 0;
    const spread = (order.type === 'MOVE' || order.type === 'ATTACK_MOVE') && orgs.length > 1 && order.x != null;
    let n = 0, slot = 0;
    for (const org of orgs) {
      if (!org || !org.alive) continue;
      if (order.type === 'STOP') {
        org.order = null;
        org.actionTarget = null;
        n++;
        continue;
      }
      const off = spread ? formationOffset(slot, orgs.length) : { x: 0, y: 0 };
      slot++;
      org.order = {
        type: order.type,
        x: order.x != null ? order.x + off.x : order.x,
        y: order.y != null ? order.y + off.y : order.y,
        depth: order.depth != null ? order.depth : (org.depth || 0),
        x2: order.x2, y2: order.y2,
        refId: order.ref ? order.ref.id : null,
        refKind: order.refKind || (order.ref && order.ref.health != null ? 'org' : (order.ref ? 'site' : null)),
        engage: order.type === 'ATTACK_MOVE' || !!order.engage,
        queue: order.queue ? order.queue.slice() : null
      };
      org._orderRef = order.ref || null;
      org.aiCounter = 0;
      n++;
    }
    if (n && CM.mind && CM.mind.pulse) CM.mind.pulse(game);
    if (n && CM.economy) CM.economy.onOrder(game);
    return n;
  }

  function resolveRef(game, org) {
    const order = org.order;
    if (!order) return null;
    if (org._orderRef && (org._orderRef.alive !== false || org._orderRef.workNeeded != null)) {
      if (org._orderRef.alive === false) return null;
      return org._orderRef;
    }
    if (!order.refId) return null;
    if (order.refKind === 'org') {
      const o = game.byId[order.refId];
      org._orderRef = o && o.alive ? o : null;
      return org._orderRef;
    }
    const site = CM.structures.all(game).find(s => s.id === order.refId);
    org._orderRef = site || null;
    return site;
  }

  function clear(game, orgs) { return issue(game, orgs, { type: 'STOP' }); }

  /* Returns true when the tap was consumed as an order, so the caller should
   * not also treat it as select / inspect / deselect. */
  function handleTap(game, payload) {
    if (game.buildMode) return false;
    const group = selectedPlayerOrgs(game);
    if (!group.length) return false;

    const mode = game.commandMode || 'MOVE';
    const queued = game.queueOrders || mode === 'QUEUE' || game._shiftQueue;

    if (mode === 'RETREAT') {
      retreat(game, group);
      game.commandMode = null;
      return true;
    }

    if (payload.kind === 'org') {
      const org = payload.org;
      if (org.ownerId === 'player') {
        if (game.addSelect) {
          CM.coremind.selectOrganism(game, org.id, true);
          return true;
        }
        return false; // ordinary re-select
      }
      issue(game, group, { type: 'ATTACK', x: org.x, y: org.y, depth: org.depth || 0, ref: org, refKind: 'org' });
      game.commandMode = null;
      return true;
    }

    if (payload.kind === 'site') {
      const site = payload.site;
      const garrison = site.colonyId === 'player' || site.controlled === false || mode === 'GARRISON';
      if (garrison) {
        issue(game, group, { type: 'GARRISON', x: site.x, y: site.y, depth: site.depth, ref: site, refKind: 'site' });
      } else {
        issue(game, group, { type: 'MOVE', x: site.x, y: site.y, depth: site.depth });
      }
      game.commandMode = null;
      return true;
    }

    if (payload.kind === 'empty' || payload.kind === 'core') {
      if (mode === 'HOLD') {
        issue(game, group, { type: 'HOLD', x: group[0].x, y: group[0].y, depth: group[0].depth || 0 });
        game.commandMode = null;
        return true;
      }
      const world = payload.world;
      if (!world) return false;
      if (mode === 'PATROL') {
        issue(game, group, {
          type: 'PATROL',
          x: world.x, y: world.y, depth: game.viewDepth || 0,
          x2: group[0].x, y2: group[0].y
        });
        game.commandMode = null;
        return true;
      }
      if (queued) {
        appendWaypoint(group, world.x, world.y, game.viewDepth || 0,
          mode === 'ATTACK' || mode === 'ATTACK_MOVE', game);
        return true;
      }
      issue(game, group, {
        type: mode === 'ATTACK' || mode === 'ATTACK_MOVE' ? 'ATTACK_MOVE' : 'MOVE',
        x: world.x, y: world.y,
        depth: game.viewDepth || 0
      });
      game.commandMode = null;
      return true;
    }
    return false;
  }

  function appendWaypoint(orgs, x, y, depth, engage, game) {
    let n = 0;
    for (const org of orgs) {
      if (!org || !org.alive) continue;
      if (!org.order || org.order.x == null) {
        org.order = { type: engage ? 'ATTACK_MOVE' : 'MOVE', x, y, depth, engage: !!engage, queue: [] };
      } else {
        if (!org.order.queue) org.order.queue = [];
        org.order.queue.push({ x, y, depth });
      }
      n++;
    }
    if (n && game && CM.mind && CM.mind.pulse) CM.mind.pulse(game);
    return n;
  }

  function retreat(game, orgs) {
    const group = orgs || selectedPlayerOrgs(game);
    let n = 0;
    for (const org of group) {
      if (!org || !org.alive) continue;
      const home = game.coloniesById[org.ownerId];
      const d = org.depth || 0;
      let dest = null;
      if (home && home.layerRally && home.layerRally[d]) dest = home.layerRally[d];
      const den = CM.structures.findShelter(game, org.ownerId, org.x, org.y, 80);
      if (den) dest = dest || den;
      if (!dest) {
        const shaft = CM.structures.all(game).find(s => s.done && s.colonyId === org.ownerId && s.type === 'SHAFT');
        if (shaft) dest = shaft;
      }
      if (!dest && home) dest = { x: home.x, y: home.y, depth: 0 };
      if (!dest) continue;
      issue(game, [org], {
        type: den && dest === den ? 'GARRISON' : 'MOVE',
        x: dest.x, y: dest.y,
        depth: dest.depth != null ? dest.depth : d,
        ref: den && dest === den ? den : null,
        refKind: den && dest === den ? 'site' : null
      });
      n++;
    }
    return n;
  }

  function setMode(game, mode) {
    if (mode === 'STOP') {
      clear(game, selectedPlayerOrgs(game));
      game.commandMode = null;
      if (CM.mind && CM.mind.pulse) CM.mind.pulse(game);
      return;
    }
    if (mode === 'HOLD') {
      const group = selectedPlayerOrgs(game);
      issue(game, group, { type: 'HOLD', x: 0, y: 0, depth: 0 });
      game.commandMode = null;
      return;
    }
    if (mode === 'RETREAT') {
      retreat(game, selectedPlayerOrgs(game));
      game.commandMode = null;
      return;
    }
    if (mode === 'QUEUE') {
      game.queueOrders = !game.queueOrders;
      return;
    }
    game.commandMode = game.commandMode === mode ? null : mode;
    if (game.commandMode && CM.mind && CM.mind.pulse) CM.mind.pulse(game);
  }

  function selectInBox(game, x0, y0, x1, y1, depth) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const view = depth != null ? depth : (game.viewDepth || 0);
    const fogOn = game.senseSight !== false;
    const hits = [];
    for (const org of game.organisms) {
      if (!org.alive || org.ownerId !== 'player') continue;
      if ((org.depth || 0) !== view) continue;
      if (org.x < minX || org.x > maxX || org.y < minY || org.y > maxY) continue;
      if (fogOn && CM.sense && !CM.sense.lit(game, org.x, org.y, org.depth || 0)) continue;
      hits.push(org);
    }
    if (!hits.length) return 0;
    CM.coremind.selectOrganism(game, hits[0].id, false);
    for (let i = 1; i < hits.length; i++) CM.coremind.selectOrganism(game, hits[i].id, true);
    return hits.length;
  }

  function selectNearby(game, seed, radius) {
    if (!seed || seed.ownerId !== 'player') return 0;
    const r = radius || 10;
    const view = seed.depth || 0;
    const hits = game.organisms.filter(o =>
      o.alive && o.ownerId === 'player' && (o.depth || 0) === view && K.dist(o.x, o.y, seed.x, seed.y) <= r);
    if (!hits.length) return 0;
    CM.coremind.selectOrganism(game, hits[0].id, false);
    for (let i = 1; i < hits.length; i++) CM.coremind.selectOrganism(game, hits[i].id, true);
    return hits.length;
  }

  function selectAllOnLayer(game) {
    const view = game.viewDepth || 0;
    const hits = game.organisms.filter(o => o.alive && o.ownerId === 'player' && (o.depth || 0) === view);
    if (!hits.length) return 0;
    CM.coremind.selectOrganism(game, hits[0].id, false);
    for (let i = 1; i < hits.length; i++) CM.coremind.selectOrganism(game, hits[i].id, true);
    return hits.length;
  }

  function assignGroup(game, slot) {
    if (!game.controlGroups) game.controlGroups = { 1: [], 2: [], 3: [], 4: [] };
    game.controlGroups[slot] = selectedPlayerOrgs(game).map(o => o.id);
    return game.controlGroups[slot].length;
  }

  function recallGroup(game, slot) {
    const ids = (game.controlGroups && game.controlGroups[slot]) || [];
    const live = ids.map(id => game.byId[id]).filter(o => o && o.alive && o.ownerId === 'player');
    if (!live.length) return 0;
    CM.coremind.selectOrganism(game, live[0].id, false);
    for (let i = 1; i < live.length; i++) CM.coremind.selectOrganism(game, live[i].id, true);
    return live.length;
  }

  function label(order) {
    if (!order) return null;
    if (order.type === 'MOVE') return 'Moving';
    if (order.type === 'ATTACK_MOVE') return 'Attack-moving';
    if (order.type === 'ATTACK') return 'Attacking';
    if (order.type === 'HOLD') return 'Holding';
    if (order.type === 'GARRISON') return 'Garrisoning';
    if (order.type === 'PATROL') return 'Patrolling';
    if (order.type === 'RETREAT') return 'Retreating';
    if (order.queue && order.queue.length) return (order.type === 'ATTACK_MOVE' ? 'Attack-moving' : 'Moving') + ' · ' + (order.queue.length + 1);
    return order.type;
  }

  CM.orders = {
    KINDS, selectedIds, selectedOrgs, selectedPlayerOrgs,
    issue, clear, resolveRef, handleTap, setMode, label,
    selectInBox, selectNearby, selectAllOnLayer, assignGroup, recallGroup, formationOffset,
    appendWaypoint, retreat
  };
})(window.CM = window.CM || {});
