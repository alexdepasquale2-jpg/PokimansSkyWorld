/* Coremind — the player's own entity: the Core (biomass/energy pool),
 * directive issuance, selection, and the organism designer's draft buffer.
 * Also owns the shape of the overall game object every other system reads.
 */
(function (CM) {
  'use strict';
  const K = CM.core;
  const T = CM.traits;
  const O = CM.organism;

  const RIVAL_COUNT = 3;

  function newGame(seed, opts) {
    seed = seed >>> 0;
    const world = CM.world.generate(seed);
    const game = {
      seed, simTime: 0, speed: 1, paused: false,
      world,
      organisms: [],
      byId: {},
      // core is assigned by CM.colony.createAll below, which makes the player
      // colony object itself the Core — one object, so nothing has to keep a
      // separate Core and colony record in sync.
      core: null,
      colonies: [], coloniesById: {},
      climate: CM.climate.newState(seed),
      structures: CM.structures.newState(),
      buildMode: null,          // structure type key the player is placing
      viewDepth: 0,             // 0 = surface, 1..MAX_DEPTH = an underground stratum
      discovery: CM.discovery.newDiscoveryState(),
      designs: [],
      selection: null,
      // Opens wide enough to read the Core's surroundings rather than a single
      // biome: at 18 only ~22 cells fit across a phone screen, which on a
      // 256-cell map shows almost nothing of where the colony actually is.
      camera: { x: world.coreSpawn.x, y: world.coreSpawn.y, zoom: 9, targetX: world.coreSpawn.x, targetY: world.coreSpawn.y, targetZoom: 9, dragging: false },
      stats: { playerPop: 0, herbivorePop: 0, predatorPop: 0, plantTotal: 0, colonyPop: {} },
      designerDraft: { BODY: null, SENSE: null, METABOLISM: null, DEFENSE: null, OFFENSE: null, REPRODUCTION: null },
      // GATHER, not EXPLORE: a colony's first job is to feed itself, and the
      // player chooses to send scouts out as a deliberate, riskier act.
      globalDirective: 'GATHER',
      nextDesignId: 1,
      selectedIds: [],
      commandMode: null,
      addSelect: false,
      boxSelect: false,
      followSelection: false,
      controlGroups: { 1: [], 2: [], 3: [], 4: [] },
      buildFilter: 'auto',
      outcome: null,
      boxRect: null,
      buildFromId: null,
      showInfluence: false,
      showAura: true,
      peel: true,
      senseSight: true,
      hero: { on: false, orgId: null, targetId: null, keys: {}, stick: { x: 0, y: 0 }, cd: {}, bagOpen: false },
      thought: 0,
      thoughtHold: false,
      pointerDown: false,
      drawAlpha: 0,
      guide: { on: false, beat: 0, done: {}, later: {}, skipped: false },
      queueOrders: false,
      progress: CM.progress ? CM.progress.newState() : null
    };
    CM.colony.createAll(game, (opts && opts.rivalCount != null) ? opts.rivalCount : RIVAL_COUNT);
    CM.climate.apply(game);
    if (CM.economy) CM.economy.ensure(game);
    if (CM.reputation) CM.reputation.ensure(game);
    if (CM.sentiment) CM.sentiment.ensure(game);
    ensure(game);
    return game;
  }

  function ensure(game) {
    if (!game) return game;
    if (!game.ui) game.ui = { layerExpanded: false };
    else if (game.ui.layerExpanded == null) game.ui.layerExpanded = false;
    return game;
  }

  function addOrganism(game, org) {
    game.organisms.push(org);
    game.byId[org.id] = org;
    game.world.grid.insert(org);
    return org;
  }
  function removeOrganism(game, org) {
    game.world.grid.remove(org);
    delete game.byId[org.id];
    const i = game.organisms.indexOf(org);
    if (i >= 0) game.organisms.splice(i, 1);
    if (game.selection === org.id) game.selection = null;
    if (game.selectedIds) {
      const si = game.selectedIds.indexOf(org.id);
      if (si >= 0) game.selectedIds.splice(si, 1);
    }
    O.release(org);
  }

  // --- resources -------------------------------------------------------
  function canAfford(game, cost) { return game.core.biomass >= cost.biomass && game.core.energy >= cost.energy; }
  function spend(game, cost) {
    if (!canAfford(game, cost)) return false;
    game.core.biomass -= cost.biomass;
    game.core.energy -= cost.energy;
    return true;
  }
  function deposit(game, biomass, energy) {
    game.core.biomass = Math.min(game.core.biomassCap, game.core.biomass + (biomass || 0));
    game.core.energy = Math.min(game.core.energyCap, game.core.energy + (energy || 0));
  }

  // --- selection & directives -------------------------------------------
  function selectOrganism(game, orgId, add) {
    if (game.ui) game.ui.selDirty = true;
    if (orgId && CM.guide) CM.guide.note(game, 'select');
    if (!game.selectedIds) game.selectedIds = [];
    if (!orgId) {
      for (const id of game.selectedIds) {
        if (game.byId[id]) game.byId[id].selected = false;
      }
      if (game.selection && game.byId[game.selection]) game.byId[game.selection].selected = false;
      game.selection = null;
      game.selectedIds = [];
      game.commandMode = null;
      return;
    }
    if (add) {
      if (!game.selectedIds.includes(orgId)) game.selectedIds.push(orgId);
    } else {
      for (const id of game.selectedIds) {
        if (game.byId[id]) game.byId[id].selected = false;
      }
      game.selectedIds = [orgId];
    }
    game.selection = orgId;
    for (const id of game.selectedIds) {
      if (game.byId[id]) game.byId[id].selected = true;
    }
  }

  /* target: optional {x,y,ref} — required for a meaningful INVESTIGATE.
   * When nothing is selected, the directive applies colony-wide and becomes
   * the default new organisms are deployed with. */
  function issueDirective(game, directive, target) {
    if (directive === 'GATHER' && CM.guide) CM.guide.note(game, 'gather');
    const group = (game.selectedIds && game.selectedIds.length)
      ? game.selectedIds.map(id => game.byId[id]).filter(o => o && o.ownerId === 'player')
      : (game.selection && game.byId[game.selection] ? [game.byId[game.selection]] : []);
    if (group.length) {
      for (const org of group) {
        org.directive = directive;
        org.directiveTarget = target || null;
      }
      if (CM.mind && CM.mind.pulse) CM.mind.pulse(game);
      return group.length === 1 ? 'selected' : 'group';
    }
    game.globalDirective = directive;
    for (const org of game.organisms) {
      if (org.ownerId === 'player') { org.directive = directive; org.directiveTarget = target || null; }
    }
    if (CM.mind && CM.mind.pulse) CM.mind.pulse(game);
    return 'all';
  }

  // --- genome designer draft ---------------------------------------------
  /* Returns true if the slot was set. Refuses undiscovered traits and traits
   * that declare an incompatibility with something already in the draft —
   * the designer disables those options too, but the rule is enforced here so
   * an invalid genome cannot be built by any path. */
  function setDesignSlot(game, category, traitId) {
    if (!T.CATEGORIES.includes(category)) return false;
    if (!traitId) { game.designerDraft[category] = null; return true; }
    const trait = T.TRAITS_BY_ID[traitId];
    if (trait && trait.mutation) {
      if (!CM.mutations || !CM.mutations.unlocked(game, traitId)) return false;
    } else if (!game.discovery.discoveredTraits[traitId]) return false;
    const others = T.CATEGORIES.filter(c => c !== category).map(c => game.designerDraft[c]);
    if (T.conflictsWith(others, traitId)) return false;
    game.designerDraft[category] = traitId;
    return true;
  }
  function draftTraitIds(game) { return T.CATEGORIES.map(c => game.designerDraft[c]).filter(Boolean); }
  function draftCombination(game) { return T.checkCombination(draftTraitIds(game)); }
  function draftStats(game) { return T.resolveStats(draftTraitIds(game)); }
  function draftCost(game) { return T.resolveCost(draftTraitIds(game)); }

  function createOrganismFromDraft(game, bus) {
    const cost = draftCost(game);
    if (!spend(game, cost)) return null;
    const jitter = () => (Math.random() - 0.5) * 3;
    const org = O.create({
      ownerId: 'player', traits: draftTraitIds(game),
      x: K.clamp(game.core.x + jitter(), 1, game.world.size - 1),
      y: K.clamp(game.core.y + jitter(), 1, game.world.size - 1),
      generation: 1, directive: game.globalDirective,
      name: 'Coremind-' + game.nextDesignId
    });
    game.nextDesignId++;
    addOrganism(game, org);
    if (CM.progress) CM.progress.note(game, 'design');
    if (CM.economy) CM.economy.onCreate(game);
    CM.discovery.pushEvent(game, bus, {
      kind: 'system', icon: '\u{1F9EA}',
      message: `New organism successfully created: ${org.name}.`,
      x: org.x, y: org.y, orgId: org.id
    });
    return org;
  }

  const MAX_SAVED_DESIGNS = 8;

  /* Saved designs are how the player re-runs an experiment. Once a genome
   * has proven itself the loop should be "deploy that one again", not
   * "rebuild it from memory slot by slot". */
  function saveDesign(game, name) {
    const traitIds = draftTraitIds(game);
    if (!traitIds.length) return null;
    const design = {
      id: 'design_' + (game.nextDesignId++),
      name: name || ('Strain ' + (game.designs.length + 1)),
      traits: Object.assign({}, game.designerDraft)
    };
    game.designs.unshift(design);
    if (game.designs.length > MAX_SAVED_DESIGNS) game.designs.length = MAX_SAVED_DESIGNS;
    return design;
  }

  /* Load a saved design back into the draft, dropping any trait that is no
   * longer valid. A save file predating a rules change should degrade to a
   * partial design the player can repair, never refuse to load. */
  function loadDesign(game, designId) {
    const design = game.designs.find(d => d.id === designId);
    if (!design) return false;
    for (const cat of T.CATEGORIES) game.designerDraft[cat] = null;
    for (const cat of T.CATEGORIES) setDesignSlot(game, cat, design.traits[cat] || null);
    return true;
  }

  function deleteDesign(game, designId) {
    const i = game.designs.findIndex(d => d.id === designId);
    if (i < 0) return false;
    game.designs.splice(i, 1);
    return true;
  }

  CM.coremind = {
    newGame, ensure, addOrganism, removeOrganism, canAfford, spend, deposit,
    selectOrganism, issueDirective, setDesignSlot, draftTraitIds, draftStats, draftCost,
    draftCombination, createOrganismFromDraft, saveDesign, loadDesign, deleteDesign
  };
})(window.CM = window.CM || {});
