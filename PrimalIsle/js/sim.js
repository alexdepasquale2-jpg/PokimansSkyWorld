/* Primal Isle — the world tick.
 *
 * One update, every frame, at real speed. There is no fast-forward: an action
 * game where you can skip the boring part with a button would have nothing
 * left to sell you.
 */
(function (ISLE) {
  'use strict';
  const C = ISLE.content;
  const W = ISLE.world;
  const D = ISLE.dino;
  const K = ISLE.combat;
  const A = ISLE.ai;
  const M = ISLE.shop;
  const MU = ISLE.mutations;
  const Idle = ISLE.idle;
  const { clamp, dist, chance } = ISLE.core;

  function feed(g, text, tone) {
    g.feed.unshift({ t: g.clock, text, tone: tone || 'info' });
    if (g.feed.length > 70) g.feed.length = 70;
  }

  // --- calls --------------------------------------------------------------
  function emitCall(g, d, type) {
    const def = C.CALLS[type];
    if (!def) return;
    g.calls.push({ x: d.x, y: d.y, r: def.range, t: 0, type, by: d.id, name: d.name, sp: d.sp });
    if (g.calls.length > 24) g.calls.shift();

    for (const o of g.dinos) {
      if (o === d || !o.alive || o.player || !o.ai) continue;
      const dd = dist(o.x, o.y, d.x, d.y);
      if (dd > def.range) continue;
      const carn = D.species(o).diet === 'carnivore';

      if (type === 'group' && o.sp === d.sp && !o.group && dd < C.CALLS.group.range) {
        o.group = d.group || (d.group = 'g' + d.id);
        continue;
      }
      // A distress call is a dinner bell for anything that fancies its chances.
      const interested = (type === 'distress' && carn) || (o.ai.kos && chance(0.5));
      if (interested && K.matchup(o, d) > o.ai.nerve * 0.9) {
        o.ai.state = 'wander';
        o.ai.gx = d.x; o.ai.gy = d.y;
        o.ai.think = 0.4;
      }
    }
  }

  function tickCalls(g, dt) {
    for (let i = g.calls.length - 1; i >= 0; i--) {
      g.calls[i].t += dt;
      if (g.calls[i].t > 2.2) g.calls.splice(i, 1);
    }
  }

  // --- player actions -----------------------------------------------------
  function playerBite(g) {
    const d = g.player;
    if (!d || !d.alive) return null;
    const res = K.bite(g, d);
    if (res && res.target) g.ui.hitFlash = 0.16;
    return res;
  }

  /* One button does the obvious thing, because a phone has no keyboard: eat
   * whatever is under you, or drink if you are standing in water. */
  function playerInteract(g, dt) {
    const d = g.player;
    if (!d || !d.alive) return null;
    const carn = D.species(d).diet === 'carnivore';

    const car = carn ? K.carcassNear(g, d.x, d.y, D.radius(d) + 34) : null;
    if (car) { const got = D.eatCarcass(g, d, car); return got ? { kind: 'meat', got } : null; }

    const near = W.nodesNear(g.world, d.x, d.y, D.radius(d) + 32, carn ? 'carnivore' : 'herbivore');
    if (near.length) {
      const n = near[0];
      const got = D.eatNode(g, d, n);
      return got ? { kind: W.nodeDef(n).name, got } : null;
    }

    const water = W.drinkableAt(g.world, d.x, d.y);
    if (water) {
      D.drink(g, d, dt);
      if (water === 'salt' && !g.ui.saltWarned) {
        g.ui.saltWarned = true;
        feed(g, 'Sea water. It goes down, and then it takes more than it gave.', 'bad');
      }
      return { kind: water === 'fresh' ? 'water' : 'salt water' };
    }
    return null;
  }

  /* What the interact button should say right now. */
  function interactHint(g) {
    const d = g.player;
    if (!d || !d.alive) return null;
    const carn = D.species(d).diet === 'carnivore';
    if (carn && K.carcassNear(g, d.x, d.y, D.radius(d) + 34)) return { icon: '🍖', label: 'Eat' };
    const near = W.nodesNear(g.world, d.x, d.y, D.radius(d) + 32, carn ? 'carnivore' : 'herbivore');
    if (near.length) return { icon: carn ? '🦎' : '🌿', label: 'Eat' };
    const water = W.drinkableAt(g.world, d.x, d.y);
    if (water === 'fresh') return { icon: '💧', label: 'Drink' };
    if (water === 'salt') return { icon: '🌊', label: 'Salt' };
    return null;
  }

  function playerCall(g, type) {
    const d = g.player;
    if (!d || !d.alive || d.callT > 0) return false;
    d.callT = C.CALLS[type].cd;
    emitCall(g, d, type);
    if (type === 'group') {
      let n = 0;
      for (const o of g.dinos) {
        if (o === d || !o.alive || o.sp !== d.sp) continue;
        if (dist(o.x, o.y, d.x, d.y) > C.CALLS.group.range) continue;
        o.group = d.group || (d.group = 'gplayer');
        n++;
      }
      feed(g, n ? `${n} joined your group.` : 'Nobody answered.', n ? 'good' : 'dim');
    }
    return true;
  }

  /* Take one of the three, and the other two are gone for this run. */
  function takeMutation(g, id) {
    if (!g.draft || g.draft.opts.indexOf(id) < 0) return false;
    const d = g.player;
    if (!d) return false;
    MU.take(d, id);
    MU.markTaken(d);
    M.onMutation(g, id);
    g.draft = null;
    d.hp = Math.min(D.maxHp(d), d.hp + D.maxHp(d) * 0.15);   // a milestone heals a little
    feed(g, `Mutation — ${MU.BY_ID[id].name}.`, 'great');
    return true;
  }

  /* Three bad offers is a real outcome, so there is a way to buy out of it. */
  function rerollDraft(g) {
    if (!g.draft || !g.player) return false;
    if (M.itemCount(g, 'reroll') <= 0) return false;
    g.acct.items.reroll--;
    g.draft = { at: g.draft.at, opts: MU.offer(g.player, g.draft.at).map(m => m.id), rerolls: g.draft.rerolls + 1 };
    return true;
  }

  // --- death and respawn ---------------------------------------------------
  function handleDeath(g) {
    const d = g.player;
    const killer = d.killer ? g.byId[d.killer] : null;
    g.dead = true;
    g.stats.timeAlive += g.clock - (g.lifeStart || 0);
    g.stats.bestGrowth = Math.max(g.stats.bestGrowth, d.growth);
    const cause = killer ? D.species(killer).name : (d.hunger <= 0 ? 'starvation' : d.thirst <= 0 ? 'thirst' : 'wounds');
    g.stats.deathsBy[cause] = (g.stats.deathsBy[cause] || 0) + 1;
    g.deathInfo = {
      growth: d.growth, sp: d.sp, killer: killer ? killer.name : null,
      killerSp: killer ? killer.sp : null, killerWhale: killer ? !!killer.whale : false,
      cause, lived: g.clock - (g.lifeStart || 0), kills: d.kills
    };
    M.onDeath(g);
    Idle.bankRun(g, g.runPeak || d.growth);
    g.runPeak = 0;
    g.respawn = { t: M.respawnSecs(g) };
    feed(g, `You died — ${D.label(d)} (${Math.round(d.growth * 100)}%). ${killer ? 'Killed by ' + killer.name + '.' : cause + '.'}`, 'bad');
  }

  /* Revive: an item you hold, or Dinollars on the spot. It is the most
   * valuable thing in the shop, because it is the only thing that undoes a
   * death — growth, mutations and all. */
  function revive(g, how) {
    const d = g.player;
    if (!d || !g.dead) return false;
    if (how === 'item') {
      if (M.itemCount(g, 'revive') <= 0) return false;
      g.acct.items.revive--;
      g.acct.revivesUsed++;
    } else if (how === 'dino') {
      if (!M.spend(g, ISLE.store.ITEMS.revive.cost, 'Revives')) return false;
      g.acct.revivesUsed++;
    } else return false;

    d.alive = true;
    d.hp = D.maxHp(d);
    d.hunger = Math.max(d.hunger, 55);
    d.thirst = Math.max(d.thirst, 55);
    D.clearWounds(d);
    d.buffs.armor = { v: 0.5, t: 6 };            // brief mercy window
    d.usedUndying = false;
    g.dead = false;
    g.respawn = null;
    g.runPeak = d.growth;
    g.acct.deathStreak = Math.max(0, g.acct.deathStreak - 1);
    feed(g, 'Revived where you fell, at full size, with every mutation intact.', 'buy');
    return true;
  }

  function respawnNow(g, spId) {
    const growth = M.spawnGrowth(g);
    const sp = spId || (g.player ? g.player.sp : 'fernback');
    // Drop the corpse from the roster before the new animal is added.
    g.dinos = g.dinos.filter(x => x !== g.player);
    ISLE.state.spawnPlayer(g, sp, growth);
    M.onSpawn(g);
    feed(g, `You hatch in ${W.regionName(g.world, g.player.x, g.player.y)}.`, 'info');
    return g.player;
  }

  /* Timers that must keep running even while the world is held still: the
   * respawn countdown ticks behind the death sheet, and deals expire whether
   * or not anyone is looking at them. */
  function tickTimers(g, dt) {
    if (g.respawn) g.respawn.t -= dt;
    M.tickDeals(g);
  }

  // --- the tick -----------------------------------------------------------
  function update(g, dt, input) {
    /* A draft stops the world. Choosing a mutation is a real decision and it
     * should not be taken with something walking up behind you — and on a
     * phone, a choice made under time pressure is a choice made badly. */
    if (g.draft) { Idle.tick(g, dt * M.exchangeMult(g)); return; }
    dt = Math.min(dt, 0.06);
    g.clock += dt;
    g.stats.timeTotal += dt;
    g.day = 1 + Math.floor(g.clock / C.DAY_LENGTH);

    Idle.tick(g, dt * M.exchangeMult(g));
    W.tickNodes(g.world, dt);
    K.tickCarcasses(g, dt);
    tickCalls(g, dt);

    A.maintain(g, dt);
    A.autoGroup(g);
    A.tickGroups(g);

    for (const d of g.dinos) {
      if (!d.alive) continue;
      if (d.player) {
        /* Normally the player steers. If the player's dinosaur has been given
         * a brain instead — which is how the balance harness plays both sides
         * of the shop — it runs on exactly the same code as the lobby. */
        if (input) D.steer(g, d, input, dt);
        else if (d.ai) { A.think(g, d, dt); A.act(g, d, dt); }
      } else {
        A.think(g, d, dt);
        A.act(g, d, dt);
      }
      D.tickNeeds(g, d, dt);
    }

    D.separate(g, g.dinos.filter(d => d.alive));

    /* Mutation milestones, and the run's high-water mark — the number that
     * banks specimens into the Exchange when this life ends. */
    if (g.player && g.player.alive) {
      g.runPeak = Math.max(g.runPeak || 0, g.player.growth);
      const mi = MU.pending(g.player);
      if (mi >= 0 && !g.draft) {
        g.draft = { at: mi, opts: MU.offer(g.player, mi).map(m => m.id), rerolls: 0 };
      }
    }

    // Reap the dead: bodies stay as carcasses, the roster does not.
    for (let i = g.dinos.length - 1; i >= 0; i--) {
      const d = g.dinos[i];
      if (d.alive) continue;
      if (d.player) { if (!g.dead) handleDeath(g); continue; }
      if (!d.reaped) { d.reaped = true; if (!d.killer) K.makeCarcass(g, d); }
      if (g.clock - (d.diedAt || g.clock) > 1.5) g.dinos.splice(i, 1);
    }
    ISLE.state.reindex(g);

    // Staying alive pays, slowly. It is the free player's only income.
    if (!g.dead && g.player && g.player.alive) {
      g.__surviveAcc = (g.__surviveAcc || 0) + dt;
      if (g.__surviveAcc >= 60) {
        g.__surviveAcc -= 60;
        M.addBones(g, ISLE.store.BONES_PER.survive60s);
        M.addXp(g, ISLE.store.XP_PER.survive60s);
      }
    }
  }

  /* The server list: everything alive, biggest first. The diamond next to a
   * name is not decoration — it is the third of the lobby with the shop
   * working for them. */
  function leaderboard(g, n) {
    return g.dinos
      .filter(d => d.alive)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, n || 10)
      .map(d => ({
        name: d.name, sp: d.sp, growth: d.growth, whale: !!d.whale,
        you: !!d.player, kills: d.kills, label: D.label(d)
      }));
  }

  /* Everything close enough to matter, for the threat readout. */
  function threats(g) {
    const d = g.player;
    if (!d || !d.alive) return [];
    const out = [];
    for (const o of g.dinos) {
      if (o === d || !o.alive) continue;
      if (!D.canSee(g, d, o)) continue;
      const m = K.matchup(d, o);
      out.push({ d: o, dist: dist(d.x, d.y, o.x, o.y), edge: m });
    }
    return out.sort((a, b) => a.dist - b.dist).slice(0, 6);
  }

  ISLE.sim = {
    update, feed, emitCall, playerBite, playerInteract, interactHint, playerCall,
    handleDeath, revive, respawnNow, leaderboard, threats, takeMutation,
    rerollDraft, tickTimers
  };
})(window.ISLE = window.ISLE || {});
