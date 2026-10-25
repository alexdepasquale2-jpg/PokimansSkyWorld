/* Coremind — hero mode. Wear one body. The colony still commands the rest.
 * Third-person follow, tab-target, eight trait-born abilities, a pack that
 * walks as one, an inventory on every organism.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const BACK = 5.2;
  const ZOOM = 32;
  const PACK_R = 10;
  const TAB_R = 20;
  const BAG = 8;
  const TURN = 3.4;
  const SPEED_DIV = 11;

  function ensure(game) {
    if (!game.hero) {
      game.hero = {
        on: false, orgId: null, targetId: null,
        keys: {}, stick: { x: 0, y: 0 },
        cd: {}, bagOpen: false, lastKit: null, floats: [], walk: null
      };
    }
    if (!game.hero.floats) game.hero.floats = [];
    return game.hero;
  }

  function float(game, x, y, text, color) {
    const h = ensure(game);
    h.floats.push({ x: x, y: y, text: String(text), color: color || '#e8c547', t: 0.85 });
  }

  function ensureInv(org) {
    if (!org.inv) org.inv = [];
    return org.inv;
  }

  function heroOf(game) {
    const h = game && game.hero;
    if (!h || !h.on || !h.orgId) return null;
    const org = game.byId[h.orgId];
    return org && org.alive ? org : null;
  }

  function isHero(game, org) {
    return !!(org && game.hero && game.hero.on && game.hero.orgId === org.id);
  }

  function hasTrait(org, id) {
    return !!(org && org.traits && org.traits.indexOf(id) >= 0);
  }

  function packOf(game) {
    const hero = heroOf(game);
    if (!hero) return [];
    const out = [];
    const seen = {};
    const ids = (game.selectedIds && game.selectedIds.length) ? game.selectedIds : null;
    if (ids) {
      for (const id of ids) {
        const o = game.byId[id];
        if (o && o.alive && o.ownerId === 'player' && (o.depth || 0) === (hero.depth || 0)) {
          out.push(o); seen[o.id] = true;
        }
      }
    }
    if (out.length < 2) {
      for (const o of game.organisms) {
        if (!o.alive || o.ownerId !== 'player') continue;
        if ((o.depth || 0) !== (hero.depth || 0)) continue;
        if (seen[o.id]) continue;
        if (K.dist(o.x, o.y, hero.x, hero.y) <= PACK_R) {
          out.push(o); seen[o.id] = true;
        }
      }
    }
    if (!seen[hero.id]) out.unshift(hero);
    return out;
  }

  function synergies(pack) {
    const count = {};
    for (const o of pack) {
      for (const t of (o.traits || [])) count[t] = (count[t] || 0) + 1;
    }
    const list = [];
    if (count.venom) list.push({ id: 'venom', name: 'Venom drip', atk: 1.12 });
    if (count.armor) list.push({ id: 'shellwall', name: 'Shell wall', def: 1.12 });
    if (count.chem_sense || count.vibration_sense) list.push({ id: 'scent', name: 'Wide nose', tab: 1.35 });
    if (count.regeneration) list.push({ id: 'mend', name: 'Shared mend', heal: 0.012 });
    if (count.fast_movement >= 2) list.push({ id: 'pace', name: 'Pack pace', spd: 1.08 });
    if (count.burrowing >= 2) list.push({ id: 'earth', name: 'Earth choir', dig: 1.15 });
    return list;
  }

  function synMul(pack, key) {
    let m = 1;
    for (const s of synergies(pack)) if (s[key]) m *= s[key];
    return m;
  }

  function kit(org, game) {
    const slots = [];
    const push = (id, name, cd, cost, kind) => {
      slots.push({ id: id, name: name, cd: cd, cost: cost, kind: kind, key: String(slots.length + 1) });
    };
    push('strike', 'Strike', 0.45, 3, 'atk');
    if (hasTrait(org, 'burrowing')) push('burrow', 'Burrow', 6, 8, 'body');
    else if (hasTrait(org, 'fast_movement') || hasTrait(org, 'basic_legs')) push('charge', 'Charge', 5, 10, 'body');
    else push('shove', 'Shove', 4, 6, 'body');
    if (hasTrait(org, 'chem_sense') || hasTrait(org, 'vision')) push('scan', 'Scan', 8, 6, 'sense');
    else if (hasTrait(org, 'vibration_sense')) push('whisker', 'Whisker', 7, 5, 'sense');
    else push('look', 'Look', 5, 4, 'sense');
    if (hasTrait(org, 'armor')) push('shell', 'Shell', 10, 8, 'guard');
    else if (hasTrait(org, 'camouflage')) push('hide', 'Hide', 9, 7, 'guard');
    else if (hasTrait(org, 'regeneration')) push('mend', 'Mend', 8, 10, 'guard');
    else push('guard', 'Guard', 6, 5, 'guard');
    if (hasTrait(org, 'venom')) push('venom', 'Venom', 7, 9, 'hunt');
    else if (org.behaviors && org.behaviors.has && org.behaviors.has('armor_pierce')) push('pierce', 'Pierce', 6, 8, 'hunt');
    else push('bite', 'Bite', 5, 6, 'hunt');
    if (org.thirst > 55) push('drink', 'Drink', 3, 2, 'guts');
    else if (org.hunger > 45) push('feed', 'Feed', 3, 2, 'guts');
    else push('sprint', 'Sprint', 8, 12, 'guts');
    if (game && targetOf(game)) push('send', 'Send', 6, 4, 'pack');
    else push('rally', 'Rally', 6, 4, 'pack');
    if (org.lifeTier === 'legendary') push('roar', 'Roar', 14, 14, 'call');
    else if ((org.stats.digging || 0) >= 10) push('dig', 'Dig', 4, 6, 'call');
    else push('command', 'Command', 0, 0, 'call');
    return slots.slice(0, 8);
  }

  function cdLeft(game, id) {
    const h = ensure(game);
    const t = h.cd[id] || 0;
    return Math.max(0, t);
  }

  function enter(game, org) {
    if (!game || !org || !org.alive) return { ok: false, reason: 'Nothing to wear.' };
    const h = ensure(game);
    h.on = true;
    h.orgId = org.id;
    h.targetId = null;
    h.bagOpen = false;
    h.lastKit = kit(org, game);
    game.followSelection = false;
    game.viewDepth = org.depth || 0;
    if (CM.coremind && org.ownerId === 'player') CM.coremind.selectOrganism(game, org.id, true);
    if (typeof document !== 'undefined' && document.body) document.body.classList.add('hero');
    if (CM.render && CM.render.focusOn) CM.render.focusOn(game, org.x, org.y, ZOOM);
    return { ok: true };
  }

  function exit(game) {
    const h = ensure(game);
    h.on = false;
    h.bagOpen = false;
    if (typeof document !== 'undefined' && document.body) document.body.classList.remove('hero');
    if (game.camera) game.camera.targetZoom = 9;
    return { ok: true };
  }

  function cycleBody(game, dir) {
    const pack = packOf(game);
    if (!pack.length) return;
    const hero = heroOf(game);
    let i = hero ? pack.indexOf(hero) : 0;
    if (i < 0) i = 0;
    i = (i + (dir < 0 ? -1 : 1) + pack.length) % pack.length;
    enter(game, pack[i]);
  }

  function tabList(game) {
    const hero = heroOf(game);
    if (!hero) return [];
    const pack = packOf(game);
    const ids = {};
    for (const p of pack) ids[p.id] = true;
    const r = TAB_R * synMul(pack, 'tab');
    const list = [];
    for (const o of game.organisms) {
      if (!o.alive || o.id === hero.id || ids[o.id]) continue;
      if ((o.depth || 0) !== (hero.depth || 0)) continue;
      if (CM.sense && !CM.sense.visibleOrg(game, o)) continue;
      const d = K.dist(o.x, o.y, hero.x, hero.y);
      if (d > r) continue;
      const hostile = o.ownerId !== hero.ownerId;
      list.push({ org: o, d: d, hostile: hostile });
    }
    list.sort((a, b) => {
      if (a.hostile !== b.hostile) return a.hostile ? -1 : 1;
      return a.d - b.d;
    });
    return list;
  }

  function tabTarget(game, dir) {
    const h = ensure(game);
    const list = tabList(game);
    if (!list.length) { h.targetId = null; return null; }
    let i = list.findIndex(e => e.org.id === h.targetId);
    if (i < 0) i = dir > 0 ? -1 : 0;
    i = (i + (dir < 0 ? -1 : 1) + list.length) % list.length;
    h.targetId = list[i].org.id;
    return list[i].org;
  }

  function targetOf(game) {
    const h = game.hero;
    if (!h || !h.targetId) return null;
    const o = game.byId[h.targetId];
    return o && o.alive ? o : null;
  }

  function spend(org, cost) {
    if ((org.energy || 0) < cost) return false;
    org.energy -= cost;
    return true;
  }

  function nearestFoe(game, hero, r) {
    let best = null, bestD = r || 4;
    for (const o of game.organisms) {
      if (!o.alive || o.id === hero.id || o.ownerId === hero.ownerId) continue;
      if ((o.depth || 0) !== (hero.depth || 0)) continue;
      const d = K.dist(o.x, o.y, hero.x, hero.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  function hit(game, hero, tgt, mul) {
    if (!tgt || !tgt.alive) return 0;
    const pack = packOf(game);
    const atk = (hero.stats.attack || 5) * synMul(pack, 'atk') * (mul || 1);
    const def = (tgt.stats.defense || 0) * 0.5;
    let dmg = Math.max(2, atk - def);
    if (hero.__sprint) dmg *= 1.1;
    tgt.health -= dmg;
    if (hero.__venom || hasTrait(hero, 'venom') || synMul(pack, 'atk') > 1) {
      tgt.__dot = (tgt.__dot || 0) + 6;
    }
    float(game, tgt.x, tgt.y, Math.round(dmg), '#e8c547');
    if (tgt.health <= 0) {
      addItem(hero, { id: 'meat', name: 'Meat', kind: 'food', n: 1 });
      float(game, tgt.x, tgt.y, 'KILL', '#c04030');
      if (CM.life) {
        CM.life.grant(game, hero, 'kill', 8);
        CM.life.mark(game, hero, 'first_kill');
      }
    }
    return dmg;
  }

  function dash(game, org, dist) {
    const nx = org.x + Math.cos(org.heading) * dist;
    const ny = org.y + Math.sin(org.heading) * dist;
    const size = game.world.size - 1;
    org.x = K.clamp(nx, 0.2, size);
    org.y = K.clamp(ny, 0.2, size);
    if (game.world.grid) game.world.grid.update(org);
  }

  function pickupNear(game, org) {
    const inv = ensureInv(org);
    let got = false;
    if (game.discovery && game.discovery.samples) {
      for (let i = game.discovery.samples.length - 1; i >= 0; i--) {
        const s = game.discovery.samples[i];
        if (K.dist(s.x, s.y, org.x, org.y) > 2.2) continue;
        if (!addItem(org, { id: 'sample-' + (s.speciesId || 'bit'), name: (s.speciesId || 'Sample'), kind: 'sample', n: 1 })) break;
        game.discovery.samples.splice(i, 1);
        got = true;
      }
    }
    if (org.carrying > 0.4) {
      const n = Math.min(3, Math.ceil(org.carrying / 4));
      if (addItem(org, { id: 'forage', name: 'Forage', kind: 'food', n: n })) {
        org.carrying = Math.max(0, org.carrying - n * 4);
        got = true;
      }
    }
    return got;
  }

  function addItem(org, item) {
    const inv = ensureInv(org);
    const hit = inv.find(i => i.id === item.id);
    if (hit) { hit.n += item.n || 1; return true; }
    if (inv.length >= BAG) return false;
    inv.push({ id: item.id, name: item.name, kind: item.kind, n: item.n || 1 });
    return true;
  }

  function useItem(game, org, idx) {
    const inv = ensureInv(org);
    const it = inv[idx];
    if (!it) return { ok: false, reason: 'Empty slot.' };
    if (it.kind === 'food') {
      org.hunger = Math.max(0, org.hunger - 28);
      org.energy = Math.min(org.stats.energyMax, org.energy + 10);
    } else if (it.kind === 'water') {
      org.thirst = Math.max(0, org.thirst - 32);
    } else if (it.kind === 'sample') {
      if (CM.discovery && it.id.indexOf('sample-') === 0) {
        /* already extracted — just keep as trophy unless they drop */
      }
      org.energy = Math.min(org.stats.energyMax, org.energy + 4);
    } else {
      return { ok: false, reason: 'Cannot use that.' };
    }
    it.n -= 1;
    if (it.n <= 0) inv.splice(idx, 1);
    return { ok: true };
  }

  function cast(game, slot) {
    const hero = heroOf(game);
    if (!hero) return { ok: false, reason: 'No body.' };
    const slots = kit(hero, game);
    const ab = slots[slot];
    if (!ab) return { ok: false, reason: 'No ability.' };
    if (cdLeft(game, ab.id) > 0) return { ok: false, reason: 'Not ready.' };
    if (ab.cost && !spend(hero, ab.cost)) return { ok: false, reason: 'No energy.' };
    const h = ensure(game);
    let tgt = targetOf(game) || nearestFoe(game, hero, 3.4);
    const W = CM.world;

    if (ab.id === 'command') { exit(game); return { ok: true }; }
    if (ab.id === 'strike' || ab.id === 'bite' || ab.id === 'pierce') {
      if (!tgt) return { ok: false, reason: 'No target. Tab.' };
      const face = Math.atan2(tgt.y - hero.y, tgt.x - hero.x);
      hero.heading = face;
      if (K.dist(hero.x, hero.y, tgt.x, tgt.y) > 3.6) dash(game, hero, Math.min(2.4, K.dist(hero.x, hero.y, tgt.x, tgt.y) - 1.2));
      hit(game, hero, tgt, ab.id === 'pierce' ? 1.35 : 1);
      hero.state = 'ATTACK';
      hero.actionTarget = { ref: tgt, x: tgt.x, y: tgt.y };
    } else if (ab.id === 'charge') {
      if (tgt) hero.heading = Math.atan2(tgt.y - hero.y, tgt.x - hero.x);
      dash(game, hero, 4.2);
      if (tgt && K.dist(hero.x, hero.y, tgt.x, tgt.y) < 3) hit(game, hero, tgt, 1.4);
    } else if (ab.id === 'shove') {
      if (!tgt) return { ok: false, reason: 'No target.' };
      const ang = Math.atan2(tgt.y - hero.y, tgt.x - hero.x);
      tgt.x = K.clamp(tgt.x + Math.cos(ang) * 2.2, 0.2, game.world.size - 1);
      tgt.y = K.clamp(tgt.y + Math.sin(ang) * 2.2, 0.2, game.world.size - 1);
      hit(game, hero, tgt, 0.6);
    } else if (ab.id === 'burrow') {
      hero.burrowed = !hero.burrowed;
      hero.burrowTimer = hero.burrowed ? 3.2 : 0;
    } else if (ab.id === 'scan' || ab.id === 'whisker' || ab.id === 'look') {
      if (CM.sense && CM.sense.ensure) {
        CM.sense.ensure(game);
        if (CM.aura) CM.aura.stamp(game, hero.depth || 0, hero.x, hero.y, 'mind', 2.2, 4);
      }
      tabTarget(game, 1);
    } else if (ab.id === 'shell' || ab.id === 'guard') {
      hero.__shell = 6;
    } else if (ab.id === 'hide') {
      hero.__hide = 7;
    } else if (ab.id === 'mend') {
      hero.health = Math.min(hero.stats.health, hero.health + hero.stats.health * 0.22);
    } else if (ab.id === 'venom') {
      if (!tgt) return { ok: false, reason: 'No target.' };
      hit(game, hero, tgt, 0.7);
      tgt.__dot = (tgt.__dot || 0) + 14;
    } else if (ab.id === 'sprint') {
      hero.__sprint = 5;
    } else if (ab.id === 'feed') {
      if (W && W.consumeFood) {
        const taken = W.consumeFood(game.world, hero.x, hero.y, 18);
        hero.hunger = Math.max(0, hero.hunger - taken * 3);
        if (taken < 2) pickupNear(game, hero);
        if (CM.life) { CM.life.grant(game, hero, 'feed', 2); CM.life.mark(game, hero, 'first_feed'); }
      }
    } else if (ab.id === 'drink') {
      hero.thirst = Math.max(0, hero.thirst - 35);
      if (CM.life) CM.life.grant(game, hero, 'drink', 1);
    } else if (ab.id === 'rally') {
      for (const o of packOf(game)) {
        if (o.id === hero.id) continue;
        o.order = { type: 'MOVE', x: hero.x, y: hero.y, depth: hero.depth || 0 };
      }
    } else if (ab.id === 'send') {
      if (!tgt) return { ok: false, reason: 'No target.' };
      for (const o of packOf(game)) {
        if (o.id === hero.id) continue;
        o.order = { type: 'ATTACK', targetId: tgt.id, x: tgt.x, y: tgt.y };
      }
    } else if (ab.id === 'dig') {
      hero.state = 'EXCAVATE';
      if (CM.life) CM.life.grant(game, hero, 'dig', 1);
    } else if (ab.id === 'roar') {
      for (const o of game.organisms) {
        if (!o.alive || o.id === hero.id) continue;
        if (K.dist(o.x, o.y, hero.x, hero.y) < 8) o.__stun = 2.4;
      }
    }
    h.cd[ab.id] = ab.cd;
    h.lastKit = slots;
    return { ok: true, ab: ab };
  }

  function drive(game, org, dt) {
    const h = ensure(game);
    const keys = h.keys || {};
    const stick = h.stick || { x: 0, y: 0 };
    let turn = 0, fwd = 0;
    if (keys.a || keys.arrowleft) turn -= 1;
    if (keys.d || keys.arrowright) turn += 1;
    if (keys.w || keys.arrowup) fwd += 1;
    if (keys.s || keys.arrowdown) fwd -= 1;
    if (stick.x) turn += stick.x;
    if (stick.y) fwd += -stick.y;
    org.heading = (org.heading || 0) + turn * TURN * dt;
    const pack = packOf(game);
    let mul = 1 * synMul(pack, 'spd');
    if (org.__sprint > 0) { mul *= 1.55; org.__sprint -= dt; }
    if (org.__shell > 0) org.__shell -= dt;
    if (org.__hide > 0) org.__hide -= dt;
    if (org.__stun > 0) { org.__stun -= dt; mul *= 0.2; }
    if (org.burrowed) mul *= 0.35;
    if (!fwd && h.walk) {
      const dx = h.walk.x - org.x, dy = h.walk.y - org.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.45) h.walk = null;
      else {
        org.heading = K.turnToward(org.heading, Math.atan2(dy, dx), TURN * dt);
        fwd = 1;
      }
    }
    const W = CM.world;
    const terrain = W && W.moveCostAt ? W.moveCostAt(game.world, org.x, org.y) : 1;
    const spd = ((org.stats.speed || 13) / SPEED_DIV) * mul * terrain;
    if (fwd) {
      const step = spd * dt * (fwd < 0 ? 0.55 : 1) * (fwd < 0 ? -1 : 1);
      const nx = org.x + Math.cos(org.heading) * Math.abs(step) * (fwd < 0 ? -1 : 1);
      const ny = org.y + Math.sin(org.heading) * Math.abs(step) * (fwd < 0 ? -1 : 1);
      const size = game.world.size - 1;
      const depth = org.depth || 0;
      if (!(CM.layers && depth >= 1 && depth < 10 && !CM.layers.canStand(game, org, nx, ny, depth))) {
        org.x = K.clamp(nx, 0.2, size);
        org.y = K.clamp(ny, 0.2, size);
      }
    }
    if (org.__dot > 0) {
      org.health -= 4 * dt;
      org.__dot -= dt;
    }
    if (org.__shell > 0) org.stats.__heroDef = 1.25;
    return 'skip';
  }

  function tick(game, dt) {
    const h = ensure(game);
    for (const k in h.cd) h.cd[k] = Math.max(0, (h.cd[k] || 0) - dt);
    if (!h.on) return;
    const hero = heroOf(game);
    if (!hero) { exit(game); return; }
    if ((hero.depth || 0) !== (game.viewDepth || 0)) game.viewDepth = hero.depth || 0;
    const pack = packOf(game);
    const heal = synMul(pack, 'heal') > 1 ? 0.012 : 0;
    if (heal) {
      for (const o of pack) {
        o.health = Math.min(o.stats.health, o.health + o.stats.health * heal * dt);
      }
    }
    const slots = 1.6;
    let i = 0;
    for (const o of pack) {
      if (o.id === hero.id) continue;
      if (o.order && (o.order.type === 'ATTACK' || o.order.type === 'GARRISON')) continue;
      const ang = hero.heading + Math.PI + (i - (pack.length - 2) * 0.5) * 0.7;
      const tx = hero.x + Math.cos(ang) * slots;
      const ty = hero.y + Math.sin(ang) * slots;
      o.order = { type: 'MOVE', x: tx, y: ty, depth: hero.depth || 0 };
      i++;
    }
    if (h.targetId && !(game.byId[h.targetId] && game.byId[h.targetId].alive)) h.targetId = null;
    pickupNear(game, hero);
    for (let i = h.floats.length - 1; i >= 0; i--) {
      h.floats[i].t -= dt;
      h.floats[i].y -= dt * 2.2;
      if (h.floats[i].t <= 0) h.floats.splice(i, 1);
    }
    aimCamera(game);
  }

  function aimCamera(game) {
    const hero = heroOf(game);
    if (!hero || !game.camera) return;
    const c = game.camera;
    if (c.dragging) return;
    c.targetX = hero.x - Math.cos(hero.heading || 0) * BACK;
    c.targetY = hero.y - Math.sin(hero.heading || 0) * BACK;
    c.targetZoom = ZOOM;
  }

  function onKey(game, key, down) {
    const h = ensure(game);
    const k = String(key).toLowerCase();
    if (down) h.keys[k] = true;
    else delete h.keys[k];
    if (!down || !h.on) return false;
    if (k === 'tab') { tabTarget(game, game.hero.shift ? -1 : 1); return true; }
    if (k === 'enter') { if (h.on) exit(game); else return false; return true; }
    if (k === 'escape') { exit(game); return true; }
    if (k === '[' || k === ',') { cycleBody(game, -1); return true; }
    if (k === ']' || k === '.') { cycleBody(game, 1); return true; }
    if (k === ' ' || k === 'space') {
      cast(game, 0);
      return true;
    }
    if (k === 'f') {
      const hero = heroOf(game);
      if (hero) pickupNear(game, hero);
      return true;
    }
    if (k === 'b' && !(k === 'b' && h.on === false)) {
      h.bagOpen = !h.bagOpen;
      return true;
    }
    if (k >= '1' && k <= '8') {
      cast(game, parseInt(k, 10) - 1);
      return true;
    }
    return k === 'w' || k === 'a' || k === 's' || k === 'd' || k.indexOf('arrow') === 0;
  }

  function serialize(game) {
    const h = game.hero;
    if (!h) return null;
    return { on: !!h.on, orgId: h.orgId, targetId: h.targetId };
  }

  function hydrate(game, data) {
    const h = ensure(game);
    if (!data) return;
    h.on = !!data.on;
    h.orgId = data.orgId || null;
    h.targetId = data.targetId || null;
    if (h.on && typeof document !== 'undefined' && document.body) document.body.classList.add('hero');
  }

  CM.hero = {
    ensure, ensureInv, heroOf, isHero, packOf, synergies, kit,
    enter, exit, cycleBody, tabTarget, tabList, targetOf, float,
    cast, drive, tick, aimCamera, onKey, pickupNear, addItem, useItem,
    serialize, hydrate, cdLeft, BAG, ZOOM
  };
})(window.CM = window.CM || {});
