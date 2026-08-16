/* DoomSpire — the game object, new-character flow, and save/load.
 *
 * Only the character is persisted — level, gear, bags, quest log, rep,
 * professions, talents, companions recruited. Zones are rebuilt fresh each
 * session the way PrimalIsle rebuilds the island from a seed: mobs respawn
 * where their spawn table says they should, nodes are full again, and nothing
 * about that needs to survive a reload.
 */
(function (DS) {
  'use strict';
  const K = DS.content;

  function newGame(name, clsId) {
    const player = DS.player.newCharacter(name, clsId);
    DS.player.refreshVitals(player);
    player.hp.current = player.hp.max;
    player.resource.current = player.resource.max;
    return {
      player, zoneRuntimes: {}, companionsActive: {},
      combatLog: [], target: null, clock: 0, paused: false
    };
  }

  function ensureZoneRuntime(game, zoneId) {
    if (!game.zoneRuntimes[zoneId]) game.zoneRuntimes[zoneId] = DS.world.buildZoneRuntime(zoneId);
    return game.zoneRuntimes[zoneId];
  }

  function syncCompanions(game) {
    Object.entries(game.player.companions).forEach(([defId, c]) => {
      if (c.recruited && !game.companionsActive[defId]) {
        game.companionsActive[defId] = DS.ai.makeCompanionActor(defId, game.player);
      }
    });
    return Object.values(game.companionsActive);
  }

  function currentZone(game) { return K.ZONES[game.player.zone]; }
  function currentRuntime(game) { return ensureZoneRuntime(game, game.player.zone); }

  function warp(game, toZone, toX, toY, toFacing) {
    const p = game.player;
    p.zone = toZone; p.x = toX; p.y = toY; p.angle = toFacing || 0;
    ensureZoneRuntime(game, toZone);
    Object.values(game.companionsActive).forEach(c => { c.x = toX; c.y = toY; c.zone = toZone; });
  }

  function forSave(game) { return { player: game.player }; }

  function fromSaved(saved) {
    const game = newGame(saved.player.name, saved.player.cls);
    game.player = Object.assign(game.player, saved.player);
    // migration safety: fill in any fields older/partial saves might lack
    if (!game.player.professions) game.player.professions = { learned: [], skill: {} };
    if (!game.player.companions) game.player.companions = {};
    if (!game.player.flags) game.player.flags = {};
    K.SLOTS.forEach(s => { if (!(s in game.player.equip)) game.player.equip[s] = null; });
    DS.player.refreshVitals(game.player);
    ensureZoneRuntime(game, game.player.zone);
    syncCompanions(game);
    return game;
  }

  function load() {
    const saved = DS.core.load();
    if (!saved || !saved.player) return null;
    try { return fromSaved(saved); } catch (e) { console.warn('[doomspire] save incompatible', e); return null; }
  }

  DS.state = { newGame, ensureZoneRuntime, syncCompanions, currentZone, currentRuntime, warp, forSave, fromSaved, load };
})(window.DS = window.DS || {});
