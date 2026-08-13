/* Coremind — the simulation: ties world + organisms + ai together into one
 * fixed-step tick. Runs at a modest fixed rate (see main.js) independent of
 * render framerate, with LOD bands so cost stays bounded regardless of how
 * many organisms are alive.
 */
(function (CM) {
  'use strict';
  const K = CM.core;
  const W = CM.world;
  const O = CM.organism;
  const T = CM.traits;
  const D = CM.discovery;
  const S = O.AI_STATE;

  const MAX_ACTIVE = 500;
  const NEAR_R = 45, MID_R = 115;
  const SPEED_DIV = 9;             // stat speed -> cells/sec
  const ARRIVE_DIST = 0.65;
  const ATTACK_RANGE = 1.35;
  const ATTACK_LEASH = 2.4;
  const HUNT_GIVEUP = 12;
  const MAX_CARRY = 22;
  const PREY_TARGET = 70, PRED_TARGET = 22, MIN_PREY_FOR_PRED = 14;
  const WILD_CAP = 380;
  const PLAYER_REPRO_SOFT_CAP = 60;

  // -- population seeding ---------------------------------------------------
  function randomLandSpot(world, minDistFromCore, maxTries) {
    for (let i = 0; i < maxTries; i++) {
      const x = Math.random() * world.size, y = Math.random() * world.size;
      const b = W.biomeAt(world, x, y);
      if (b === W.BIOME.WATER || b === W.BIOME.ROCK) continue;
      if (minDistFromCore && K.dist(x, y, world.coreSpawn.x, world.coreSpawn.y) < minDistFromCore) continue;
      return { x, y };
    }
    return { x: world.coreSpawn.x + (Math.random() - 0.5) * 20, y: world.coreSpawn.y + (Math.random() - 0.5) * 20 };
  }

  function spawnWildOne(game, speciesId, spot) {
    const sp = T.WILD_BY_ID[speciesId];
    const org = O.create({
      ownerId: 'wild', speciesId, name: sp.name, x: spot.x, y: spot.y,
      traits: sp.traits, diet: sp.diet, color: sp.color, directive: null
    });
    CM.coremind.addOrganism(game, org);
    return org;
  }

  function spawnStarterWildlife(game) {
    const preySpecies = T.WILD_SPECIES.filter(s => s.tier === 'prey').map(s => s.id);
    const predSpecies = T.WILD_SPECIES.filter(s => s.tier === 'predator').map(s => s.id);
    for (let i = 0; i < 40; i++) {
      spawnWildOne(game, K.pick(Math.random, preySpecies), randomLandSpot(game.world, 12, 60));
    }
    for (let i = 0; i < 10; i++) {
      spawnWildOne(game, K.pick(Math.random, predSpecies), randomLandSpot(game.world, 25, 60));
    }
  }

  function spawnStarterColony(game, bus) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 2;
      const org = O.create({
        ownerId: 'player', traits: [], name: 'Scout-' + (i + 1),
        x: game.core.x + Math.cos(a) * r, y: game.core.y + Math.sin(a) * r,
        directive: game.globalDirective
      });
      CM.coremind.addOrganism(game, org);
    }
    D.pushEvent(game, bus, { kind: 'system', icon: '\u{1F4E1}', message: 'Coremind established. Three starter organisms are ready for a directive.', x: game.core.x, y: game.core.y });
  }

  // -- sensing ----------------------------------------------------------------
  function isPredatorLike(org) {
    if (org.ownerId === 'wild') return T.WILD_BY_ID[org.speciesId].diet === 'carnivore';
    return org.ownerId === 'player' && (org.directive === 'HUNT' || org.directive === 'DEFEND');
  }
  function validHuntTarget(hunter, other) {
    if (other.ownerId === hunter.ownerId && hunter.ownerId === 'player') return false;
    if (hunter.ownerId === 'wild') {
      if (other.ownerId === 'player') return true;
      return other.ownerId === 'wild' && T.WILD_BY_ID[other.speciesId].tier === 'prey';
    }
    // player, directed to HUNT or defending
    return other.ownerId === 'wild';
  }
  function isThreatTo(org, other) {
    if (org.ownerId === 'player') return other.ownerId === 'wild' && T.WILD_BY_ID[other.speciesId].diet === 'carnivore';
    if (org.ownerId === 'wild' && T.WILD_BY_ID[org.speciesId].tier === 'prey') {
      return (other.ownerId === 'wild' && T.WILD_BY_ID[other.speciesId].diet === 'carnivore')
        || (other.ownerId === 'player' && (other.directive === 'HUNT'));
    }
    return false;
  }
  /* Camouflage/burrowing probabilistically keep an organism off a sensing
   * organism's radar — a mechanical payoff for those traits, not just flavour. */
  function isDetected(watcher, target) {
    const cam = target.stats.camouflage || 0;
    if (cam <= 0) return true;
    return Math.random() > cam / 140;
  }

  function gatherContext(game, org) {
    const near = game.world.grid.queryRadius(org.x, org.y, org.stats.sense_radius, []);
    let nearestThreat = null, nearestPrey = null, nearestCuriosity = null;
    let bestThreatD = Infinity, bestPreyD = Infinity, bestCurD = Infinity;
    const newSightings = [];

    for (const other of near) {
      if (other === org || !O.isAlive(other)) continue;
      const d = K.dist(org.x, org.y, other.x, other.y);
      if (!isDetected(org, other)) continue;

      if (isThreatTo(org, other) && d < bestThreatD) { bestThreatD = d; nearestThreat = { dist: d, entity: other }; }
      if (validHuntTarget(org, other) && d < bestPreyD) {
        const canHuntNow = org.ownerId === 'wild' ? isPredatorLike(org) : org.directive === 'HUNT';
        if (canHuntNow) { bestPreyD = d; nearestPrey = { dist: d, entity: other }; }
      }
      if (other.ownerId === 'wild' && !game.discovery.knownSpecies[other.speciesId]) newSightings.push({ speciesId: other.speciesId, x: other.x, y: other.y });
    }

    for (const sample of game.discovery.samples) {
      const d = K.dist(org.x, org.y, sample.x, sample.y);
      if (d <= org.stats.sense_radius && d < bestCurD) { bestCurD = d; nearestCuriosity = { dist: d, x: sample.x, y: sample.y, ref: sample }; }
    }

    const canEatPlants = org.diet !== 'carnivore';
    const canHunt = org.ownerId === 'wild' ? isPredatorLike(org) : org.directive === 'HUNT';
    const nearestFood = canEatPlants ? W.findNearestFood(game.world, org.x, org.y, org.stats.sense_radius, 4) : null;

    return { nearestThreat, nearestPrey, nearestFood, nearestCuriosity, canEatPlants, canHunt, newSightings, defendRadius: org.stats.sense_radius };
  }

  // -- movement ---------------------------------------------------------------
  function moveToward(org, tx, ty, dt, mul) {
    const dx = tx - org.x, dy = ty - org.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return 0;
    const desired = Math.atan2(dy, dx);
    org.heading = K.turnToward(org.heading, desired, 5 * dt);
    const spd = (org.stats.speed / SPEED_DIV) * (mul || 1);
    const step = Math.min(d, spd * dt);
    org.x += Math.cos(org.heading) * step;
    org.y += Math.sin(org.heading) * step;
    return d - step;
  }

  function pickWanderTarget(org, world, radius) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * radius;
      const x = K.clamp(org.x + Math.cos(a) * r, 1, world.size - 1);
      const y = K.clamp(org.y + Math.sin(a) * r, 1, world.size - 1);
      const b = W.biomeAt(world, x, y);
      if (b !== W.BIOME.WATER) return { x, y };
    }
    return { x: org.x, y: org.y };
  }

  // -- combat / death -----------------------------------------------------
  function resolveDeath(game, bus, victim, killer) {
    if (victim.ownerId === 'wild') {
      if (killer && killer.ownerId === 'player') {
        D.spawnSample(game, game.world, victim.x, victim.y, victim);
        D.recordEncounter(game, bus, killer, victim, 'wild_killed', victim.x, victim.y);
        killer.carrying = Math.min(MAX_CARRY, killer.carrying + 9 + victim.stats.size * 0.25);
      }
    } else {
      if (killer) D.recordEncounter(game, bus, victim, killer, 'player_killed', victim.x, victim.y);
    }
    CM.coremind.removeOrganism(game, victim);
  }

  function meleeTick(game, bus, org, dt) {
    const target = org.actionTarget && org.actionTarget.ref;
    if (!target || !O.isAlive(target)) { org.state = S.EXPLORE; org.actionTarget = null; org.aiCounter = 0; return; }
    const d = K.dist(org.x, org.y, target.x, target.y);
    if (d > ATTACK_LEASH) { org.state = S.HUNT; return; }

    const pierce = org.behaviors.has('armor_pierce') ? 0.5 : 1;
    const venomMul = org.behaviors.has('damage_over_time') ? 1.28 : 1;
    const effDef = target.stats.defense * pierce;
    const dmg = Math.max(1, org.stats.attack - effDef * 0.5) * venomMul * dt;
    target.health -= dmg;
    if (org.behaviors.has('passive_heal')) target.__attackedThisTick = true;

    const retaliates = (target.ownerId === 'wild' && T.WILD_BY_ID[target.speciesId].diet === 'carnivore')
      || (target.ownerId === 'player' && (target.directive === 'DEFEND' || target.directive === 'HUNT'));
    if (retaliates && target.health > 0) {
      const rEffDef = org.stats.defense;
      const rDmg = Math.max(1, target.stats.attack - rEffDef * 0.5) * dt;
      org.health -= rDmg;
    }

    if (target.health <= 0) { resolveDeath(game, bus, target, org); org.state = S.EXPLORE; org.actionTarget = null; org.aiCounter = 0; }
    if (org.health <= 0) resolveDeath(game, bus, org, target);
  }

  // -- per-organism step ------------------------------------------------------
  function executeState(game, bus, org, dt) {
    const world = game.world;
    switch (org.state) {
      case S.EXPLORE: {
        if (!org.actionTarget || K.dist(org.x, org.y, org.actionTarget.x, org.actionTarget.y) < ARRIVE_DIST) {
          const radius = (org.ownerId === 'player' && org.directive === 'EXPLORE') ? 26 : 10;
          org.actionTarget = pickWanderTarget(org, world, radius);
        }
        moveToward(org, org.actionTarget.x, org.actionTarget.y, dt, 0.55);
        break;
      }
      case S.SEEK_FOOD: {
        const tgt = org.actionTarget;
        if (!tgt) { org.state = S.EXPLORE; break; }
        const d = moveToward(org, tgt.x, tgt.y, dt, 0.8);
        if (d < ARRIVE_DIST) {
          const taken = W.consumeFood(world, tgt.x, tgt.y, 16);
          org.hunger = Math.max(0, org.hunger - taken * 3.2);
          org.energy = Math.min(org.stats.energyMax, org.energy + taken * 0.6);
          if (org.ownerId === 'player' && org.directive === 'GATHER') {
            org.carrying = Math.min(MAX_CARRY, org.carrying + taken * 0.5);
          }
          org.actionTarget = null; org.aiCounter = 0;
        }
        break;
      }
      case S.HUNT: {
        const tgt = org.actionTarget && org.actionTarget.ref;
        if (!tgt || !O.isAlive(tgt)) { org.state = S.EXPLORE; org.actionTarget = null; org.aiCounter = 0; break; }
        const d = K.dist(org.x, org.y, tgt.x, tgt.y);
        org.huntTimer = (org.huntTimer || 0) + dt;
        if (d <= ATTACK_RANGE) { org.state = S.ATTACK; org.huntTimer = 0; break; }
        if (org.huntTimer > HUNT_GIVEUP) { org.state = S.EXPLORE; org.actionTarget = null; org.aiCounter = 0; org.huntTimer = 0; break; }
        moveToward(org, tgt.x, tgt.y, dt, 1.05);
        break;
      }
      case S.ATTACK:
        meleeTick(game, bus, org, dt);
        break;
      case S.FLEE: {
        const away = org.actionTarget;
        if (away) {
          const a = Math.atan2(org.y - away.y, org.x - away.x);
          moveToward(org, org.x + Math.cos(a) * 6, org.y + Math.sin(a) * 6, dt, 1.15);
        }
        break;
      }
      case S.REST:
        org.energy = Math.min(org.stats.energyMax, org.energy + org.stats.energyMax * 0.08 * dt);
        org.health = Math.min(org.stats.health, org.health + org.stats.health * 0.02 * dt);
        break;
      case S.RETURN_TO_CORE: {
        const d = moveToward(org, game.core.x, game.core.y, dt, 1);
        if (d < game.core.radius) {
          if (org.carrying > 0) {
            CM.coremind.deposit(game, org.carrying, org.carrying * 0.25);
            org.carrying = 0;
          }
          org.aiCounter = 0;
        }
        break;
      }
      case S.REPRODUCE: {
        if (org.reproTimer == null) org.reproTimer = 3.5 + org.stats.size * 0.06;
        org.reproTimer -= dt;
        if (org.reproTimer <= 0) {
          attemptReproduce(game, bus, org);
          org.reproTimer = null; org.reproCooldown = 22 + Math.random() * 10; org.aiCounter = 0;
        }
        break;
      }
      case S.INVESTIGATE: {
        const tgt = org.actionTarget;
        if (!tgt) { org.state = S.EXPLORE; break; }
        const d = moveToward(org, tgt.x, tgt.y, dt, 0.7);
        if (d < ARRIVE_DIST) { org.directiveTarget = null; org.actionTarget = null; org.aiCounter = 0; }
        break;
      }
      default: break;
    }
  }

  function attemptReproduce(game, bus, org) {
    if (game.organisms.length >= MAX_ACTIVE) return;
    // Wild reproduction has its own soft ceiling (double the target density)
    // so the ecosystem plateaus instead of one tier filling the entire
    // active-organism cap and crowding out everything else, including the
    // player's own designs.
    if (org.ownerId === 'wild') {
      const tier = T.WILD_BY_ID[org.speciesId].tier;
      if (tier === 'prey' && game.stats.herbivorePop >= PREY_TARGET * 2) return;
      if (tier === 'predator' && game.stats.predatorPop >= PRED_TARGET * 2) return;
    } else if (game.stats.playerPop >= PLAYER_REPRO_SOFT_CAP) {
      // Auto-reproduction pauses once the colony is sizeable so it never
      // crowds out the wildlife or the player's own room to deploy fresh
      // designs — deliberate CREATE ORGANISM spend is never blocked by this.
      return;
    }
    org.energy -= org.stats.energyMax * 0.42;
    org.health -= org.stats.health * 0.08;
    const jitter = () => (Math.random() - 0.5) * 2.4;
    let traits = org.traits.slice();
    if (org.ownerId === 'wild' && Math.random() < 0.08) {
      const cat = K.pick(Math.random, T.CATEGORIES);
      const options = T.TRAITS_BY_CATEGORY[cat];
      if (options.length) traits = traits.filter(id => T.TRAITS_BY_ID[id].category !== cat).concat([K.pick(Math.random, options).id]);
    }
    const child = O.create({
      ownerId: org.ownerId, speciesId: org.speciesId, designId: org.designId,
      name: org.ownerId === 'player' ? org.name : org.name,
      traits, diet: org.diet, color: org.color,
      x: K.clamp(org.x + jitter(), 1, game.world.size - 1),
      y: K.clamp(org.y + jitter(), 1, game.world.size - 1),
      generation: org.generation + 1,
      directive: org.ownerId === 'player' ? org.directive : null
    });
    CM.coremind.addOrganism(game, child);
    return child;
  }

  // -- wild population maintenance --------------------------------------------
  function maybeSpawnWild(game, dt) {
    game.wildSpawnAcc = (game.wildSpawnAcc || 0) + dt;
    if (game.wildSpawnAcc < 1.4) return;
    game.wildSpawnAcc = 0;
    if (game.organisms.length >= MAX_ACTIVE) return;
    const wildCount = game.stats.herbivorePop + game.stats.predatorPop;
    if (wildCount >= WILD_CAP) return;

    if (game.stats.herbivorePop < PREY_TARGET && Math.random() < 0.55) {
      const species = T.WILD_SPECIES.filter(s => s.tier === 'prey').map(s => s.id);
      spawnWildOne(game, K.pick(Math.random, species), randomLandSpot(game.world, 8, 30));
    } else if (game.stats.predatorPop < PRED_TARGET && game.stats.herbivorePop > MIN_PREY_FOR_PRED && Math.random() < 0.28) {
      const species = T.WILD_SPECIES.filter(s => s.tier === 'predator').map(s => s.id);
      spawnWildOne(game, K.pick(Math.random, species), randomLandSpot(game.world, 20, 30));
    }
  }

  // -- main tick ----------------------------------------------------------
  function tick(game, bus, dt) {
    game.simTime += dt;

    W.tickFood(game.world, 3200);
    D.tickSamples(game, dt);
    maybeSpawnWild(game, dt);

    const camX = game.camera.x, camY = game.camera.y;
    let playerPop = 0, herbivorePop = 0, predatorPop = 0, plantTotal = 0;

    // Snapshot the roster before iterating: resolveDeath() splices
    // game.organisms as organisms die (natural causes below, or combat
    // inside executeState/meleeTick), and mutating an array mid-`for...of`
    // silently skips whatever shifts into the current index.
    const roster = game.organisms.slice();

    for (const org of roster) {
      if (!org.alive) continue; // already resolveDeath'd earlier this tick (e.g. to a faster predator)
      org.age += dt;

      const distCam = K.dist(org.x, org.y, camX, camY);
      org.lod = distCam < NEAR_R ? 'near' : distCam < MID_R ? 'mid' : 'far';

      // needs
      const metaRate = org.stats.metabolism / 11;
      org.hunger = K.clamp(org.hunger + metaRate * 1.05 * dt, 0, 100);
      const moving = org.state === S.EXPLORE || org.state === S.HUNT || org.state === S.FLEE || org.state === S.SEEK_FOOD || org.state === S.RETURN_TO_CORE;
      org.energy = K.clamp(org.energy - metaRate * (moving ? 0.9 : 0.35) * dt, 0, org.stats.energyMax);
      if (org.hunger >= 100) org.health -= org.stats.health * 0.03 * dt;
      if (org.energy <= 0) org.health -= org.stats.health * 0.015 * dt;

      const stress = O.tempStress(org, W.tempAt(game.world, org.x, org.y));
      if (stress > 1) org.health -= org.stats.health * 0.02 * (stress - 1) * dt;

      if (org.behaviors.has('passive_heal') && org.hunger < 85 && !org.__attackedThisTick) {
        org.health = Math.min(org.stats.health, org.health + org.stats.health * 0.045 * dt);
      }
      org.__attackedThisTick = false;

      if (org.reproCooldown > 0) org.reproCooldown -= dt;

      // AI re-decision, throttled by LOD
      org.aiCounter = (org.aiCounter || 0) - 1;
      if (org.aiCounter <= 0) {
        const interval = org.lod === 'near' ? 1 : org.lod === 'mid' ? 4 : 12;
        org.aiCounter = interval;
        const ctx = gatherContext(game, org);
        for (const s of ctx.newSightings) D.recordSighting(game, bus, s.speciesId, s.x, s.y);
        const decision = CM.ai.decide(org, ctx);
        const transitioning = decision.state !== org.state;
        if (transitioning) { org.state = decision.state; org.huntTimer = 0; }
        // A null target on an unchanged state (e.g. still EXPLORE) means
        // "nothing new to report" — keep whatever in-progress target
        // executeState is working toward instead of wiping it every
        // re-decision, which for a near-camera organism is every tick.
        if (decision.target !== null || transitioning) org.actionTarget = decision.target;
      }

      executeState(game, bus, org, dt);
      // Deliberately org.alive, not O.isAlive(): isAlive also factors in
      // health, which is true both for "combat already resolveDeath'd this
      // organism inside meleeTick" (alive=false — skip) and for "hunger/temp
      // damage above just dropped health to 0 and hasn't been resolved yet"
      // (alive still true — must fall through to the health<=0 check below,
      // or the organism becomes a permanent zombie: dead in every practical
      // sense but never removed from the roster).
      if (!org.alive) continue;

      org.x = K.clamp(org.x, 0.1, game.world.size - 0.1);
      org.y = K.clamp(org.y, 0.1, game.world.size - 0.1);
      game.world.grid.update(org);

      if (org.health <= 0) { resolveDeath(game, bus, org, null); continue; }

      if (org.ownerId === 'player') playerPop++;
      else {
        const sp = T.WILD_BY_ID[org.speciesId];
        if (sp && sp.tier === 'predator') predatorPop++; else herbivorePop++;
      }
    }

    for (let i = 0; i < game.world.food.length; i += 733) plantTotal += game.world.food[i]; // sampled estimate, cheap
    game.stats = { playerPop, herbivorePop, predatorPop, plantTotal: Math.round(plantTotal) };

    // slow passive core regeneration — the Coremind's own baseline metabolism
    game.core.energy = Math.min(999, game.core.energy + 0.9 * dt);

    narrateEcosystem(game, bus, dt);
  }

  /* The food web has to visibly react on its own, not just in the player's
   * organisms. Rather than scripting it, watch the population numbers the
   * simulation already produces and say something when they cross a
   * threshold — each flag latches so one crossing narrates once, not every
   * tick it stays crossed. */
  function narrateEcosystem(game, bus, dt) {
    const eco = game.eco || (game.eco = { acc: 0, prevHerb: 0, prevPred: 0, shortage: false, predSurge: false, herbCrash: false });
    eco.acc += dt;
    if (eco.acc < 16) return;
    eco.acc = 0;

    const s = game.stats;
    const plantFrac = K.clamp01(s.plantTotal / 3200);

    if (plantFrac < 0.18 && !eco.shortage) {
      eco.shortage = true;
      D.pushEvent(game, bus, { kind: 'warn', icon: '\u{1F342}', message: 'Food shortage detected — plant coverage is critically low.' });
    } else if (plantFrac > 0.35) eco.shortage = false;

    if (eco.prevPred > 4 && s.predatorPop > eco.prevPred * 1.4 && !eco.predSurge) {
      eco.predSurge = true;
      D.pushEvent(game, bus, { kind: 'warn', icon: '\u{1F43A}', message: 'Predator population increasing.' });
    } else if (s.predatorPop < eco.prevPred * 1.15) eco.predSurge = false;

    if (eco.prevHerb > 10 && s.herbivorePop < eco.prevHerb * 0.55 && !eco.herbCrash) {
      eco.herbCrash = true;
      D.pushEvent(game, bus, { kind: 'warn', icon: '\u{26A0}', message: 'Herbivore population crashing — predators will follow.' });
    } else if (s.herbivorePop > eco.prevHerb * 0.85) eco.herbCrash = false;

    eco.prevHerb = s.herbivorePop; eco.prevPred = s.predatorPop;
  }

  CM.simulation = {
    MAX_ACTIVE, tick, spawnStarterColony, spawnStarterWildlife, spawnWildOne, randomLandSpot, gatherContext
  };
})(window.CM = window.CM || {});
