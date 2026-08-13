/* Coremind — the player's own entity: the Core (biomass/energy pool),
 * directive issuance, selection, and the organism designer's draft buffer.
 * Also owns the shape of the overall game object every other system reads.
 */
(function (CM) {
  'use strict';
  const K = CM.core;
  const T = CM.traits;
  const O = CM.organism;

  function newGame(seed) {
    seed = seed >>> 0;
    const world = CM.world.generate(seed);
    const game = {
      seed, simTime: 0, speed: 1, paused: false,
      world,
      organisms: [],
      byId: {},
      core: { x: world.coreSpawn.x, y: world.coreSpawn.y, biomass: 60, energy: 55, radius: 7 },
      discovery: CM.discovery.newDiscoveryState(),
      designs: [],
      selection: null,
      camera: { x: world.coreSpawn.x, y: world.coreSpawn.y, zoom: 18, targetX: world.coreSpawn.x, targetY: world.coreSpawn.y, targetZoom: 18, dragging: false },
      stats: { playerPop: 0, herbivorePop: 0, predatorPop: 0, plantTotal: 0 },
      designerDraft: { BODY: null, SENSE: null, METABOLISM: null, DEFENSE: null, OFFENSE: null, REPRODUCTION: null },
      globalDirective: 'EXPLORE',
      nextDesignId: 1
    };
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
    game.core.biomass += biomass || 0;
    game.core.energy += energy || 0;
  }

  // --- selection & directives -------------------------------------------
  function selectOrganism(game, orgId) {
    if (game.selection && game.byId[game.selection]) game.byId[game.selection].selected = false;
    game.selection = orgId || null;
    if (orgId && game.byId[orgId]) game.byId[orgId].selected = true;
  }

  /* target: optional {x,y,ref} — required for a meaningful INVESTIGATE.
   * When nothing is selected, the directive applies colony-wide and becomes
   * the default new organisms are deployed with. */
  function issueDirective(game, directive, target) {
    if (game.selection && game.byId[game.selection]) {
      const org = game.byId[game.selection];
      org.directive = directive;
      org.directiveTarget = target || null;
      return 'selected';
    }
    game.globalDirective = directive;
    for (const org of game.organisms) {
      if (org.ownerId === 'player') { org.directive = directive; org.directiveTarget = target || null; }
    }
    return 'all';
  }

  // --- genome designer draft ---------------------------------------------
  function setDesignSlot(game, category, traitId) {
    if (!T.CATEGORIES.includes(category)) return;
    if (traitId && !game.discovery.discoveredTraits[traitId]) return; // must be discovered first
    game.designerDraft[category] = traitId || null;
  }
  function draftTraitIds(game) { return T.CATEGORIES.map(c => game.designerDraft[c]).filter(Boolean); }
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
    CM.discovery.pushEvent(game, bus, {
      kind: 'system', icon: '\u{1F9EA}',
      message: `New organism successfully created: ${org.name}.`,
      x: org.x, y: org.y, orgId: org.id
    });
    return org;
  }

  function saveDesign(game, name) {
    const design = { id: 'design_' + (game.nextDesignId++), name: name || ('Design ' + game.designs.length), traits: Object.assign({}, game.designerDraft) };
    game.designs.push(design);
    return design;
  }

  CM.coremind = {
    newGame, addOrganism, removeOrganism, canAfford, spend, deposit,
    selectOrganism, issueDirective, setDesignSlot, draftTraitIds, draftStats, draftCost,
    createOrganismFromDraft, saveDesign
  };
})(window.CM = window.CM || {});
