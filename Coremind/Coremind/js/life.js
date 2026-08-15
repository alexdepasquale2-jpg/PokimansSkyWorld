/* Coremind — per-being XP, marks, and Common / Rare / Legendary.
 * A life sheet belongs to a body, not the colony.
 */
(function (CM) {
  'use strict';

  const MAX_LEVEL = 10;
  const MARK_XP = 15;
  const DIG_THROTTLE = 2;

  const GRANT = {
    feed: 2, drink: 1, gather: 3, kill: 8, extract: 6,
    dig: 1, depth: 12, climate: 10, gift: 5
  };

  const FOCUS_OF = {
    feed: 'forage', drink: 'forage', gather: 'forage', gift: 'forage',
    kill: 'kill',
    extract: 'sense', climate: 'sense',
    dig: 'dig', depth: 'dig',
    first_feed: 'forage', gifted: 'forage',
    first_kill: 'kill', five_kills: 'kill',
    first_extract: 'sense', season_lived: 'sense',
    first_dig: 'dig', first_depth3: 'dig', first_depth6: 'dig', first_depth9: 'dig',
    forage: 'forage', sense: 'sense'
  };

  const MARKS = {
    first_feed: 'First Feed',
    first_kill: 'First Kill',
    first_extract: 'First Extract',
    first_dig: 'First Dig',
    first_depth3: 'Depth 3',
    first_depth6: 'Depth 6',
    first_depth9: 'Depth 9',
    five_kills: 'Five Kills',
    season_lived: 'Season Lived',
    gifted: 'Gifted'
  };

  function need(level) {
    return 20 + level * 18;
  }

  function markCount(org) {
    const marks = org && org.lifeMarks;
    if (!marks) return 0;
    let n = 0;
    for (const id in marks) if (marks[id] != null) n++;
    return n;
  }

  function emptyBonus() {
    return {
      health: 0, attack: 0, defense: 0, speed: 0, digging: 0,
      sense_radius: 0, energyMax: 0, vision: 0, camouflage: 0
    };
  }

  function ensure(org) {
    if (!org) return org;
    if (org.xp == null) org.xp = 0;
    if (org.lifeLevel == null) org.lifeLevel = 1;
    if (!org.lifeTier) org.lifeTier = 'common';
    if (!org.lifeMarks) org.lifeMarks = {};
    if (org.lifeFocus === undefined) org.lifeFocus = null;
    if (org.lifeKills == null) org.lifeKills = 0;
    if (org.lifeMaxDepth == null) org.lifeMaxDepth = org.depth || 0;
    if (!org.lifeBonus) org.lifeBonus = emptyBonus();
    return org;
  }

  function bump(org, key, n) {
    const b = org.lifeBonus || (org.lifeBonus = emptyBonus());
    b[key] = (b[key] || 0) + n;
    if (org.stats) org.stats[key] = (org.stats[key] || 0) + n;
  }

  function applyFocusBonus(org) {
    const f = org.lifeFocus || 'forage';
    if (f === 'kill') {
      bump(org, 'attack', 2);
      bump(org, 'health', 1);
      org.health = (org.health || 0) + 1;
    } else if (f === 'dig') {
      bump(org, 'digging', 3);
      bump(org, 'defense', 1);
    } else if (f === 'sense') {
      bump(org, 'vision', 2);
      bump(org, 'camouflage', 1);
    } else {
      bump(org, 'sense_radius', 2);
      bump(org, 'energyMax', 1);
      if (org.stats) org.energy = Math.min(org.stats.energyMax, (org.energy || 0) + 1);
    }
  }

  /* Trait stats come back from create(); layer the persisted life bonus on top. */
  function applyBonus(org) {
    if (!org || !org.stats || !org.lifeBonus) return org;
    for (const k in org.lifeBonus) {
      const n = org.lifeBonus[k];
      if (n) org.stats[k] = (org.stats[k] || 0) + n;
    }
    return org;
  }

  function addXp(org, amount) {
    if (!amount) return;
    org.xp += amount;
    while (org.lifeLevel < MAX_LEVEL && org.xp >= need(org.lifeLevel)) {
      org.xp -= need(org.lifeLevel);
      org.lifeLevel++;
      applyFocusBonus(org);
    }
  }

  function computeTier(org) {
    const n = markCount(org);
    const lvl = org.lifeLevel || 1;
    if (lvl >= 8 || (n >= 7 && (org.lifeTier === 'rare' || org.lifeTier === 'legendary'))) {
      return 'legendary';
    }
    if (lvl >= 4 || n >= 3) return 'rare';
    return 'common';
  }

  function announceLegend(game, org) {
    if (!game || !org) return;
    const evt = {
      kind: 'legend', icon: '\u2605',
      message: org.name + ' is legend.',
      x: org.x, y: org.y, orgId: org.id
    };
    const bus = game.__bus;
    if (bus && CM.discovery && CM.discovery.pushEvent) {
      CM.discovery.pushEvent(game, bus, evt);
    } else if (bus && bus.emit) {
      bus.emit('event', evt);
    }
  }

  function refreshTier(org, game) {
    if (!org) return 'common';
    ensure(org);
    const prev = org.lifeTier;
    org.lifeTier = computeTier(org);
    if (org.lifeTier === 'legendary' && prev !== 'legendary') {
      announceLegend(game, org);
    }
    return org.lifeTier;
  }

  function tierOf(org) {
    if (!org) return 'common';
    ensure(org);
    return org.lifeTier || computeTier(org);
  }

  function grant(game, org, reason, amount) {
    if (!org) return 0;
    ensure(org);
    const listed = GRANT[reason];
    let n = amount != null ? amount : (listed != null ? listed : 0);
    if (n <= 0) return org.xp;
    if (reason === 'dig') {
      const t = (game && game.simTime) || 0;
      if (t - (org.lifeDigAt || -999) < DIG_THROTTLE) return org.xp;
      org.lifeDigAt = t;
    }
    if (org.ownerId !== 'player') n = n * 0.5;
    const focus = FOCUS_OF[reason];
    if (focus) org.lifeFocus = focus;
    addXp(org, n);
    refreshTier(org, game);
    return org.xp;
  }

  function mark(game, org, id) {
    if (!org || !id) return false;
    ensure(org);
    if (org.lifeMarks[id]) return false;
    org.lifeMarks[id] = (game && game.simTime > 0) ? game.simTime : 1;
    const focus = FOCUS_OF[id];
    if (focus) org.lifeFocus = focus;
    org.lifePopAt = Date.now();
    addXp(org, MARK_XP);
    refreshTier(org, game);
    return true;
  }

  function noteDepth(game, org) {
    if (!org || !org.alive) return;
    ensure(org);
    const d = org.depth || 0;
    if (d <= (org.lifeMaxDepth || 0)) return;
    org.lifeMaxDepth = d;
    grant(game, org, 'depth', GRANT.depth);
    if (d >= 3) mark(game, org, 'first_depth3');
    if (d >= 6) mark(game, org, 'first_depth6');
    if (d >= 9) mark(game, org, 'first_depth9');
  }

  function noteKill(game, org) {
    if (!org) return;
    ensure(org);
    grant(game, org, 'kill', GRANT.kill);
    mark(game, org, 'first_kill');
    org.lifeKills = (org.lifeKills || 0) + 1;
    if (org.lifeKills >= 5) mark(game, org, 'five_kills');
  }

  function actor(game, x, y) {
    if (!game) return null;
    const sel = CM.orders && CM.orders.selectedPlayerOrgs
      ? CM.orders.selectedPlayerOrgs(game) : [];
    const pool = sel.length ? sel : game.organisms.filter(o => o && o.alive && o.ownerId === 'player');
    if (!pool.length) return null;
    if (x == null || y == null) return pool[0];
    let best = pool[0], bd = Infinity;
    for (const o of pool) {
      const dx = o.x - x, dy = o.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function grantActors(game, reason, amount, x, y) {
    const org = actor(game, x, y);
    if (!org) return;
    grant(game, org, reason, amount != null ? amount : GRANT[reason]);
    if (reason === 'extract') mark(game, org, 'first_extract');
    if (reason === 'gift') mark(game, org, 'gifted');
  }

  function onClimateEnd(game) {
    if (!game || !game.organisms) return;
    for (const org of game.organisms) {
      if (!org || !org.alive) continue;
      grant(game, org, 'climate', GRANT.climate);
      mark(game, org, 'season_lived');
    }
  }

  function selectionLine(org) {
    if (!org) return '';
    ensure(org);
    const t = org.lifeTier || 'common';
    const Tier = t.charAt(0).toUpperCase() + t.slice(1);
    return org.name + ' · ' + Tier + ' ' + org.lifeLevel + ' · ' + Math.floor(org.xp) + ' XP';
  }

  function markList(org) {
    if (!org || !org.lifeMarks) return [];
    const out = [];
    for (const id in org.lifeMarks) {
      if (org.lifeMarks[id] == null) continue;
      out.push(MARKS[id] || id);
    }
    return out;
  }

  CM.life = {
    GRANT, MARKS, MAX_LEVEL,
    need, ensure, grant, mark, tierOf, refreshTier, applyBonus, emptyBonus,
    noteDepth, noteKill, actor, grantActors, onClimateEnd,
    selectionLine, markList, markCount
  };
})(window.CM = window.CM || {});
