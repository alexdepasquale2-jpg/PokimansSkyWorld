/* Coremind — thirty mutations. Not observed in the wild: earned.
 *
 * These sit in the same six designer slots as ordinary traits, but they
 * stay locked until an achievement or quest hands them over. Each one has
 * a real tradeoff and, where the name promises a trick, a behaviour the
 * simulation actually runs.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const MUTATIONS = [
    // -- BODY --------------------------------------------------------------
    { id: 'amphibious', name: 'Amphibious Skin', category: 'BODY',
      description: 'Moves through water almost as well as land. Slightly slower on dry ground.',
      stat_modifiers: { speed: -2, water_requirement: -0.08 }, energy_cost: 5, biomass_cost: 8,
      compatibility: ['saltblood'], incompatibility: ['hover_glide'],
      visual_modifier: 'lean', behavior_modifier: 'amphibious',
      unlock: 'first_drink' },
    { id: 'pack_stride', name: 'Pack Stride', category: 'BODY',
      description: 'Gains speed when two or more colony-mates are nearby.',
      stat_modifiers: { speed: 4, metabolism: 2 }, energy_cost: 5, biomass_cost: 8,
      compatibility: ['pack_rend', 'hive_mind'], incompatibility: [],
      visual_modifier: 'legs', behavior_modifier: 'pack_stride',
      unlock: 'first_band' },
    { id: 'iron_sinew', name: 'Iron Sinew', category: 'BODY',
      description: 'Hauls more biomass home. Heavier, hungrier, harder to drop.',
      stat_modifiers: { health: 10, speed: -3, metabolism: 3 }, energy_cost: 6, biomass_cost: 11,
      compatibility: ['keratin_plates'], incompatibility: ['hover_glide'],
      visual_modifier: 'legs', behavior_modifier: 'iron_sinew',
      unlock: 'first_stores' },
    { id: 'hover_glide', name: 'Hover Glide', category: 'BODY',
      description: 'Skims terrain. Mountains and marsh barely slow it. Fragile.',
      stat_modifiers: { speed: 8, defense: -6, size: -2 }, energy_cost: 7, biomass_cost: 10,
      compatibility: ['fast_movement'], incompatibility: ['armor', 'iron_sinew', 'amphibious'],
      visual_modifier: 'streamlined', behavior_modifier: 'hover_glide',
      unlock: 'three_biomes' },
    { id: 'seismic_step', name: 'Seismic Step', category: 'BODY',
      description: 'Each step is a pick. Digs faster; walks slower.',
      stat_modifiers: { digging: 22, speed: -4, defense: 4 }, energy_cost: 6, biomass_cost: 10,
      compatibility: ['burrowing', 'echolocation'], incompatibility: ['hover_glide'],
      visual_modifier: 'digger', behavior_modifier: 'seismic_step',
      unlock: 'first_shaft' },

    // -- SENSE -------------------------------------------------------------
    { id: 'thermorecept', name: 'Thermoreception', category: 'SENSE',
      description: 'Reads heat. Threats in the wrong climate light up sooner.',
      stat_modifiers: { sense_radius: 6, vision: 3 }, energy_cost: 4, biomass_cost: 7,
      compatibility: ['heat_resistance', 'geothermal_gut'], incompatibility: [],
      visual_modifier: 'antennae', behavior_modifier: 'early_warning',
      unlock: 'feel_the_heat' },
    { id: 'echolocation', name: 'Echolocation', category: 'SENSE',
      description: 'Clicks through rock. Underground sense ignores walls.',
      stat_modifiers: { sense_radius: 8, vision: -4 }, energy_cost: 5, biomass_cost: 8,
      compatibility: ['seismic_step', 'burrowing'], incompatibility: [],
      visual_modifier: 'whiskers', behavior_modifier: 'sense_through_walls',
      unlock: 'settle_shallow' },
    { id: 'prey_focus', name: 'Prey Focus', category: 'SENSE',
      description: 'Wounded targets take more damage. Healthy ones, less interest.',
      stat_modifiers: { attack: 4, vision: 4 }, energy_cost: 5, biomass_cost: 8,
      compatibility: ['constrict', 'pack_rend'], incompatibility: [],
      visual_modifier: 'eyes', behavior_modifier: 'prey_focus',
      unlock: 'first_blood' },
    { id: 'night_sight', name: 'Night Sight', category: 'SENSE',
      description: 'Sees clearly in Deep Cold and frost. Weaker under High Sun.',
      stat_modifiers: { vision: 8, sense_radius: 4 }, energy_cost: 4, biomass_cost: 7,
      compatibility: ['cold_resistance'], incompatibility: ['phototroph'],
      visual_modifier: 'eyes', behavior_modifier: 'night_sight',
      unlock: 'deep_cold' },
    { id: 'hive_mind', name: 'Hive Mind', category: 'SENSE',
      description: 'Borrows a neighbour\'s eyes. Sense grows with nearby allies.',
      stat_modifiers: { sense_radius: 5, metabolism: 3 }, energy_cost: 6, biomass_cost: 9,
      compatibility: ['pack_stride', 'brood_care'], incompatibility: [],
      visual_modifier: 'antennae', behavior_modifier: 'hive_mind',
      unlock: 'a_people' },

    // -- METABOLISM --------------------------------------------------------
    { id: 'phototroph', name: 'Phototroph', category: 'METABOLISM',
      description: 'Drinks sunlight on the surface. Poor fighter. Starves in the deep.',
      stat_modifiers: { metabolism: -8, attack: -6, water_requirement: -0.1 }, energy_cost: 5, biomass_cost: 9,
      compatibility: ['efficient_metabolism'], incompatibility: ['night_sight', 'geothermal_gut'],
      visual_modifier: 'warm_hued', behavior_modifier: 'phototroph',
      unlock: 'sun_forage' },
    { id: 'hibernation', name: 'Hibernation', category: 'METABOLISM',
      description: 'Cold barely bites. When it does, the organism almost stops.',
      stat_modifiers: { temperature_tolerance: 10, metabolism: -6, speed: -3 }, energy_cost: 5, biomass_cost: 8,
      compatibility: ['cold_resistance'], incompatibility: ['heat_resistance'],
      visual_modifier: 'cool_hued', behavior_modifier: 'hibernation',
      unlock: 'cold_snap' },
    { id: 'saltblood', name: 'Saltblood', category: 'METABOLISM',
      description: 'Thirst climbs slowly. Open water of any kind will do.',
      stat_modifiers: { water_requirement: -0.22, temperature_tolerance: 4 }, energy_cost: 4, biomass_cost: 8,
      compatibility: ['amphibious'], incompatibility: [],
      visual_modifier: 'lean', behavior_modifier: 'saltblood',
      unlock: 'first_drink' },
    { id: 'fermenter', name: 'Fermenter Gut', category: 'METABOLISM',
      description: 'Breaks down defended plants. Toxins and thorns barely register.',
      stat_modifiers: { metabolism: 4, health: 6 }, energy_cost: 5, biomass_cost: 9,
      compatibility: ['toxin_sink'], incompatibility: [],
      visual_modifier: 'lean', behavior_modifier: 'fermenter',
      unlock: 'bitter_meal' },
    { id: 'geothermal_gut', name: 'Geothermal Gut', category: 'METABOLISM',
      description: 'Feeds on deep heat. Uncomfortable on the surface.',
      stat_modifiers: { metabolism: -6, temperature_tolerance: -4 }, energy_cost: 6, biomass_cost: 10,
      compatibility: ['thermorecept', 'heat_resistance'], incompatibility: ['phototroph'],
      visual_modifier: 'warm_hued', behavior_modifier: 'geothermal_gut',
      unlock: 'tap_the_well' },

    // -- DEFENSE -----------------------------------------------------------
    { id: 'thorn_hide', name: 'Thorn Hide', category: 'DEFENSE',
      description: 'Attackers take a cut back. Slows the wearer.',
      stat_modifiers: { defense: 10, speed: -4, armor: 6 }, energy_cost: 6, biomass_cost: 11,
      compatibility: ['armor', 'keratin_plates'], incompatibility: ['camouflage'],
      visual_modifier: 'shell', behavior_modifier: 'thorn_hide',
      unlock: 'first_wounds' },
    { id: 'toxin_sink', name: 'Toxin Sink', category: 'DEFENSE',
      description: 'Absorbs venom and bog toxins. Hungrier for the privilege.',
      stat_modifiers: { health: 8, metabolism: 5 }, energy_cost: 5, biomass_cost: 9,
      compatibility: ['fermenter', 'venom'], incompatibility: [],
      visual_modifier: 'veined', behavior_modifier: 'toxin_sink',
      unlock: 'poisoned' },
    { id: 'molt', name: 'Emergency Molt', category: 'DEFENSE',
      description: 'Once, when near death, sheds a skin and heals.',
      stat_modifiers: { health: 4, metabolism: 4 }, energy_cost: 6, biomass_cost: 10,
      compatibility: ['regeneration'], incompatibility: [],
      visual_modifier: 'mottled', behavior_modifier: 'molt',
      unlock: 'near_death' },
    { id: 'spore_cloud', name: 'Spore Cloud', category: 'DEFENSE',
      description: 'Fleeing drops a cloud that slows whoever is chasing.',
      stat_modifiers: { camouflage: 8, speed: 2 }, energy_cost: 5, biomass_cost: 8,
      compatibility: ['camouflage'], incompatibility: [],
      visual_modifier: 'mottled', behavior_modifier: 'spore_cloud',
      unlock: 'learned_to_run' },
    { id: 'keratin_plates', name: 'Keratin Plates', category: 'DEFENSE',
      description: 'Hard plates that blunt acid and piercing. Stiff.',
      stat_modifiers: { armor: 16, defense: 8, speed: -5 }, energy_cost: 6, biomass_cost: 12,
      compatibility: ['iron_sinew', 'thorn_hide'], incompatibility: ['fast_movement'],
      visual_modifier: 'shell', behavior_modifier: 'keratin_plates',
      unlock: 'first_redoubt' },

    // -- OFFENSE -----------------------------------------------------------
    { id: 'constrict', name: 'Constrict', category: 'OFFENSE',
      description: 'Crushes anything slower than itself.',
      stat_modifiers: { attack: 10, speed: -2 }, energy_cost: 6, biomass_cost: 10,
      compatibility: ['prey_focus'], incompatibility: [],
      visual_modifier: 'jaws', behavior_modifier: 'constrict',
      unlock: 'five_kills' },
    { id: 'bone_spike', name: 'Bone Spike', category: 'OFFENSE',
      description: 'A spike that finds gaps in armour.',
      stat_modifiers: { attack: 12 }, energy_cost: 6, biomass_cost: 10,
      compatibility: ['claws'], incompatibility: ['venom'],
      visual_modifier: 'claws', behavior_modifier: 'armor_pierce',
      unlock: 'first_extract' },
    { id: 'parasitic', name: 'Parasitic Bite', category: 'OFFENSE',
      description: 'Steals health on contact. Breeds poorly.',
      stat_modifiers: { attack: 8, reproduction_rate: -0.06 }, energy_cost: 6, biomass_cost: 11,
      compatibility: ['venom'], incompatibility: ['prolific_broodsac'],
      visual_modifier: 'venom_glands', behavior_modifier: 'parasitic',
      unlock: 'rival_blood' },
    { id: 'shock', name: 'Shock Sac', category: 'OFFENSE',
      description: 'A hit stuns. The target crawls for a moment.',
      stat_modifiers: { attack: 7, energyMax: -4 }, energy_cost: 7, biomass_cost: 11,
      compatibility: ['acid'], incompatibility: [],
      visual_modifier: 'acid_sacs', behavior_modifier: 'shock',
      unlock: 'deep_kill' },
    { id: 'pack_rend', name: 'Pack Rend', category: 'OFFENSE',
      description: 'Tears harder when allies are in the fight.',
      stat_modifiers: { attack: 8 }, energy_cost: 6, biomass_cost: 10,
      compatibility: ['pack_stride', 'prey_focus'], incompatibility: [],
      visual_modifier: 'claws', behavior_modifier: 'pack_rend',
      unlock: 'five_kills' },

    // -- REPRODUCTION ------------------------------------------------------
    { id: 'split_clone', name: 'Split Clone', category: 'REPRODUCTION',
      description: 'On death, a weaker copy sometimes crawls free.',
      stat_modifiers: { reproduction_rate: 0.08, size: -2, health: -6 }, energy_cost: 7, biomass_cost: 12,
      compatibility: ['regeneration'], incompatibility: ['caste_morph'],
      visual_modifier: 'brood_sac', behavior_modifier: 'split_clone',
      unlock: 'first_design' },
    { id: 'brood_care', name: 'Brood Care', category: 'REPRODUCTION',
      description: 'Young nearby heal and come off cooldown faster.',
      stat_modifiers: { reproduction_rate: 0.1, metabolism: 3 }, energy_cost: 5, biomass_cost: 9,
      compatibility: ['hive_mind', 'prolific_broodsac'], incompatibility: [],
      visual_modifier: 'brood_sac', behavior_modifier: 'brood_care',
      unlock: 'first_nursery' },
    { id: 'delayed_spawn', name: 'Delayed Spawn', category: 'REPRODUCTION',
      description: 'A birth leaves an egg that hatches a few seconds later.',
      stat_modifiers: { reproduction_rate: 0.12, metabolism: 4 }, energy_cost: 6, biomass_cost: 10,
      compatibility: ['spore_cast'], incompatibility: [],
      visual_modifier: 'brood_sac', behavior_modifier: 'delayed_spawn',
      unlock: 'three_births' },
    { id: 'spore_cast', name: 'Spore Cast', category: 'REPRODUCTION',
      description: 'Births a drifting spore that becomes an organism if it lives.',
      stat_modifiers: { reproduction_rate: 0.1, size: -3 }, energy_cost: 6, biomass_cost: 10,
      compatibility: ['delayed_spawn', 'phototroph'], incompatibility: [],
      visual_modifier: 'brood_sac', behavior_modifier: 'spore_cast',
      unlock: 'settle_spore' },
    { id: 'caste_morph', name: 'Caste Morph', category: 'REPRODUCTION',
      description: 'Offspring of a digger are born already knowing the rock.',
      stat_modifiers: { reproduction_rate: 0.06, digging: 6 }, energy_cost: 6, biomass_cost: 11,
      compatibility: ['seismic_step', 'burrowing'], incompatibility: ['split_clone'],
      visual_modifier: 'digger', behavior_modifier: 'caste_morph',
      unlock: 'cut_descent' }
  ];

  const BY_ID = {};
  for (const m of MUTATIONS) BY_ID[m.id] = m;

  function register() {
    const T = CM.traits;
    if (!T || T.__mutationsIn) return;
    T.__mutationsIn = true;
    for (const m of MUTATIONS) {
      m.mutation = true;
      T.TRAITS.push(m);
      T.TRAITS_BY_ID[m.id] = m;
      (T.TRAITS_BY_CATEGORY[m.category] || (T.TRAITS_BY_CATEGORY[m.category] = [])).push(m);
    }
  }

  function unlocked(game, id) {
    return !!(game.progress && game.progress.mutations && game.progress.mutations[id]);
  }

  function unlock(game, bus, id, silent) {
    if (!game.progress) return false;
    if (game.progress.mutations[id]) return false;
    const m = BY_ID[id];
    if (!m) return false;
    game.progress.mutations[id] = game.simTime || 1;
    if (game.discovery) game.discovery.discoveredTraits[id] = true;
    if (!silent && bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'discovery', icon: '\u{1F9EC}',
        message: `Mutation unlocked: ${m.name}. It can be designed into a genome.`,
        traitId: id
      });
    }
    return true;
  }

  function allyCount(game, org, radius) {
    let n = 0;
    const near = game.world.grid.queryRadius(org.x, org.y, radius, []);
    for (const o of near) {
      if (o === org || !o.alive || o.ownerId !== org.ownerId) continue;
      if ((o.depth || 0) !== (org.depth || 0)) continue;
      n++;
    }
    return n;
  }

  function carryCap(org) {
    return org.behaviors && org.behaviors.has('iron_sinew') ? 34 : 22;
  }

  function moveMul(world, org) {
    let m = 1;
    const water = CM.world.isWaterAt(world, org.x, org.y);
    if (org.behaviors.has('amphibious') && water) m *= 2.1;
    if (org.behaviors.has('amphibious') && !water) m *= 0.92;
    if (org.behaviors.has('hover_glide')) m *= 1.35;
    if (org.behaviors.has('hibernation') && world.temp) {
      const t = CM.world.tempAt(world, org.x, org.y);
      if (t < 4) m *= 0.62;
    }
    if (org.behaviors.has('pack_stride')) {
      /* allyCount needs a game; callers that have game set __allyN. */
      if ((org.__allyN || 0) >= 2) m *= 1.22;
    }
    if (org.behaviors.has('night_sight') && world.climateOffset < -4) m *= 1.08;
    return m;
  }

  function onMelee(game, org, target, dt, dmg) {
    if (org.behaviors.has('prey_focus') && target.health < target.stats.health * 0.5) dmg *= 1.24;
    if (org.behaviors.has('constrict') && (org.stats.speed || 0) > (target.stats.speed || 0)) dmg *= 1.2;
    if (org.behaviors.has('pack_rend') && (org.__allyN || 0) >= 1) dmg *= 1.18;
    if (org.behaviors.has('keratin_plates') && target.behaviors && target.behaviors.has('armor_pierce')) {
      /* plates blunt the pierce the attacker already applied; handled in sim. */
    }
    if (org.behaviors.has('parasitic')) {
      org.health = Math.min(org.stats.health, org.health + dmg * 0.35);
    }
    if (org.behaviors.has('shock') && Math.random() < 0.22 * dt * 10) {
      target.__stun = Math.max(target.__stun || 0, 1.4);
    }
    if (target.behaviors && target.behaviors.has('thorn_hide')) {
      org.health -= dmg * 0.28;
    }
    if (target.behaviors && target.behaviors.has('toxin_sink') && org.behaviors.has('damage_over_time')) {
      dmg *= 0.55;
    }
    return dmg;
  }

  function tickOrg(game, org, dt) {
    if (!org.behaviors || org.behaviors.size === 0) return;
    org.__allyN = (org.behaviors.has('pack_stride') || org.behaviors.has('pack_rend') || org.behaviors.has('hive_mind') || org.behaviors.has('brood_care'))
      ? allyCount(game, org, 7) : 0;

    if (org.behaviors.has('phototroph') && (org.depth || 0) === 0) {
      org.energy = Math.min(org.stats.energyMax, org.energy + 1.8 * dt);
      org.hunger = Math.max(0, org.hunger - 1.1 * dt);
    }
    if (org.behaviors.has('geothermal_gut') && (org.depth || 0) >= 3) {
      org.energy = Math.min(org.stats.energyMax, org.energy + 2.2 * dt);
      org.hunger = Math.max(0, org.hunger - 0.8 * dt);
    }
    if (org.behaviors.has('saltblood')) {
      org.thirst = Math.max(0, org.thirst - 0.35 * dt);
    }
    if (org.behaviors.has('molt') && !org.__molted && org.health < org.stats.health * 0.28) {
      org.__molted = true;
      org.health = Math.min(org.stats.health, org.health + org.stats.health * 0.45);
    }
    if (org.behaviors.has('spore_cloud') && org.state === 'FLEE' && !org.__sporeAt) {
      org.__sporeAt = game.simTime;
      org.__sporeX = org.x; org.__sporeY = org.y; org.__sporeD = org.depth || 0;
    }
    if (org.__sporeAt && game.simTime - org.__sporeAt < 5) {
      const near = game.world.grid.queryRadius(org.__sporeX, org.__sporeY, 4, []);
      for (const o of near) {
        if (!o.alive || o.ownerId === org.ownerId) continue;
        if ((o.depth || 0) !== org.__sporeD) continue;
        o.__stun = Math.max(o.__stun || 0, 0.4);
      }
    }
    if (org.behaviors.has('brood_care') && org.__allyN > 0) {
      const near = game.world.grid.queryRadius(org.x, org.y, 6, []);
      for (const o of near) {
        if (!o.alive || o.ownerId !== org.ownerId) continue;
        if (o.generation > 1 || o.age < 40) {
          o.health = Math.min(o.stats.health, o.health + o.stats.health * 0.03 * dt);
          if (o.reproCooldown > 0) o.reproCooldown -= 0.8 * dt;
        }
      }
    }
    if (org.behaviors.has('hive_mind') && org.__allyN > 0) {
      org.__hiveBonus = 1 + Math.min(0.4, org.__allyN * 0.08);
    } else org.__hiveBonus = 1;
    if (org.__stun > 0) org.__stun -= dt;
  }

  function onDeath(game, bus, org) {
    if (!org.behaviors) return;
    if (org.behaviors.has('split_clone') && org.ownerId === 'player' && Math.random() < 0.55) {
      if (game.organisms.length >= 220) return;
      const child = CM.organism.create({
        ownerId: org.ownerId,
        traits: org.traits.filter(id => id !== 'split_clone'),
        x: org.x + (Math.random() - 0.5), y: org.y + (Math.random() - 0.5),
        name: (org.name || 'Clone') + '-split',
        generation: (org.generation || 1) + 1,
        directive: org.directive
      });
      child.health = child.stats.health * 0.45;
      child.depth = org.depth || 0;
      CM.coremind.addOrganism(game, child);
      if (bus) {
        CM.discovery.pushEvent(game, bus, {
          kind: 'system', icon: '\u{1F9EC}',
          message: `${org.name} split — a weaker copy crawled free.`,
          x: child.x, y: child.y, orgId: child.id
        });
      }
    }
  }

  function onBirth(game, parent, child) {
    if (!parent.behaviors) return;
    if (parent.behaviors.has('caste_morph') && (parent.stats.digging || 0) > 8) {
      child.stats = Object.assign({}, child.stats, { digging: (child.stats.digging || 0) + 14 });
    }
    if (parent.behaviors.has('delayed_spawn')) {
      game.__eggs = game.__eggs || [];
      game.__eggs.push({
        at: game.simTime + 7, ownerId: parent.ownerId, traits: parent.traits.slice(),
        x: parent.x, y: parent.y, depth: parent.depth || 0,
        directive: parent.directive, name: (parent.name || 'Egg') + '-late'
      });
    }
    if (parent.behaviors.has('spore_cast')) {
      game.__eggs = game.__eggs || [];
      game.__eggs.push({
        at: game.simTime + 11, ownerId: parent.ownerId, traits: parent.traits.slice(),
        x: parent.x + (Math.random() - 0.5) * 4, y: parent.y + (Math.random() - 0.5) * 4,
        depth: parent.depth || 0, directive: parent.directive, name: (parent.name || 'Spore') + '-spore'
      });
    }
  }

  function tickEggs(game) {
    const eggs = game.__eggs;
    if (!eggs || !eggs.length) return;
    for (let i = eggs.length - 1; i >= 0; i--) {
      const e = eggs[i];
      if (game.simTime < e.at) continue;
      eggs.splice(i, 1);
      if (game.organisms.length >= 220) continue;
      const child = CM.organism.create({
        ownerId: e.ownerId, traits: e.traits, x: e.x, y: e.y,
        name: e.name, generation: 2, directive: e.directive
      });
      child.depth = e.depth || 0;
      child.health = child.stats.health * 0.7;
      CM.coremind.addOrganism(game, child);
    }
  }

  register();

  CM.mutations = {
    MUTATIONS, BY_ID, register, unlocked, unlock,
    allyCount, carryCap, moveMul, onMelee, tickOrg, onDeath, onBirth, tickEggs
  };
})(window.CM = window.CM || {});
