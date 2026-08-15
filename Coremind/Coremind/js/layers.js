/* Coremind — layer politics, spine travel, the Veil, Gate loss, fortification.
 *
 * Depth is a campaign, not a menu. The Gate at 9 is the lock on the whole
 * stack: lose it and the burrow stops being yours. The Veil at 10 is where
 * colonies actually meet. Fortifying the Layer-1 shaft is the last door
 * between a climber and the Core.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const FORTIFY_COST = { biomass: 80, energy: 60 };
  const FORT_HP = 220;
  const RECLAIM_SECS = 8;

  /* --- layer pacing ---------------------------------------------------------
   * Depth is a campaign beat, not a shopping list. Each stratum has to be
   * lived in — rooms cut, ground walked, a post left on the spine — before
   * the next cut opens. Hold time is real, but exploring and posting
   * defenders burn it down faster than standing still. */
  const DEFENSE_TYPES = { REDOUBT: 1, BASTION: 1, CITADEL: 1, KEEP: 1, WARREN: 1 };
  const PACE = {
    0: { hold: 48, rooms: 0, anyOf: null, requireDefend: false,
         hint: 'Forage, grow, and learn this ground. Then sink a shaft.' },
    1: { hold: 72, rooms: 2, anyOf: ['WARREN'], requireDefend: false,
         hint: 'Shelter first. Walk the works. Then the galleries will open.' },
    2: { hold: 80, rooms: 2, anyOf: ['NURSERY', 'FUNGARIUM'], requireDefend: false,
         hint: 'Breed or feed here so the stack can live without the weather.' },
    3: { hold: 84, rooms: 1, anyOf: ['GEOTHERMAL', 'VEINWORKS'], requireDefend: false,
         hint: 'Tap the heat or a vein. This is the first real engine.' },
    4: { hold: 88, rooms: 1, anyOf: ['SPOREWELL'], requireDefend: false,
         hint: 'A sporewell feeds whoever holds this march. Plant one. Hold it.' },
    5: { hold: 88, rooms: 1, anyOf: ['RESONATOR'], requireDefend: false,
         hint: 'Listen before you cut deeper. A resonator is the warning net.' },
    6: { hold: 96, rooms: 1, anyOf: ['BASTION'], requireDefend: true,
         hint: 'Fortify this layer. 7–9 are a hallway until a bastion stands.' },
    7: { hold: 96, rooms: 1, anyOf: ['HEARTH'], requireDefend: false,
         hint: 'Staff the hearth. Empty mantle is how a raid funds the climb.' },
    8: { hold: 100, rooms: 1, anyOf: ['CITADEL'], requireDefend: true,
         hint: 'The last private redoubt. Post a citadel before the Gate.' },
    9: { hold: 0, rooms: 0, anyOf: ['KEEP', 'MUSTER'], requireDefend: false,
         hint: 'The Gate is the lock. A keep or mustering hall is how you hold it.' }
  };
  const SURFACE_BIOMASS = 90;
  const SURFACE_POP = 5;
  const SPINE = {
    SHAFT: true, DESCENT: true, WELL: true, GALLERY: true, CLEFT: true,
    CHASM: true, MANTLE: true, ABYSS: true, GATE: true, NEXUS: true
  };
  const SPINE_ORDER = [null, 'SHAFT', 'DESCENT', 'WELL', 'GALLERY', 'CLEFT', 'CHASM', 'MANTLE', 'ABYSS', 'GATE'];

  const TRADEOFF = {
    1: {
      bonus: 'Shelter, groundwater, and the only climb back to the Core.',
      expand: 'Every new shaft is another door. Useful ground — and another place a climber can surface.',
      defend: 'Fortify the Access Shaft. Spends biomass and energy. Blocks ascent until the barrier is broken.'
    },
    2: {
      bonus: 'Nurseries, vaults, redoubts. The first layer that can live without the weather.',
      expand: 'Opens the research and breeding rooms. Also wakes gallery fauna.',
      defend: 'A redoubt here hardens every chamber in reach. Slow, expensive, holds the ladder.'
    },
    3: {
      bonus: 'Geothermal income and the first buried seams.',
      expand: 'The first real energy engine. Veins are finite and contested.',
      defend: 'Hold the Well or the income above it starves. Sanctum work starts here.'
    },
    4: {
      bonus: 'Dominating this layer feeds the Core (+0.35 biomass/s).',
      expand: 'Cuts the last tether to surface forage — and paints a target on this layer.',
      defend: 'Lose this and deeper rooms starve. Garrison the spine.'
    },
    5: {
      bonus: 'Resonators extend threat sense for anyone on this stratum.',
      expand: 'You see raids coming. So do they, if they take it from you.',
      defend: 'A held Cleft is an early-warning net. Empty, it is just a corridor.'
    },
    6: {
      bonus: 'Bastions multiply chamber hardness on this layer and the one above.',
      expand: 'The most expensive defensive rooms. Every one is a front you now have to staff.',
      defend: 'This is the layer you hold if you intend to keep 7–9.'
    },
    7: {
      bonus: 'Mantle hearths and deep seams. The late-game income layer.',
      expand: 'Huge payout, huge fauna pressure, and a long walk home if the Gate falls.',
      defend: 'Staff the Hearth. An empty 7 is how a raid funds itself on the way up.'
    },
    8: {
      bonus: 'A second seat. Completing a Crypt here survives a surface Core death.',
      expand: 'The last private redoubt before the Gate. Costly. Permanent, if you finish it.',
      defend: 'If 9 falls this layer falls with it. Do not hide here instead of holding the Gate.'
    },
    9: {
      bonus: 'The Gate. This is the lock on the entire burrow.',
      expand: 'Opening a Gate puts you on the Veil — and puts every other Gate in reach of you.',
      defend: 'Lose this chamber and you lose every level above it. Reclaim it, or fortify Layer 1 and start again.'
    },
    10: {
      bonus: 'The Veil. Shared ground. Every completed Gate is a door.',
      expand: 'Walk to a foreign Gate and climb their 9→1. Taking their Gate takes their burrow.',
      defend: 'There is nothing to build here. There is only presence — or someone else\'s.'
    }
  };

  function S() { return CM.structures; }

  function tradeoff(depth) { return TRADEOFF[depth] || null; }

  function layerCounts(game, depth) {
    const counts = {};
    for (const s of S().all(game)) {
      if (!s.done || s.depth !== depth || s.controlled === false) continue;
      if (s.type === 'NEXUS') continue;
      counts[s.colonyId] = (counts[s.colonyId] || 0) + 1;
    }
    return counts;
  }

  function dominantOf(game, depth) {
    const counts = layerCounts(game, depth);
    const scores = {};
    for (const id in counts) {
      scores[id] = CM.influence
        ? CM.influence.layerScore(game, id, depth)
        : counts[id];
    }
    let bestId = null, best = 0, second = 0;
    for (const id in scores) {
      const n = scores[id];
      if (n > best) { second = best; best = n; bestId = id; }
      else if (n > second) second = n;
    }
    if (!bestId || best < 1) return { colonyId: null, count: 0, contested: false, counts, scores };
    return { colonyId: bestId, count: counts[bestId] || 0, contested: second > 0 && second >= best * 0.72, counts, scores };
  }

  function dominates(game, colonyId, depth) {
    const d = dominantOf(game, depth);
    return d.colonyId === colonyId && !d.contested;
  }

  function hasType(game, colonyId, typeKey) {
    return S().all(game).some(s => s.done && s.controlled !== false && s.colonyId === colonyId && s.type === typeKey);
  }

  function hasGate(game, colonyId) { return hasType(game, colonyId, 'GATE'); }

  function spineAt(game, depth) { return SPINE_ORDER[depth] || null; }

  function isSpine(typeKey) { return !!SPINE[typeKey]; }

  /* A connector is a finished spine chamber that can change depth.
   * Shafts join 0↔1. A spine at D joins (D-1)↔D. A Nexus joins 10↔9. */
  function connectorPair(site) {
    if (!site || !site.done) return null;
    if (site.type === 'SHAFT') return { a: 0, b: 1 };
    if (site.type === 'NEXUS') return { a: 9, b: 10 };
    if (site.type === 'GATE') return { a: 9, b: 10 };
    if (SPINE[site.type] && site.depth >= 2 && site.depth <= 9) return { a: site.depth - 1, b: site.depth };
    return null;
  }

  function canUseConnector(game, org, site) {
    if (!site || site.done !== true) return false;
    if (site.controlled === false && site.type === 'GATE') {
      // An uncontrolled Gate is how you retake — anyone can stand on it.
      return true;
    }
    const owner = site.colonyId;
    if (org.ownerId === owner) return true;
    if (site.type === 'NEXUS') return true; // the Veil is shared
    // Foreign tunnels: only if this organism is already raiding that stack,
    // or that colony has already lost the burrow (the doors are open).
    const colony = game.coloniesById[owner];
    if (colony && colony.burrowLost) return true;
    if (org.raidColonyId && org.raidColonyId === owner) return true;
    if ((org.depth || 0) === 10 && site.type === 'GATE') return true;
    return false;
  }

  function nearestConnector(game, org, fromDepth, towardDepth) {
    let best = null, bestD = Infinity;
    const wantLower = towardDepth < fromDepth;
    for (const s of S().all(game)) {
      const pair = connectorPair(s);
      if (!pair) continue;
      if (pair.a !== fromDepth && pair.b !== fromDepth) continue;
      const other = pair.a === fromDepth ? pair.b : pair.a;
      // Prefer a step that reduces |depth - target|.
      const now = Math.abs(fromDepth - towardDepth);
      const next = Math.abs(other - towardDepth);
      if (next > now) continue;
      if (!canUseConnector(game, org, s)) continue;
      if (wantLower && s.type === 'SHAFT' && s.fortified && s.fortHp > 0 && org.ownerId !== s.colonyId && fromDepth === 1) {
        continue; // the barrier is up — find another shaft or break this one
      }
      const d = K.dist(org.x, org.y, s.x, s.y);
      if (d < bestD) { bestD = d; best = { site: s, toDepth: other, dist: d }; }
    }
    return best;
  }

  function nextWaypoint(game, org, destX, destY, destDepth) {
    const from = org.depth || 0;
    destDepth = destDepth || 0;
    if (from === destDepth) return { x: destX, y: destY, depth: destDepth, transfer: false, site: null };
    const step = nearestConnector(game, org, from, destDepth);
    if (!step) return null;
    return {
      x: step.site.x, y: step.site.y, depth: from,
      transfer: step.dist < 1.55,
      toDepth: step.toDepth,
      site: step.site
    };
  }

  function tryTransfer(game, org, toDepth, site) {
    if (!site) return false;
    if (site.type === 'SHAFT' && site.fortified && site.fortHp > 0
        && org.ownerId !== site.colonyId && (org.depth || 0) === 1 && toDepth === 0) {
      return false;
    }
    if (!canUseConnector(game, org, site)) return false;
    org.depth = toDepth;
    if (CM.mind && CM.mind.onDepthChange) CM.mind.onDepthChange(org);
    if (CM.life) CM.life.noteDepth(game, org);
    org.x = site.x + (Math.random() - 0.5) * 0.6;
    org.y = site.y + (Math.random() - 0.5) * 0.6;
    if (toDepth === 10 && site.type === 'GATE') {
      // Snap to this colony's Veil portal.
      const portal = S().all(game).find(s => s.type === 'NEXUS' && s.colonyId === site.colonyId && s.done);
      if (portal) { org.x = portal.x; org.y = portal.y; }
      org.raidColonyId = null;
    }
    if (toDepth === 9 && site.type === 'NEXUS') {
      const gate = S().all(game).find(s => s.type === 'GATE' && s.colonyId === site.colonyId && s.done);
      if (gate) { org.x = gate.x; org.y = gate.y; org.depth = 9; }
      if (site.colonyId !== org.ownerId) org.raidColonyId = site.colonyId;
    }
    if (toDepth === 9 && site.type === 'GATE' && site.colonyId !== org.ownerId) {
      org.raidColonyId = site.colonyId;
    }
    if (toDepth === 0) org.raidColonyId = null;
    return true;
  }

  function openNexus(game, bus, colony, gate) {
    if (!colony || !gate) return null;
    const existing = S().all(game).find(s => s.type === 'NEXUS' && s.colonyId === colony.id);
    if (existing) return existing;
    const site = {
      id: 'st_' + (game.structures.nextId++),
      colonyId: colony.id,
      type: 'NEXUS',
      x: gate.x, y: gate.y,
      depth: 10,
      work: 1, workNeeded: 1, done: true,
      integrity: 100,
      controlled: true,
      linkId: gate.id
    };
    game.structures.list.push(site);
    if (colony.isPlayer && bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'discovery', icon: '\u{1F52E}',
        message: 'The Gate opened. You are on the Veil. Other burrows are reachable from here.',
        x: site.x, y: site.y, structureId: site.id
      });
    }
    return site;
  }

  function loseBurrow(game, bus, colony) {
    if (!colony || colony.burrowLost) return;
    colony.burrowLost = true;
    for (const s of S().all(game)) {
      if (s.colonyId !== colony.id) continue;
      if (s.type === 'NEXUS') continue;
      s.controlled = false;
    }
    for (const org of game.organisms) {
      if (org.ownerId !== colony.id) continue;
      if ((org.depth || 0) >= 1) {
        org.depth = 0;
        org.raidColonyId = null;
        org.order = null;
        // Spill them around the Core rather than leaving them in rock.
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3;
        org.x = colony.x + Math.cos(a) * r;
        org.y = colony.y + Math.sin(a) * r;
      }
    }
    if (bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'warn', icon: '\u{1F6A8}',
        message: colony.isPlayer
          ? 'The Gate is gone. You have lost the burrow. Retake the Gate, fortify the shaft, or sink a new one.'
          : `${colony.name} has lost its Gate — their entire burrow is uncontrolled.`,
        x: colony.x, y: colony.y, colonyId: colony.id
      });
    }
  }

  function restoreBurrow(game, bus, colony) {
    if (!colony || !colony.burrowLost) return;
    colony.burrowLost = false;
    for (const s of S().all(game)) {
      if (s.colonyId !== colony.id) continue;
      s.controlled = true;
    }
    if (bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'discovery', icon: '\u{1F6E1}',
        message: colony.isPlayer
          ? 'Gate reclaimed. The burrow answers to you again.'
          : `${colony.name} has reclaimed its Gate.`,
        x: colony.x, y: colony.y, colonyId: colony.id
      });
    }
  }

  function canFortify(game, colony, site) {
    if (!site || site.type !== 'SHAFT' || !site.done) return { ok: false, reason: 'Only a finished Access Shaft can be fortified.' };
    if (site.colonyId !== colony.id) return { ok: false, reason: 'That shaft is not yours.' };
    if (site.fortified && site.fortHp > 0) return { ok: false, reason: 'The barrier is already standing.' };
    if (colony.biomass < FORTIFY_COST.biomass || colony.energy < FORTIFY_COST.energy) {
      return { ok: false, reason: `Needs ${FORTIFY_COST.biomass} biomass and ${FORTIFY_COST.energy} energy.` };
    }
    return { ok: true };
  }

  function fortify(game, bus, colony, site) {
    const check = canFortify(game, colony, site);
    if (!check.ok) return check;
    colony.biomass -= FORTIFY_COST.biomass;
    colony.energy -= FORTIFY_COST.energy;
    site.fortified = true;
    site.fortHp = FORT_HP;
    site.fortMax = FORT_HP;
    if (colony.isPlayer && bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'system', icon: '\u{1F6E1}',
        message: 'Shaft fortified. Climbers cannot reach the surface until the barrier is broken.',
        x: site.x, y: site.y, structureId: site.id
      });
    }
    return { ok: true };
  }

  function onCompleted(game, bus, site) {
    if (site.spine || SPINE[site.type]) {
      const colony = game.coloniesById[site.colonyId];
      if (colony && site.depth >= 1 && site.depth <= 9) {
        const rec = paceOf(colony, site.depth);
        if (rec.openedAt == null) rec.openedAt = game.simTime || 0;
      }
    }
    if (site.type === 'GATE') {
      const colony = game.coloniesById[site.colonyId];
      if (colony) {
        colony.burrowLost = false;
        colony.veilOpened = true;
        openNexus(game, bus, colony, site);
      }
    }
  }

  function onDestroyed(game, bus, site) {
    if (site.type === 'GATE') {
      const colony = game.coloniesById[site.colonyId];
      if (colony) loseBurrow(game, bus, colony);
    }
    if (site.type === 'NEXUS') {
      // Portal collapse does not by itself drop the Gate; the Gate rule is the one that matters.
    }
  }

  function hostilityAt(game, site) {
    const near = game.world.grid.queryRadius(site.x, site.y, 3.4, []);
    let friends = 0, foes = 0;
    for (const o of near) {
      if (!o.alive || (o.depth || 0) !== site.depth) continue;
      if (o.ownerId === site.colonyId) friends++;
      else if (o.ownerId !== 'wild') foes++;
    }
    return { friends, foes };
  }

  function paceOf(colony, depth) {
    if (!colony.pace) colony.pace = {};
    const key = String(depth);
    if (!colony.pace[key]) {
      colony.pace[key] = { openedAt: null, holdAcc: 0, scouted: false, settled: false, announced: false };
    }
    return colony.pace[key];
  }

  function layerRooms(game, colonyId, depth) {
    let rooms = 0, have = {};
    for (const s of S().all(game)) {
      if (!s.done || s.controlled === false || s.colonyId !== colonyId || s.depth !== depth) continue;
      have[s.type] = (have[s.type] || 0) + 1;
      if (!SPINE[s.type]) rooms++;
    }
    return { rooms, have };
  }

  function hasAny(have, keys) {
    if (!keys || !keys.length) return true;
    for (const k of keys) if (have[k]) return true;
    return false;
  }

  function postedOn(game, colonyId, depth) {
    for (const s of S().all(game)) {
      if (!s.done || s.controlled === false || s.colonyId !== colonyId || s.depth !== depth) continue;
      if (DEFENSE_TYPES[s.type] || SPINE[s.type]) {
        const h = hostilityAt(game, s);
        if (h.friends >= 2) return true;
      }
    }
    return false;
  }

  function spineSite(game, colonyId, depth) {
    const want = SPINE_ORDER[depth];
    if (!want) return null;
    return S().all(game).find(s => s.done && s.controlled !== false && s.colonyId === colonyId && s.type === want) || null;
  }

  /* A colony that already cut past a layer (saves, tests, planted spines)
   * is treated as having settled everything above that cut. */
  function retroSettle(game, colony) {
    if (!colony) return;
    const deepest = S().deepestOf(game, colony.id);
    for (let d = 1; d < deepest; d++) {
      const rec = paceOf(colony, d);
      rec.settled = true;
      rec.holdAcc = Math.max(rec.holdAcc, (PACE[d] && PACE[d].hold) || 0);
      if (rec.openedAt == null) rec.openedAt = game.simTime || 0;
    }
    if (deepest >= 1) {
      const rec = paceOf(colony, deepest);
      if (rec.openedAt == null) rec.openedAt = game.simTime || 0;
    }
  }

  /* Sightings before the guide started (or the first half-second) do not
   * count as "learn the ground" — world-gen proximity must not finish foothold. */
  function postStartKnown(game) {
    const cut = (game.guide && game.guide.startedAt) || 0.5;
    const events = (game.discovery && game.discovery.events) || [];
    const seen = Object.create(null);
    let n = 0;
    for (const e of events) {
      if (!e.speciesId || seen[e.speciesId]) continue;
      if ((e.time == null ? 0 : e.time) < cut) continue;
      seen[e.speciesId] = true;
      n++;
    }
    return n;
  }

  function surfaceReady(game, colony) {
    if (!colony) return { ok: false, reason: 'No Coremind.' };
    if (game.paceSkip) return { ok: true };
    if (!colony.isPlayer) return { ok: true };
    const spec = PACE[0];
    const pop = colony.pop || 0;
    const known = postStartKnown(game);
    const timeOk = (game.simTime || 0) >= spec.hold;
    const grown = pop >= SURFACE_POP;
    const stocked = colony.biomass >= SURFACE_BIOMASS;
    const learned = known >= 1 && (game.simTime || 0) >= spec.hold * 0.5;
    if (timeOk || grown || stocked || learned) return { ok: true };
    const remain = Math.max(0, Math.ceil(spec.hold - (game.simTime || 0)));
    return {
      ok: false,
      reason: `Walk the surface first — forage, grow, learn the ground (${remain}s, or ${SURFACE_POP} living, or a first discovery).`,
      checks: [
        { key: 'time', ok: timeOk, label: remain ? `Foothold ${remain}s` : 'Foothold ready' },
        { key: 'pop', ok: grown, label: `${pop}/${SURFACE_POP} living` },
        { key: 'stock', ok: stocked, label: 'Stores ready' },
        { key: 'learn', ok: known >= 1, label: known ? 'First discovery' : 'Observe the wild' }
      ]
    };
  }

  function layerReady(game, colony, depth) {
    if (depth <= 0) return surfaceReady(game, colony);
    if (!colony) return { ok: false, reason: 'No Coremind.' };
    if (game.paceSkip) return { ok: true };
    if (depth >= 9) return { ok: true };
    retroSettle(game, colony);
    const spec = PACE[depth] || PACE[1];
    const rec = paceOf(colony, depth);
    if (rec.settled) return { ok: true, settled: true };

    const spine = spineSite(game, colony.id, depth);
    if (!spine) {
      return { ok: false, reason: `Cut the ${SPINE_ORDER[depth] ? S().TYPES[SPINE_ORDER[depth]].name : 'spine'} first.`,
        checks: [{ key: 'spine', ok: false, label: 'Spine not cut' }] };
    }

    const { rooms, have } = layerRooms(game, colony.id, depth);
    const roleOk = hasAny(have, spec.anyOf);
    const defended = !!(spec.anyOf && spec.anyOf.some(k => DEFENSE_TYPES[k] && have[k]))
      || !!(have.REDOUBT || have.BASTION || have.CITADEL || have.KEEP)
      || postedOn(game, colony.id, depth);
    const roomsOk = rooms >= spec.rooms;
    const holdOk = rec.holdAcc >= spec.hold;
    const scoutOk = rec.scouted;
    const defendOk = !spec.requireDefend || defended;

    if (holdOk && roomsOk && roleOk && defendOk) {
      rec.settled = true;
      return { ok: true, settled: true };
    }

    const missing = [];
    if (!roomsOk) missing.push(`${rooms}/${spec.rooms} rooms`);
    if (!roleOk) missing.push((spec.anyOf || []).map(k => S().TYPES[k].name).join(' or '));
    if (!holdOk) missing.push('hold the layer');
    if (!defendOk) missing.push('post a defense');
    return {
      ok: false,
      reason: spec.hint + (missing.length ? ` Still need: ${missing.join(', ')}.` : ''),
      checks: [
        { key: 'rooms', ok: roomsOk, label: `${rooms}/${spec.rooms} rooms` },
        { key: 'role', ok: roleOk, label: roleOk ? 'Role chamber ready' : ((spec.anyOf || []).map(k => S().TYPES[k].name).join(' / ') || 'Role') },
        { key: 'hold', ok: holdOk, label: `Held ${Math.min(100, Math.round(100 * rec.holdAcc / Math.max(1, spec.hold)))}%`, frac: K.clamp01(rec.holdAcc / Math.max(1, spec.hold)) },
        { key: 'scout', ok: scoutOk, label: scoutOk ? 'Ground walked' : 'Walk the layer' },
        { key: 'defend', ok: defended, label: spec.requireDefend ? (defended ? 'Posted' : 'Post a defense') : (defended ? 'Posted' : 'Post (optional)') }
      ],
      rec, spec
    };
  }

  function inGrace(game, colony, depth) {
    if (!colony || !depth) return false;
    const rec = paceOf(colony, depth);
    if (rec.openedAt == null) rec.openedAt = game.simTime || 0;
    const window = 36 + depth * 4;
    return ((game.simTime || 0) - rec.openedAt) < window && !rec.settled;
  }

  function tickPace(game, bus, dt) {
    for (const colony of (game.colonies || [])) {
      if (!colony.alive) continue;
      retroSettle(game, colony);
      const deepest = S().deepestOf(game, colony.id);
      for (let d = 1; d <= Math.min(9, Math.max(deepest, 1)); d++) {
        if (!spineSite(game, colony.id, d)) continue;
        const rec = paceOf(colony, d);
        if (rec.openedAt == null) rec.openedAt = game.simTime;
        if (rec.settled) continue;
        const spec = PACE[d];
        if (!spec) continue;

        const spine = spineSite(game, colony.id, d);
        let onLayer = 0;
        for (const org of game.organisms) {
          if (!org.alive || org.ownerId !== colony.id || (org.depth || 0) !== d) continue;
          onLayer++;
          if (spine && K.dist(org.x, org.y, spine.x, spine.y) > 8) rec.scouted = true;
        }
        const { rooms, have } = layerRooms(game, colony.id, d);
        const roleOk = hasAny(have, spec.anyOf);
        const defended = !!(have.REDOUBT || have.BASTION || have.CITADEL || have.KEEP)
          || postedOn(game, colony.id, d);

        let rate = 1;
        if (onLayer >= 1) rate += 0.28;
        if (onLayer >= 2) rate += 0.22;
        if (rec.scouted) rate += 0.28;
        if (defended) rate += 0.24;
        if (rooms >= spec.rooms) rate += 0.12;
        rec.holdAcc += dt * rate;

        if (rec.holdAcc >= spec.hold && rooms >= spec.rooms && roleOk && (!spec.requireDefend || defended)) {
          rec.settled = true;
          if (colony.isPlayer && bus && !rec.announced && d < 9) {
            rec.announced = true;
            const next = S().DEPTHS[d + 1];
            CM.discovery.pushEvent(game, bus, {
              kind: 'discovery', icon: '\u{1F5FA}',
              message: `${S().DEPTHS[d].name} is settled. ${next ? next.name + ' can be cut when you choose.' : 'The Gate is yours to open.'}`,
              x: spine.x, y: spine.y, colonyId: colony.id
            });
          }
        }
      }
    }
  }

  function tick(game, bus, dt) {
    tickPace(game, bus, dt);
    // Reclaim: standing on your uncontrolled Gate with more bodies than foes.
    for (const s of S().all(game)) {
      if (s.type !== 'GATE' || !s.done || s.controlled !== false) { s.reclaimAcc = 0; continue; }
      const colony = game.coloniesById[s.colonyId];
      if (!colony) continue;
      const h = hostilityAt(game, s);
      if (h.friends > h.foes && h.friends > 0) {
        s.reclaimAcc = (s.reclaimAcc || 0) + dt;
        if (s.reclaimAcc >= RECLAIM_SECS) restoreBurrow(game, bus, colony);
      } else {
        s.reclaimAcc = 0;
      }
    }

    // Layer-4 dominance slowly feeds nearby surface flora — a reason to hold it.
    for (const colony of (game.colonies || [])) {
      if (!colony.alive || colony.burrowLost) continue;
      if (!dominates(game, colony.id, 4)) continue;
      colony.biomass = Math.min(colony.biomassCap, colony.biomass + 0.35 * dt);
    }

    checkOutcome(game, bus);
  }

  function wantedOnLayer(game, colony, depth) {
    const spec = PACE[depth];
    if (!spec) return null;
    const { rooms, have } = layerRooms(game, colony.id, depth);
    if (spec.anyOf && !hasAny(have, spec.anyOf)) {
      for (const k of spec.anyOf) if (S().TYPES[k]) return k;
    }
    if (spec.requireDefend && !have.BASTION && !have.CITADEL && !have.KEEP && !have.REDOUBT) {
      if (depth >= 8) return 'CITADEL';
      if (depth >= 6) return 'BASTION';
      return 'REDOUBT';
    }
    if (rooms < spec.rooms) {
      if (depth === 1) return have.CISTERN ? 'GRANARY' : 'CISTERN';
      if (depth === 2) return have.REDOUBT ? 'VAULT' : 'REDOUBT';
      if (depth === 4) return have.AQUEDUCT ? 'SPOREWELL' : 'AQUEDUCT';
      if (depth === 5) return have.RELIQUARY ? 'RESONATOR' : 'RELIQUARY';
      if (depth >= 9) return have.KEEP ? 'MUSTER' : 'KEEP';
      return spec.anyOf ? spec.anyOf[0] : 'WARREN';
    }
    return null;
  }

  /* Endgame: once two Coreminds have opened a Gate, the last one still
   * holding theirs owns the Veil. The surface Core can still fall on its
   * own terms — this is specifically the burrow war. */
  function checkOutcome(game, bus) {
    if (game.outcome) return;
    const opened = (game.colonies || []).filter(c => c.veilOpened);
    if (opened.length < 2) return;
    const holding = (game.colonies || []).filter(c => c.alive && hasGate(game, c.id));
    if (holding.length !== 1) return;
    const winner = holding[0];
    game.outcome = winner.isPlayer ? 'victory' : 'defeat';
    if (bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: winner.isPlayer ? 'discovery' : 'warn',
        icon: winner.isPlayer ? '\u{1F3C6}' : '\u{1F480}',
        message: winner.isPlayer
          ? 'The Veil is yours. Every other Gate has fallen — you hold the underworld.'
          : `${winner.name} holds the last Gate. The Veil belongs to them.`,
        x: winner.x, y: winner.y, colonyId: winner.id
      });
    }
    if (CM.ui && CM.ui.showOutcome) CM.ui.showOutcome(game);
  }

  function researchMul(game, org) {
    let m = 1;
    if (org.ownerId && dominates(game, org.ownerId, 2)) m *= 1.12;
    if (org.ownerId && dominates(game, org.ownerId, 5)) m *= 1.1;
    return m;
  }

  function senseMul(game, org) {
    if (org.ownerId && (org.depth || 0) === 5 && dominates(game, org.ownerId, 5)) return 1.35;
    return 1;
  }

  function layerHostiles(game, depth, colonyId) {
    let n = 0;
    for (const o of game.organisms) {
      if (!o.alive || (o.depth || 0) !== depth) continue;
      if (o.ownerId === colonyId || o.ownerId === 'wild') continue;
      n++;
    }
    return n;
  }

  /* On 1–9 you only walk excavated ground: near a chamber you own, a
   * burrow you are raiding, or any Gate (the doors onto the Veil). The
   * Veil itself (10) and the surface are open. */
  function canStand(game, org, x, y, depth) {
    if (!depth || depth >= 10) return true;
    const reach = 15;
    for (const s of S().all(game)) {
      if (!s.done || s.depth !== depth) continue;
      if (K.dist(s.x, s.y, x, y) > reach) continue;
      if (s.colonyId === org.ownerId) return true;
      if (org.raidColonyId && s.colonyId === org.raidColonyId) return true;
      const col = game.coloniesById[s.colonyId];
      if (col && col.burrowLost) return true;
      if (s.type === 'GATE' || s.type === 'NEXUS') return true;
    }
    return false;
  }

  function viewOpen(game, depth) {
    if (depth === 0) return true;
    const colony = game.core;
    if (!colony) return false;
    const deepest = S().deepestOf(game, colony.id);
    if (depth <= deepest + 1) return true;
    if (depth === 10 && hasGate(game, colony.id)) return true;
    if (depth === 10 && (game.organisms || []).some(o => o.ownerId === colony.id && (o.depth || 0) === 10)) return true;
    return false;
  }

  /* Settled rock is a better home the deeper it is. Surface stays harsh. */
  function comfort(game, depth) {
    depth = depth || 0;
    if (depth <= 0) return 0;
    const coreId = game.core && game.core.id;
    const rooms = (S().all(game) || []).filter(s =>
      s.done && s.depth === depth && (s.colonyId === coreId || s.ownerId === coreId));
    if (!rooms.length) return 0;
    let c = 0.06 * depth;
    if (rooms.some(s => s.type === 'WARREN' || s.type === 'NURSERY')) c += 0.08;
    if (game.core && layerReady(game, game.core, depth).ok) c += 0.10;
    return Math.max(0, Math.min(0.62, c));
  }

  function livingLabel(c) {
    if (c <= 0) return 'Exposed';
    if (c < 0.2) return 'Cool';
    if (c < 0.4) return 'Warm';
    return 'Hearth';
  }

  CM.layers = {
    FORTIFY_COST, FORT_HP, SPINE_ORDER, PACE,
    tradeoff, layerCounts, dominantOf, dominates,
    hasGate, hasType, isSpine, spineAt,
    nextWaypoint, tryTransfer, nearestConnector, canUseConnector,
    openNexus, loseBurrow, restoreBurrow,
    canFortify, fortify, onCompleted, onDestroyed, tick,
    researchMul, senseMul, layerHostiles, viewOpen, hostilityAt, canStand,
    surfaceReady, layerReady, retroSettle, inGrace, wantedOnLayer, paceOf, tickPace,
    comfort, livingLabel
  };
})(window.CM = window.CM || {});
