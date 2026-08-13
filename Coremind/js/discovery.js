/* Coremind — DISCOVER -> ANALYZE -> EXTRACT.
 *
 * Traits are never unlocked by a level-up; they're earned by watching wild
 * organisms use them. Every encounter between a player organism and a wild
 * one leaves partial evidence; killing a wild organism leaves a biological
 * sample the player can walk up to and extract for a much bigger dose of
 * evidence. Once a trait has enough evidence behind it, it becomes available
 * in the genome designer.
 */
(function (CM) {
  'use strict';

  const OBSERVATION_THRESHOLD = 4;
  const EXTRACT_CREDIT = 3;
  const ENCOUNTER_CREDIT = 1;
  const SAMPLE_TTL = 180; // seconds of sim time before an unclaimed sample decays

  function newDiscoveryState() {
    return {
      events: [],
      nextEventId: 1,
      observations: {},     // traitId -> count
      discoveredTraits: {},  // traitId -> true
      knownSpecies: {},      // speciesId -> true
      samples: []            // {id, x, y, speciesId, traits, name, ttl}
    };
  }

  function pushEvent(game, bus, evt) {
    const e = Object.assign({
      id: 'evt_' + (game.discovery.nextEventId++),
      time: game.simTime,
      read: false
    }, evt);
    game.discovery.events.unshift(e);
    if (game.discovery.events.length > 200) game.discovery.events.length = 200;
    bus.emit('event', e);
    return e;
  }

  function recordSighting(game, bus, speciesId, x, y) {
    const D = game.discovery;
    if (D.knownSpecies[speciesId]) return;
    D.knownSpecies[speciesId] = true;
    const sp = CM.traits.WILD_BY_ID[speciesId];
    pushEvent(game, bus, {
      kind: 'discovery', icon: sp && sp.tier === 'predator' ? '\u{1F439}' : '\u{1F43F}',
      message: `Your organism discovered a new ${sp ? sp.tier : 'species'}: ${sp ? sp.name : speciesId}.`,
      x, y, speciesId
    });
  }

  function creditTrait(game, bus, traitId, amount) {
    const D = game.discovery;
    if (D.discoveredTraits[traitId]) return;
    D.observations[traitId] = (D.observations[traitId] || 0) + amount;
    if (D.observations[traitId] >= OBSERVATION_THRESHOLD) {
      D.discoveredTraits[traitId] = true;
      const t = CM.traits.TRAITS_BY_ID[traitId];
      pushEvent(game, bus, {
        kind: 'discovery', icon: '\u{1F9EC}',
        message: `Biological discovery: ${t.name.toUpperCase()} can now be designed into your organisms.`,
        traitId
      });
    }
  }

  /* outcome: 'player_killed' | 'wild_killed' | 'player_fled' | 'wild_fled' */
  function recordEncounter(game, bus, playerOrg, wildOrg, outcome, x, y) {
    recordSighting(game, bus, wildOrg.speciesId, x, y);
    for (const traitId of wildOrg.traits) {
      const t = CM.traits.TRAITS_BY_ID[traitId];
      if (!t) continue;
      const relevant = (outcome === 'player_killed' && (t.category === 'OFFENSE'))
        || (outcome === 'wild_killed' && (t.category === 'DEFENSE'))
        || t.category === 'SENSE' || t.category === 'BODY' || t.category === 'METABOLISM' || t.category === 'REPRODUCTION';
      if (relevant) creditTrait(game, bus, traitId, ENCOUNTER_CREDIT);
    }
    if (outcome === 'player_killed') {
      pushEvent(game, bus, {
        kind: 'death', icon: '☠',
        message: `${wildOrg.name} killed ${playerOrg.name}.`,
        x, y, orgId: playerOrg.id
      });
    }
  }

  function spawnSample(game, world, x, y, wildOrg) {
    const D = game.discovery;
    const sample = {
      id: 'sample_' + (game.discovery.nextEventId++),
      x, y, speciesId: wildOrg.speciesId, traits: wildOrg.traits.slice(),
      name: wildOrg.name, ttl: SAMPLE_TTL
    };
    D.samples.push(sample);
    return sample;
  }

  function tickSamples(game, dt) {
    const D = game.discovery;
    for (let i = D.samples.length - 1; i >= 0; i--) {
      D.samples[i].ttl -= dt;
      if (D.samples[i].ttl <= 0) D.samples.splice(i, 1);
    }
  }

  function extractSample(game, bus, sampleId) {
    const D = game.discovery;
    const i = D.samples.findIndex(s => s.id === sampleId);
    if (i < 0) return false;
    const sample = D.samples[i];
    D.samples.splice(i, 1);
    for (const traitId of sample.traits) creditTrait(game, bus, traitId, EXTRACT_CREDIT);
    pushEvent(game, bus, {
      kind: 'analysis', icon: '\u{1F52C}',
      message: `Extracted a biological sample from ${sample.name}.`,
      x: sample.x, y: sample.y
    });
    return true;
  }

  function observationProgress(game, traitId) {
    return Math.min(1, (game.discovery.observations[traitId] || 0) / OBSERVATION_THRESHOLD);
  }

  CM.discovery = {
    OBSERVATION_THRESHOLD, newDiscoveryState, pushEvent, recordSighting,
    recordEncounter, spawnSample, tickSamples, extractSample, observationProgress
  };
})(window.CM = window.CM || {});
