/* Coremind — achievements, quests, and the counters they read.
 *
 * Quests are the tutor for the layer campaign. Achievements are the
 * trophies — and the only way mutations enter the designer.
 */
(function (CM) {
  'use strict';

  function newState() {
    return {
      mutations: {},
      achievements: {},
      quests: { active: 'foothold', done: {}, side: ['first_look'] },
      gathered: 0,
      drinks: 0,
      kills: 0,
      rivalKills: 0,
      deepKills: 0,
      births: 0,
      designs: 0,
      extracts: 0,
      flees: 0,
      biomes: {},
      wounded: false,
      nearDeath: false,
      poisoned: false,
      ateDefended: false,
      lastToastAt: -999,
      upgrades: 0,
      laborSet: false,
      crewPosted: false,
      districts: 0
    };
  }

  const ACHIEVEMENTS = [
    { id: 'first_drink', name: 'First Drink', icon: '\u{1F4A7}',
      blurb: 'An organism found water.', mutations: ['amphibious', 'saltblood'] },
    { id: 'first_band', name: 'A Band', icon: '\u{1F465}',
      blurb: 'Six living bodies. The colony is no longer a handful.', mutations: ['pack_stride'] },
    { id: 'first_stores', name: 'Stores', icon: '\u{1F33E}',
      blurb: 'Eighty biomass walked home.', mutations: ['iron_sinew'] },
    { id: 'three_biomes', name: 'Three Grounds', icon: '\u{1F5FA}',
      blurb: 'Your organisms stood in three different biomes.', mutations: ['hover_glide'] },
    { id: 'first_shaft', name: 'First Cut', icon: '\u{1F573}',
      blurb: 'An Access Shaft finished.', mutations: ['seismic_step'] },
    { id: 'feel_the_heat', name: 'Feel the Heat', icon: '\u{1F321}',
      blurb: 'Lived through a heatwave, or stood in a vent.', mutations: ['thermorecept'] },
    { id: 'settle_shallow', name: 'Shallow Works Held', icon: '\u{1F3E0}',
      blurb: 'Layer 1 is settled.', mutations: ['echolocation'] },
    { id: 'first_blood', name: 'First Blood', icon: '\u{1F3F9}',
      blurb: 'A wild organism died to one of yours.', mutations: ['prey_focus'] },
    { id: 'deep_cold', name: 'Deep Cold', icon: '\u{2744}',
      blurb: 'The season turned to Deep Cold and you were still here.', mutations: ['night_sight'] },
    { id: 'a_people', name: 'A People', icon: '\u{1F9EC}',
      blurb: 'Ten living Coremind organisms.', mutations: ['hive_mind'] },
    { id: 'sun_forage', name: 'Sun Forage', icon: '\u{2600}',
      blurb: 'Forty biomass gathered on the surface.', mutations: ['phototroph'] },
    { id: 'cold_snap', name: 'Cold Snap Lived', icon: '\u{2744}',
      blurb: 'A cold snap came and went.', mutations: ['hibernation'] },
    { id: 'bitter_meal', name: 'Bitter Meal', icon: '\u{1F33F}',
      blurb: 'Someone ate a defended plant and lived.', mutations: ['fermenter'] },
    { id: 'tap_the_well', name: 'Tap the Well', icon: '\u{1F30B}',
      blurb: 'A geothermal tap, or the Well, finished.', mutations: ['geothermal_gut'] },
    { id: 'first_wounds', name: 'First Wounds', icon: '\u{1F6E1}',
      blurb: 'An organism dropped below half health and lived.', mutations: ['thorn_hide'] },
    { id: 'poisoned', name: 'Poisoned', icon: '\u{2620}',
      blurb: 'Toxin or venom hit one of yours.', mutations: ['toxin_sink'] },
    { id: 'near_death', name: 'Near Death', icon: '\u{1F480}',
      blurb: 'An organism dropped below a quarter and lived.', mutations: ['molt'] },
    { id: 'learned_to_run', name: 'Learned to Run', icon: '\u{1F3C3}',
      blurb: 'Five successful flees.', mutations: ['spore_cloud'] },
    { id: 'first_redoubt', name: 'First Redoubt', icon: '\u{1F6E1}',
      blurb: 'A redoubt, bastion, citadel or keep finished.', mutations: ['keratin_plates'] },
    { id: 'five_kills', name: 'Five Kills', icon: '\u{2694}',
      blurb: 'Five wild kills.', mutations: ['constrict', 'pack_rend'] },
    { id: 'first_extract', name: 'First Extract', icon: '\u{1F9EA}',
      blurb: 'A sample was extracted.', mutations: ['bone_spike'] },
    { id: 'rival_blood', name: 'Rival Blood', icon: '\u{1F3C6}',
      blurb: 'A rival organism died to one of yours.', mutations: ['parasitic'] },
    { id: 'deep_kill', name: 'Deep Kill', icon: '\u{1F573}',
      blurb: 'A subterranean fauna died to one of yours.', mutations: ['shock'] },
    { id: 'first_design', name: 'First Design', icon: '\u{1F9EC}',
      blurb: 'You grew an organism from a draft.', mutations: ['split_clone'] },
    { id: 'first_nursery', name: 'First Nursery', icon: '\u{1F423}',
      blurb: 'A nursery finished.', mutations: ['brood_care'] },
    { id: 'three_births', name: 'Three Births', icon: '\u{1F95A}',
      blurb: 'Three of yours were born in the field.', mutations: ['delayed_spawn'] },
    { id: 'settle_spore', name: 'Spore March Held', icon: '\u{1F344}',
      blurb: 'Layer 4 is settled.', mutations: ['spore_cast'] },
    { id: 'cut_descent', name: 'The Descent', icon: '\u{2B07}',
      blurb: 'A Descent finished.', mutations: ['caste_morph'] },
    { id: 'first_upgrade', name: 'Raised Works', icon: '\u{26A1}',
      blurb: 'A finished chamber was raised a tier.', mutations: [] },
    { id: 'three_upgrades', name: 'Master Builder', icon: '\u{1F3D7}',
      blurb: 'Three chambers raised.', mutations: [] },
    { id: 'labor_set', name: 'Shift Boss', icon: '\u{1F4CB}',
      blurb: 'A layer labor mix was set.', mutations: [] },
    { id: 'crew_posted', name: 'Work Crew', icon: '\u{1F477}',
      blurb: 'A crew was assigned to a chamber.', mutations: [] },
    { id: 'first_district', name: 'A District', icon: '\u{1F5FA}',
      blurb: 'Construction influence formed a district.', mutations: [] },
    { id: 'first_thought', name: 'Think', icon: '\u{1F441}',
      blurb: 'You issued an order and time dilated. The chip reads THINK.', mutations: [] },
    { id: 'read_weather', name: 'Weather Map', icon: '\u{1F32A}',
      blurb: 'You toggled the weather overlay.', mutations: [] },
    { id: 'peel_earth', name: 'Go Underground', icon: '\u{1F573}',
      blurb: 'You viewed a dug layer.', mutations: [] },
    { id: 'smell_dark', name: 'Smell the Dark', icon: '\u{1F9EA}',
      blurb: 'Chemical sensing named something you could not see.', mutations: [] }
  ];
  const ACH_BY_ID = {};
  for (const a of ACHIEVEMENTS) ACH_BY_ID[a.id] = a;

  const QUESTS = {
    foothold: {
      title: 'Foothold',
      blurb: 'Forage the surface. Grow. Learn the ground. A shaft can wait.',
      hint: 'Gather, or grow to five living. The surface card tracks the foothold.',
      side: ['first_look'],
      next: 'sink_shaft'
    },
    sink_shaft: {
      title: 'Sink a Shaft',
      blurb: 'The underground starts with one hole. Site an Access Shaft and dig it out.',
      hint: 'BUILD → Access Shaft. Then order Dig, or garrison the pit.',
      next: 'cut_warren'
    },
    cut_warren: {
      title: 'Cut a Warren',
      blurb: 'Shelter first. A warren is how the works stay yours when the weather turns.',
      hint: 'From the shaft, place a Warren on Layer 1. Expand-from the shaft if the link misses.',
      next: 'hold_shallow'
    },
    hold_shallow: {
      title: 'Hold the Works',
      blurb: 'Walk Layer 1. Post bodies on the shaft. Finish two rooms. Let the hold fill.',
      hint: 'Stance: Settle. Garrison the shaft. The layer card is the checklist.',
      next: 'cut_descent'
    },
    cut_descent: {
      title: 'Cut the Descent',
      blurb: 'When the works are settled the galleries open. Cut down on purpose.',
      hint: 'Set Layer 1 stance to Push, then place a Descent.',
      next: 'feed_stack'
    },
    feed_stack: {
      title: 'Feed the Stack',
      blurb: 'A nursery or a fungarium is how the galleries live without the weather.',
      hint: 'Stance: Breed or Harvest on Layer 2. Place the role room.',
      next: 'hold_galleries'
    },
    hold_galleries: {
      title: 'Hold the Galleries',
      blurb: 'Settle Layer 2 before you chase heat. Post a redoubt if the rock answers.',
      hint: 'Stance: Fortify if fauna showed. Otherwise Settle until the card goes green.',
      next: 'tap_heat'
    },
    tap_heat: {
      title: 'Tap the Heat',
      blurb: 'The Well, then a geothermal tap or a vein. This is the first real engine.',
      hint: 'Push Layer 2, cut a Well, stance Harvest on Layer 3.',
      next: 'hold_and_post'
    },
    hold_and_post: {
      title: 'Hold and Post',
      blurb: 'Every deeper layer wants the same beat: role room, walk the ground, post a defense, then the next stair.',
      hint: 'Use stance per layer. Fortify 6 and 8. Harvest 4 and 7. The Gate waits on 9.',
      next: null
    }
  };

  const SIDE = {
    first_look: { title: 'Watch the Wild', blurb: 'Stand near a wild organism until a species is named.', hint: 'Explore. Sightings unlock the designer.' },
    first_sample: { title: 'Take a Sample', blurb: 'Kill something and extract what it leaves.', hint: 'Hunt, then tap the lime sample.' },
    design_one: { title: 'Design One', blurb: 'Open DNA and grow an organism with a discovered trait.', hint: 'ANALYZE shows what you have earned.' },
    post_two: { title: 'Post Two', blurb: 'Two of yours standing on a spine chamber.', hint: 'Select, Garrison the shaft or descent.' },
    fortify_door: { title: 'Fortify the Door', blurb: 'Fortify the Access Shaft before a climber uses it.', hint: 'Inspect the finished shaft → Fortify.' },
    raise_one: { title: 'Raise One', blurb: 'Upgrade a finished chamber. Rooms grow after they are cut.', hint: 'Inspect a finished warren → Raise.' },
    post_crew: { title: 'Post a Crew', blurb: 'Select organisms, inspect a chamber, assign them as its crew.', hint: 'They will dig, raise, or hold that room first.' },
    paint_district: { title: 'Paint a District', blurb: 'Cluster matching rooms until the layer card names a district.', hint: 'Two cisterns make water. Two redoubts make defense. Raise a room to push harder.' },
    first_thought: { title: 'Think', blurb: 'Issue an order. The speed chip reads THINK while you command.', hint: 'Select a unit, then issue a move or attack.' },
    read_weather: { title: 'Weather Map', blurb: 'Toggle Weather on the zone card to see hunger and combat heat.', hint: 'Zone card → Weather. Key U.' },
    peel_earth: { title: 'Go Underground', blurb: 'Open floor 1 after a shaft is finished.', hint: 'Tap 1 on the left floor stack.' },
    smell_dark: { title: 'Smell the Dark', blurb: 'A chemical-sensing organism names a body in the dark.', hint: 'Unlock Chemical Sensing. Turn Sense on. Walk the edge of vision.' }
  };

  function grant(game, bus, achId) {
    const P = game.progress;
    if (!P || P.achievements[achId]) return false;
    const ach = ACH_BY_ID[achId];
    if (!ach) return false;
    P.achievements[achId] = game.simTime || 1;
    const names = [];
    for (const mid of (ach.mutations || [])) {
      if (CM.mutations && CM.mutations.unlock(game, bus, mid, true)) names.push(CM.mutations.BY_ID[mid].name);
    }
    if (bus) {
      CM.discovery.pushEvent(game, bus, {
        kind: 'progress', icon: ach.icon,
        message: names.length
          ? `Achievement: ${ach.name}. Mutation${names.length > 1 ? 's' : ''} unlocked: ${names.join(', ')}.`
          : `Achievement: ${ach.name}.`,
        x: game.core && game.core.x, y: game.core && game.core.y
      });
    }
    return true;
  }

  function hasType(game, typeKey) {
    const S = CM.structures;
    return S.all(game).some(s => s.done && s.colonyId === 'player' && s.type === typeKey);
  }

  function evaluateAchievements(game, bus) {
    const P = game.progress;
    if (!P) return;
    const pop = (game.core && game.core.pop) || 0;
    if (P.drinks >= 1) grant(game, bus, 'first_drink');
    if (pop >= 6) grant(game, bus, 'first_band');
    if (P.gathered >= 80) grant(game, bus, 'first_stores');
    if (Object.keys(P.biomes).length >= 3) grant(game, bus, 'three_biomes');
    if (hasType(game, 'SHAFT')) grant(game, bus, 'first_shaft');
    const ev = game.climate && game.climate.event;
    if (ev && ev.key === 'HEATWAVE') grant(game, bus, 'feel_the_heat');
    if (CM.layers && game.core && CM.layers.layerReady(game, game.core, 1).ok && hasType(game, 'SHAFT')) {
      grant(game, bus, 'settle_shallow');
    }
    if (P.kills >= 1) grant(game, bus, 'first_blood');
    if (game.climate && game.climate.seasonIndex === 3 && game.simTime > 20) grant(game, bus, 'deep_cold');
    if (pop >= 10) grant(game, bus, 'a_people');
    if (P.gathered >= 40) grant(game, bus, 'sun_forage');
    if (ev && ev.key === 'COLD_SNAP' && ev.remaining < 2) grant(game, bus, 'cold_snap');
    if (P.ateDefended) grant(game, bus, 'bitter_meal');
    if (hasType(game, 'GEOTHERMAL') || hasType(game, 'WELL')) grant(game, bus, 'tap_the_well');
    if (P.wounded) grant(game, bus, 'first_wounds');
    if (P.poisoned) grant(game, bus, 'poisoned');
    if (P.nearDeath) grant(game, bus, 'near_death');
    if (P.flees >= 5) grant(game, bus, 'learned_to_run');
    if (hasType(game, 'REDOUBT') || hasType(game, 'BASTION') || hasType(game, 'CITADEL') || hasType(game, 'KEEP')) {
      grant(game, bus, 'first_redoubt');
    }
    if (P.kills >= 5) grant(game, bus, 'five_kills');
    if (P.extracts >= 1) grant(game, bus, 'first_extract');
    if (P.rivalKills >= 1) grant(game, bus, 'rival_blood');
    if (P.deepKills >= 1) grant(game, bus, 'deep_kill');
    if (P.designs >= 1) grant(game, bus, 'first_design');
    if (hasType(game, 'NURSERY')) grant(game, bus, 'first_nursery');
    if (P.births >= 3) grant(game, bus, 'three_births');
    if (CM.layers && game.core && CM.layers.layerReady(game, game.core, 4).ok && hasType(game, 'GALLERY')) {
      grant(game, bus, 'settle_spore');
    }
    if (hasType(game, 'DESCENT')) grant(game, bus, 'cut_descent');
    if (P.upgrades >= 1) grant(game, bus, 'first_upgrade');
    if (P.upgrades >= 3) grant(game, bus, 'three_upgrades');
    if (P.laborSet) grant(game, bus, 'labor_set');
    if (P.crewPosted) grant(game, bus, 'crew_posted');
    if (CM.influence && game.core) {
      for (let d = 1; d <= 9; d++) {
        if (CM.influence.layerDistrict(game, game.core.id, d)) {
          P.districts = 1;
          grant(game, bus, 'first_district');
          break;
        }
      }
    }
    if (P.thought) grant(game, bus, 'first_thought');
    if (P.readWeather) grant(game, bus, 'read_weather');
    if ((P.peelTime || 0) >= 8) grant(game, bus, 'peel_earth');
    if (P.smellDark) grant(game, bus, 'smell_dark');
  }

  /* Sightings before guide.startedAt (or 0.5s when unset/0) do not finish
   * first_look / the learn half of foothold. */
  function sightingCutoff(game) {
    return (game.guide && game.guide.startedAt) || 0.5;
  }

  function hasPostStartSighting(game) {
    const cut = sightingCutoff(game);
    const events = (game.discovery && game.discovery.events) || [];
    for (const e of events) {
      if (!e.speciesId) continue;
      if ((e.time == null ? 0 : e.time) >= cut) return true;
    }
    return false;
  }

  function questDone(game, id) {
    const P = game.progress;
    if (id === 'foothold') return CM.layers && game.core && CM.layers.surfaceReady(game, game.core).ok;
    if (id === 'sink_shaft') return hasType(game, 'SHAFT');
    if (id === 'cut_warren') return hasType(game, 'WARREN');
    if (id === 'hold_shallow') return CM.layers && game.core && CM.layers.layerReady(game, game.core, 1).ok;
    if (id === 'cut_descent') return hasType(game, 'DESCENT');
    if (id === 'feed_stack') return hasType(game, 'NURSERY') || hasType(game, 'FUNGARIUM');
    if (id === 'hold_galleries') return CM.layers && game.core && CM.layers.layerReady(game, game.core, 2).ok;
    if (id === 'tap_heat') return hasType(game, 'GEOTHERMAL') || hasType(game, 'VEINWORKS') || hasType(game, 'WELL');
    if (id === 'hold_and_post') return hasType(game, 'GATE');
    if (id === 'first_look') return hasPostStartSighting(game);
    if (id === 'first_sample') return P.extracts >= 1;
    if (id === 'design_one') return P.designs >= 1;
    if (id === 'post_two') {
      if (!CM.layers) return false;
      for (const s of CM.structures.all(game)) {
        if (!s.done || s.colonyId !== 'player' || !CM.layers.isSpine(s.type)) continue;
        if (CM.layers.hostilityAt(game, s).friends >= 2) return true;
      }
      return false;
    }
    if (id === 'fortify_door') {
      return CM.structures.all(game).some(s => s.type === 'SHAFT' && s.fortified && s.fortHp > 0 && s.colonyId === 'player');
    }
    if (id === 'raise_one') return P.upgrades >= 1;
    if (id === 'post_crew') return !!P.crewPosted;
    if (id === 'paint_district') return (P.districts || 0) >= 1;
    if (id === 'first_thought') return !!P.thought;
    if (id === 'read_weather') return !!P.readWeather;
    if (id === 'peel_earth') return (P.peelTime || 0) >= 8;
    if (id === 'smell_dark') return !!P.smellDark;
    return false;
  }

  function evaluateQuests(game, bus) {
    const P = game.progress;
    if (!P || !P.quests) return;
    const Q = P.quests;
    if (Q.active && QUESTS[Q.active] && questDone(game, Q.active)) {
      Q.done[Q.active] = game.simTime || 1;
      const spec = QUESTS[Q.active];
      const next = spec.next;
      if (bus) {
        CM.discovery.pushEvent(game, bus, {
          kind: 'system', icon: '\u{1F4CB}',
          message: next
            ? `Quest complete: ${spec.title}. Next — ${QUESTS[next].title}.`
            : `Quest complete: ${spec.title}. The rest of the descent is yours to pace.`,
          x: game.core && game.core.x, y: game.core && game.core.y
        });
      }
      if (game.core) {
        game.core.biomass = Math.min(game.core.biomassCap, game.core.biomass + 12);
        game.core.energy = Math.min(game.core.energyCap, game.core.energy + 8);
      }
      Q.active = next;
      if (next === 'sink_shaft') Q.side = ['first_look', 'first_sample', 'first_thought'];
      if (next === 'cut_warren') Q.side = ['design_one', 'post_two', 'raise_one', 'read_weather'];
      if (next === 'hold_shallow') Q.side = ['post_two', 'fortify_door', 'raise_one', 'peel_earth'];
      if (next === 'cut_descent') Q.side = ['fortify_door', 'post_crew', 'paint_district', 'smell_dark'];
      if (next === 'feed_stack') Q.side = ['post_crew', 'paint_district'];
    }
    const still = [];
    for (const sid of (Q.side || [])) {
      if (questDone(game, sid)) {
        Q.done[sid] = game.simTime || 1;
        if (bus && SIDE[sid]) {
          CM.discovery.pushEvent(game, bus, {
            kind: 'system', icon: '\u{1F4CB}',
            message: `Side quest: ${SIDE[sid].title} is done.`,
            x: game.core && game.core.x, y: game.core && game.core.y
          });
        }
      } else still.push(sid);
    }
    Q.side = still;
  }

  function note(game, kind, extra) {
    const P = game.progress;
    if (!P) return;
    if (kind === 'gather') P.gathered += extra || 0;
    else if (kind === 'drink') P.drinks += 1;
    else if (kind === 'kill') {
      P.kills += 1;
      if (extra === 'rival') P.rivalKills += 1;
      if (extra === 'deep') P.deepKills += 1;
    } else if (kind === 'birth') P.births += 1;
    else if (kind === 'design') P.designs += 1;
    else if (kind === 'extract') P.extracts += 1;
    else if (kind === 'flee') P.flees += 1;
    else if (kind === 'biome' && extra != null) P.biomes[extra] = true;
    else if (kind === 'wounded') P.wounded = true;
    else if (kind === 'nearDeath') P.nearDeath = true;
    else if (kind === 'poisoned') P.poisoned = true;
    else if (kind === 'ateDefended') P.ateDefended = true;
    else if (kind === 'upgrade') P.upgrades = (P.upgrades || 0) + 1;
    else if (kind === 'labor') P.laborSet = true;
    else if (kind === 'crew') P.crewPosted = true;
    else if (kind === 'district') P.districts = 1;
    else if (kind === 'thought') P.thought = true;
    else if (kind === 'weather') P.readWeather = true;
    else if (kind === 'peel') P.peelTime = (P.peelTime || 0) + (extra || 0);
    else if (kind === 'smell') P.smellDark = true;
  }

  function tick(game, bus, dt) {
    if (!game.progress) game.progress = newState();
    game.__progAcc = (game.__progAcc || 0) + dt;
    if (game.__progAcc < 0.8) return;
    game.__progAcc = 0;
    if (game.thought > 0.55 && ((game.selectedIds && game.selectedIds.length) || game.selection)) {
      note(game, 'thought');
    }
    if (game.peel !== false && (game.viewDepth || 0) >= 1) note(game, 'peel', 0.8);
    evaluateAchievements(game, bus);
    evaluateQuests(game, bus);
  }

  function activeQuest(game) {
    const id = game.progress && game.progress.quests && game.progress.quests.active;
    if (!id || !QUESTS[id]) return null;
    return Object.assign({ id }, QUESTS[id]);
  }

  function sideQuests(game) {
    const ids = (game.progress && game.progress.quests && game.progress.quests.side) || [];
    return ids.map(id => SIDE[id] && Object.assign({ id }, SIDE[id])).filter(Boolean);
  }

  CM.progress = {
    newState, ACHIEVEMENTS, ACH_BY_ID, QUESTS, SIDE,
    grant, note, tick, activeQuest, sideQuests, evaluateAchievements, evaluateQuests,
    questDone
  };
})(window.CM = window.CM || {});
