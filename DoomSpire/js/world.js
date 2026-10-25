/* DoomSpire — the living zone: collision, mob/node spawns and their
 * respawn timers, and every kind of interaction (vendor, quest giver,
 * trainer, gathering node, portal, zone exit).
 *
 * Zone content in content.js is the blueprint; a "zone runtime" built here
 * is the actual instance of it for this session — who's alive, what's been
 * picked clean, what's on cooldown to come back. It is not saved: like
 * PrimalIsle's island, it is cheap to rebuild and only the character
 * persists.
 */
(function (DS) {
  'use strict';
  const C = DS.core;
  const K = DS.content;

  function blocked(zoneId, x, y) {
    const zone = K.ZONES[zoneId];
    const g = zone.grid, r = 0.22;
    const pts = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
    for (const [px, py] of pts) {
      const cx = Math.floor(px), cy = Math.floor(py);
      if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h || g.cells[cy][cx] !== 0) return true;
    }
    return false;
  }

  function scatterPoint(zone, cx, cy, radius, rng) {
    rng = rng || Math.random;
    for (let i = 0; i < 24; i++) {
      const a = rng() * Math.PI * 2, r = rng() * radius;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!blocked(zone.id, x, y)) return { x, y };
    }
    return { x: cx, y: cy };
  }

  function buildZoneRuntime(zoneId) {
    const zone = K.ZONES[zoneId];
    const mobs = [];
    zone.mobs.forEach(def => {
      for (let i = 0; i < def.n; i++) {
        const p = scatterPoint(zone, def.x, def.y, def.radius);
        const m = DS.ai.spawnMob(def.tpl, p.x, p.y, { radius: def.radius });
        m.spawnDef = def;
        m.respawnDelay = def.elite ? (m.boss ? 999999 : 90) : 38;
        mobs.push(m);
      }
    });
    const nodes = zone.nodes.map(n => Object.assign({}, n, { harvested: false, respawnAt: 0 }));
    const npcs = zone.npcs.map(n => Object.assign({}, n));
    return { zoneId, mobs, nodes, npcs, floatText: [] };
  }

  function tickRespawns(rt, dt) {
    const zone = K.ZONES[rt.zoneId];
    for (let i = 0; i < rt.mobs.length; i++) {
      const m = rt.mobs[i];
      if (m.alive) continue;
      m.respawning = (m.respawning == null ? m.respawnDelay : m.respawning) - dt;
      if (m.respawning <= 0 && isFinite(m.respawnDelay)) {
        const p = scatterPoint(zone, m.spawnDef.x, m.spawnDef.y, m.spawnDef.radius);
        const fresh = DS.ai.spawnMob(m.tplId, p.x, p.y, { radius: m.spawnDef.radius });
        fresh.spawnDef = m.spawnDef; fresh.respawnDelay = m.respawnDelay;
        rt.mobs[i] = fresh;
      }
    }
    rt.nodes.forEach(n => {
      if (!n.harvested) return;
      n.respawnAt -= dt;
      if (n.respawnAt <= 0) n.harvested = false;
    });
  }

  // --- interaction discovery ------------------------------------------------
  const INTERACT_RANGE = 2.4;
  function nearbyInteractable(player, rt) {
    const zone = K.ZONES[rt.zoneId];
    let best = null, bestD = INTERACT_RANGE;
    rt.npcs.forEach(n => {
      if (n.kind === 'companion' && player.companions[n.companion] && player.companions[n.companion].recruited) return;
      const d = C.dist(player.x, player.y, n.x, n.y);
      if (d < bestD) { bestD = d; best = { kind: 'npc', ref: n }; }
    });
    rt.nodes.forEach(n => {
      if (n.harvested) return;
      const d = C.dist(player.x, player.y, n.x, n.y);
      if (d < bestD) { bestD = d; best = { kind: 'node', ref: n }; }
    });
    (zone.exits || []).forEach(e => {
      const d = C.dist(player.x, player.y, e.x, e.y);
      if (d < e.r) { bestD = 0; best = { kind: 'exit', ref: e }; }
    });
    if (zone.portal) {
      const d = C.dist(player.x, player.y, zone.portal.x, zone.portal.y);
      if (d < INTERACT_RANGE) { best = best && best.kind === 'exit' ? best : { kind: 'portal', ref: zone.portal }; }
    }
    return best;
  }

  function checkAutoTransition(player, rt) {
    const zone = K.ZONES[rt.zoneId];
    for (const e of (zone.exits || [])) {
      if (C.dist(player.x, player.y, e.x, e.y) < e.r) return { toZone: e.toZone, toX: e.toX, toY: e.toY, toFacing: e.toFacing };
    }
    return null;
  }

  // --- gathering -------------------------------------------------------------
  function gatherNode(player, node) {
    const prof = K.GATHER_PROFESSIONS[node.kind];
    if (!player.professions.learned.includes(prof.id)) return { ok: false, msg: `You haven't learned ${prof.name}.` };
    if (node.harvested) return { ok: false, msg: 'Already picked clean.' };
    const mat = prof.mats[node.tier];
    const count = C.rndInt(1, 3);
    for (let i = 0; i < count; i++) DS.player.addItem(player, matItem(mat));
    const gain = DS.player.gatherSkillUp(player, prof.id, node.tier);
    node.harvested = true; node.respawnAt = 75;
    return { ok: true, msg: `Gathered ${count}x ${matName(mat)}${gain ? ` (+${gain} ${prof.name})` : ''}.` };
  }
  const MAT_NAMES = {
    copper_ore: 'Copper Ore', iron_ore: 'Iron Ore', mithril_ore: 'Mithril Ore',
    silverleaf: 'Silverleaf', briarroot: 'Briarroot', frostbloom: 'Frostbloom', dust: 'Arcane Dust'
  };
  function matName(id) { return MAT_NAMES[id] || id; }
  function matItem(id) {
    return { iid: 'mat_' + id + '_' + Math.floor(Math.random() * 1e9).toString(36), name: matName(id), slot: null, quality: 'common', tplId: id, matId: id, stats: {}, sell: 1 };
  }

  // --- crafting ----------------------------------------------------------
  function matCount(player, matId) { return player.bags.filter(b => b.matId === matId).length; }
  function canCraft(player, profId, recipe) {
    const skill = player.professions.skill[profId] || 0;
    if (skill < recipe.skillReq) return false;
    return Object.entries(recipe.mats).every(([m, n]) => matCount(player, m) >= n);
  }
  function craft(player, profId, recipe, rng) {
    if (!canCraft(player, profId, recipe)) return { ok: false, msg: 'Missing materials or skill.' };
    Object.entries(recipe.mats).forEach(([m, n]) => {
      let left = n;
      player.bags = player.bags.filter(b => { if (left > 0 && b.matId === m) { left--; return false; } return true; });
    });
    let result;
    if (recipe.result.potion) {
      result = { iid: 'pot_' + Math.floor(Math.random() * 1e9).toString(36), name: recipe.name, slot: null, quality: 'common', potion: recipe.result.potion, power: recipe.result.power, stats: {}, sell: 3 };
    } else if (recipe.result.enchant) {
      result = { iid: 'ench_' + Math.floor(Math.random() * 1e9).toString(36), name: recipe.name, slot: null, quality: 'uncommon', enchant: recipe.result.enchant, stats: {}, sell: 5 };
    } else {
      result = K.rollItem(rng || Math.random, recipe.result.ilvl, recipe.result.slot, recipe.result.quality, recipe.result.styleHint);
      result.name = recipe.name;
    }
    if (!DS.player.addItem(player, result)) return { ok: false, msg: 'Bags are full.' };
    const cur = player.professions.skill[profId] || 0;
    const cap = recipe.skillReq + 75;
    if (cur < cap) player.professions.skill[profId] = Math.min(300, cur + C.rndInt(1, 3));
    return { ok: true, msg: `Crafted ${recipe.name}.`, item: result };
  }

  // --- vendors -------------------------------------------------------------
  function repTierIndex(player, factionId) {
    const rep = player.rep[factionId] || 0;
    const tier = K.repTier(rep);
    return K.FACTION_TIERS.findIndex(t => t.name === tier.name);
  }
  function vendorStock(npc, player) {
    const v = K.VENDORS[npc.vendor];
    if (!v.__stock) {
      const rng = C.rngFrom(1337 + npc.vendor.length * 97);
      v.__stock = v.fixed.map(id => Object.assign({}, K.CURATED_ITEMS[id]))
        .concat(v.generated.map(g => K.rollItem(rng, g.ilvl, g.slot, g.quality)));
    }
    const gated = (v.repGated || []).filter(g => {
      const need = K.FACTION_TIERS.findIndex(t => t.name === g.tier);
      return repTierIndex(player, v.repFaction) >= need;
    }).map(g => { if (!g.__item) g.__item = K.rollItem(Math.random, g.ilvl, g.slot, g.quality); return g.__item; });
    return v.__stock.concat(gated);
  }
  function buyItem(player, npc, item) {
    const price = Math.max(1, Math.round((item.sell || 1) * 3.2));
    if (player.gold < price) return { ok: false, msg: 'Not enough gold.' };
    if (!DS.player.addItem(player, Object.assign({}, item, { iid: item.iid + '_' + Math.floor(Math.random() * 1e6) }))) return { ok: false, msg: 'Bags are full.' };
    player.gold -= price;
    return { ok: true, msg: `Bought ${item.name}.` };
  }
  function sellItem(player, iid) {
    const item = player.bags.find(b => b.iid === iid);
    if (!item) return { ok: false };
    DS.player.removeItem(player, iid);
    const price = Math.max(1, item.sell || 1);
    player.gold += price;
    return { ok: true, msg: `Sold ${item.name} for ${price}g.` };
  }

  // --- quests at an npc -----------------------------------------------------
  function questsOffered(player, npcId) {
    return Object.values(K.QUESTS).filter(q => q.giver === npcId && DS.player.questAvailable(player, q.id));
  }
  function questsToTurnIn(player, npcId) {
    return Object.values(K.QUESTS).filter(q => q.turnin === npcId && player.quests.active[q.id] && DS.player.questReadyToTurnIn(player, q.id));
  }
  function questsInProgress(player, npcId) {
    return Object.values(K.QUESTS).filter(q => q.turnin === npcId && player.quests.active[q.id] && !DS.player.questReadyToTurnIn(player, q.id));
  }

  function enterPortal(player) {
    const zone = K.ZONES[player.zone];
    if (!zone.portal) return { ok: false, msg: 'Nothing here.' };
    if (zone.portal.requiresFlag && !player.flags[zone.portal.requiresFlag]) return { ok: false, msg: 'The vault is sealed. Something out here must be holding the key.' };
    return { ok: true, toZone: zone.portal.toZone, toX: zone.portal.toX, toY: zone.portal.toY, toFacing: zone.portal.toFacing };
  }

  function respecCost(player) { return player.level * 5; }
  function respec(player) {
    const cost = respecCost(player);
    if (player.gold < cost) return { ok: false, msg: 'Not enough gold.' };
    player.gold -= cost;
    DS.player.resetTalents(player);
    return { ok: true, msg: 'Talents reset.' };
  }

  DS.world = {
    blocked, buildZoneRuntime, tickRespawns, nearbyInteractable, checkAutoTransition,
    gatherNode, matName, canCraft, craft, matCount,
    vendorStock, buyItem, sellItem, repTierIndex, enterPortal,
    questsOffered, questsToTurnIn, questsInProgress, respec, respecCost
  };
})(window.DS = window.DS || {});
