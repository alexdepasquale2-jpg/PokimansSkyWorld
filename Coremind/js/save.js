/* Coremind — local persistence. Terrain is never saved (it's fully
 * regenerable from the seed); everything the player actually changed is:
 * discovered species/traits, designs, every living organism, and the
 * Core's resources. Autosaves are throttled but triggered eagerly on
 * anything narratively "major" so closing the app never loses progress.
 */
(function (CM) {
  'use strict';
  const KEY = 'coremind/save/v1';
  const VERSION = 1;
  const MIN_SAVE_INTERVAL_MS = 5000;
  const PERIODIC_MS = 20000;

  function hasSave() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
  }

  function serialize(game) {
    return {
      v: VERSION, savedAt: Date.now(),
      seed: game.seed, simTime: game.simTime, speed: game.speed,
      core: { biomass: game.core.biomass, energy: game.core.energy },
      camera: { x: game.camera.x, y: game.camera.y, zoom: game.camera.zoom },
      discovery: {
        observations: game.discovery.observations,
        discoveredTraits: game.discovery.discoveredTraits,
        knownSpecies: game.discovery.knownSpecies,
        events: game.discovery.events.slice(0, 150),
        samples: game.discovery.samples
      },
      designs: game.designs,
      nextDesignId: game.nextDesignId,
      organisms: game.organisms.map(o => ({
        ownerId: o.ownerId, speciesId: o.speciesId, designId: o.designId, name: o.name,
        generation: o.generation, age: o.age, x: o.x, y: o.y, heading: o.heading,
        traits: o.traits, diet: o.diet, color: o.color,
        health: o.health, energy: o.energy, hunger: o.hunger, thirst: o.thirst,
        state: o.state, directive: o.directive, carrying: o.carrying, reproCooldown: o.reproCooldown,
        // Burrow state is deliberately not saved: reloading into "underground
        // and untargetable" would be an invisible, unexplainable condition.
        // Everything reloads above ground.
      }))
    };
  }

  function writeNow(game) {
    try {
      localStorage.setItem(KEY, JSON.stringify(serialize(game)));
      game.__lastSaveAt = performance.now();
      return true;
    } catch (e) {
      console.warn('[coremind] save failed', e);
      return false;
    }
  }

  function readRaw() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== VERSION) return null;
      return data;
    } catch (e) {
      console.warn('[coremind] read failed', e);
      return null;
    }
  }

  /* Rebuild a full game object: regenerate the world from the seed, then
   * overlay everything that isn't derivable from it. */
  function hydrate(data) {
    const game = CM.coremind.newGame(data.seed);
    game.simTime = data.simTime || 0;
    game.speed = data.speed || 1;
    game.core.biomass = data.core.biomass;
    game.core.energy = data.core.energy;
    if (data.camera) {
      game.camera.x = data.camera.x; game.camera.y = data.camera.y; game.camera.zoom = data.camera.zoom;
      game.camera.targetX = game.camera.x; game.camera.targetY = game.camera.y; game.camera.targetZoom = game.camera.zoom;
    }
    const disc = data.discovery || {};
    game.discovery.observations = disc.observations || {};
    game.discovery.discoveredTraits = disc.discoveredTraits || {};
    game.discovery.knownSpecies = disc.knownSpecies || {};
    game.discovery.events = disc.events || [];
    game.discovery.samples = disc.samples || [];
    let maxEvtId = 0, maxSampleId = 0;
    for (const e of game.discovery.events) { const n = parseInt(String(e.id).split('_')[1], 10); if (n > maxEvtId) maxEvtId = n; }
    for (const s of game.discovery.samples) { const n = parseInt(String(s.id).split('_')[1], 10); if (n > maxSampleId) maxSampleId = n; }
    game.discovery.nextEventId = Math.max(maxEvtId, maxSampleId) + 1;

    game.designs = data.designs || [];
    game.nextDesignId = data.nextDesignId || 1;

    for (const od of data.organisms || []) {
      const org = CM.organism.create({
        ownerId: od.ownerId, speciesId: od.speciesId, designId: od.designId, name: od.name,
        generation: od.generation, x: od.x, y: od.y, heading: od.heading,
        traits: od.traits, diet: od.diet, color: od.color, directive: od.directive
      });
      org.age = od.age; org.health = od.health; org.energy = od.energy; org.hunger = od.hunger;
      org.thirst = od.thirst || 0;
      org.state = od.state; org.carrying = od.carrying || 0; org.reproCooldown = od.reproCooldown || 0;
      // A state saved mid-burrow (or from an older save) resumes above ground.
      if (org.state === 'SEEK_WATER' && !od.thirst) org.state = 'EXPLORE';
      CM.coremind.addOrganism(game, org);
    }
    return game;
  }

  /* Called on every notable event; only actually writes if the throttle
   * window has elapsed, so a burst of deaths/discoveries can't hammer
   * localStorage. */
  function maybeAutosave(game) {
    const now = performance.now();
    if (!game.__lastSaveAt || now - game.__lastSaveAt >= MIN_SAVE_INTERVAL_MS) writeNow(game);
  }

  function init(game, bus) {
    bus.on('event', evt => {
      if (evt.kind === 'discovery' || evt.kind === 'death' || evt.kind === 'system') maybeAutosave(game);
    });
  }

  CM.save = { hasSave, writeNow, readRaw, hydrate, maybeAutosave, init, PERIODIC_MS };
})(window.CM = window.CM || {});
