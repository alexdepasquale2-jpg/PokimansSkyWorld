/* Primal Isle — game state shape, new game, and save rehydration.
 *
 * The island is not saved. The seed is, and world.build() puts the same island
 * back. Everything that changed during play — who is alive, how much of each
 * fern is left, and above all the account — is.
 */
(function (ISLE) {
  'use strict';
  const C = ISLE.content;
  const W = ISLE.world;
  const D = ISLE.dino;
  const M = ISLE.shop;
  const MU = ISLE.mutations;

  function startGame(spId, playerName, seed) {
    const g = {
      seed: seed || ((Math.random() * 1e9) | 0),
      clock: 0,
      day: 1,
      dinos: [],
      byId: {},
      carcasses: [],
      calls: [],
      feed: [],
      player: null,
      playerName: playerName || 'you',
      spawnAcc: 0,
      respawn: null,
      dead: false,
      acct: M.newAccount(),
      idle: ISLE.idle.newState(),
      draft: null,
      runPeak: 0,
      settings: { haptics: true, lefty: false, showRange: false },
      stats: { lives: 0, kills: 0, bestGrowth: 0, timeAlive: 0, timeTotal: 0, deathsBy: {} },
      ui: {}
    };
    g.world = W.build(g.seed);
    spawnPlayer(g, spId, C.HATCH_GROWTH);

    // Fill the lobby before the player draws their first breath, so the server
    // already has adults in it. It is never a level playing field.
    for (let i = 0; i < C.SERVER_CAP; i++) ISLE.ai.spawn(g);
    reindex(g);
    return g;
  }

  function spawnPlayer(g, spId, growth) {
    const at = W.spawnPoint(g.world);
    /* Banked mutations are the meta-progression: bought once on the Exchange,
     * present in every hatchling from then on. */
    const d = D.make({
      sp: spId, growth, x: at.x, y: at.y, player: true,
      name: g.playerName, clock: g.clock, skin: g.acct.skin,
      muts: (g.acct.mutBank || []).slice()
    });
    d.id = 'player';
    g.player = d;
    g.dinos.push(d);
    g.dead = false;
    g.respawn = null;
    g.stats.lives++;
    g.lifeStart = g.clock;
    g.runPeak = growth;
    g.draft = null;
    reindex(g);
    return d;
  }

  function reindex(g) {
    g.byId = {};
    for (const d of g.dinos) g.byId[d.id] = d;
  }

  /* Restore a save. Anything the save is missing is filled in rather than
   * refused — a half-finished account is still an account. */
  function hydrate(raw) {
    if (!raw) return null;
    try {
      const g = raw;
      g.world = W.build(g.seed);
      // Node amounts were saved flat; put them back on the regenerated nodes.
      if (g.nodeAmts && g.nodeAmts.length === g.world.nodes.length) {
        for (let i = 0; i < g.world.nodes.length; i++) g.world.nodes[i].amt = g.nodeAmts[i];
      }
      delete g.nodeAmts;
      g.dinos = g.dinos || [];
      g.carcasses = g.carcasses || [];
      g.calls = [];
      g.feed = g.feed || [];
      g.acct = Object.assign(M.newAccount(), g.acct || {});
      g.idle = Object.assign(ISLE.idle.newState(), g.idle || {});
      g.draft = g.draft || null;
      g.settings = Object.assign({ haptics: true, lefty: false, showRange: false }, g.settings || {});
      g.stats = Object.assign({ lives: 1, kills: 0, bestGrowth: 0, timeAlive: 0, timeTotal: 0, deathsBy: {} }, g.stats || {});
      g.ui = {};
      reindex(g);
      g.player = g.byId.player || null;
      // AI objects lose nothing in JSON except their live node references.
      for (const d of g.dinos) {
        if (d.ai) { d.ai.node = null; d.ai.car = null; }
        MU.recompute(d);
      }
      if (!g.player && !g.respawn) g.dead = true;
      return g;
    } catch (e) {
      console.warn('[isle] hydrate failed', e);
      return null;
    }
  }

  /* Flatten the parts of the world worth persisting before handing the state
   * to JSON. */
  function forSave(g) {
    const out = {};
    for (const k in g) {
      if (k === 'world' || k === 'byId' || k === 'player' || k === 'calls' || k === 'ui') continue;
      out[k] = g[k];
    }
    out.nodeAmts = g.world.nodes.map(n => Math.round(n.amt * 100) / 100);
    return out;
  }

  ISLE.state = { startGame, spawnPlayer, reindex, hydrate, forSave };
})(window.ISLE = window.ISLE || {});
