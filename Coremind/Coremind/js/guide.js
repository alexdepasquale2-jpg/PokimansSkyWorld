/* Coremind — optional tutorial. Short steps. Each one names a real
 * control and completes when the player uses it. Skip is always there.
 */
(function (CM) {
  'use strict';

  const BEATS = [
    {
      id: 'select',
      title: 'Select a unit',
      text: 'Tap one of your lime creatures on the map.',
      hint: 'They spawn next to the glowing Core.',
      target: 'scout'
    },
    {
      id: 'gather',
      title: 'Feed the colony',
      text: 'Tap GATHER in the command bar. Units will collect food for the Core.',
      hint: 'Command bar is under the map on phones, along the bottom on PC.',
      target: '[data-directive="GATHER"]',
      tab: 'explore'
    },
    {
      id: 'look',
      title: 'Look around',
      text: 'Drag the map to pan. Use + / − (or pinch) to zoom.',
      hint: 'Home button recenters on your Core.',
      target: '#world-canvas'
    },
    {
      id: 'analyze',
      title: 'Open the log',
      text: 'Tap ANALYZE. Sightings and samples show up here.',
      hint: 'Stand near wildlife to start filling it.',
      target: '[data-tab="analyze"]',
      tab: 'analyze'
    },
    {
      id: 'build',
      title: 'Dig a shaft',
      text: 'Tap BUILD, choose Access Shaft, then tap open ground near the Core.',
      hint: 'You need a small foothold first — gather or grow a bit if it is locked.',
      target: '#btn-open-build',
      tab: 'explore'
    }
  ];

  const LATER = [
    {
      id: 'layers',
      title: 'Change floor',
      text: 'Tap 1 on the floor stack to go underground.',
      hint: 'Left edge of the map. S is the surface.',
      target: '#depth-controls .depthbtn[data-depth="1"]',
      ready(game) {
        return !!(CM.structures && CM.structures.all(game).some(s => s.type === 'SHAFT' && s.done));
      }
    },
    {
      id: 'rivals',
      title: 'Other colonies',
      text: 'Open WORLD and tap a rival name to inspect them.',
      hint: 'Offer tribute there if you want a truce.',
      target: '[data-tab="world"]',
      tab: 'world',
      ready(game) {
        return (game.colonies || []).some(c => !c.isPlayer && c.announced);
      }
    }
  ];

  function ensure(game) {
    if (!game.guide) game.guide = { on: false, beat: 0, done: {}, later: {}, skipped: false };
    return game.guide;
  }

  function start(game, on) {
    const g = ensure(game);
    g.on = !!on;
    g.skipped = !on;
    g.beat = 0;
    g.done = {};
    g.later = {};
    g.startedAt = game.simTime || 0;
    g.sawSelect = g.sawGather = g.sawPan = g.sawAnalyze = g.sawBuild = g.sawGift = false;
  }

  function skip(game) {
    const g = ensure(game);
    g.on = false;
    g.skipped = true;
  }

  function note(game, kind) {
    const g = game.guide;
    if (!g || !g.on) return;
    if (kind === 'select') g.sawSelect = true;
    if (kind === 'gather') g.sawGather = true;
    if (kind === 'pan') g.sawPan = true;
    if (kind === 'analyze') g.sawAnalyze = true;
    if (kind === 'build') g.sawBuild = true;
    if (kind === 'gift') g.sawGift = true;
    if (kind === 'order') g.sawOrder = true;
    if (kind === 'extract') g.sawExtract = true;
    if (kind === 'sight') g.sawSight = true;
    if (kind === 'weather') g.sawWeather = true;
  }

  function current(game) {
    const g = game.guide;
    if (!g || !g.on || g.skipped) return null;
    if (g.beat < BEATS.length) {
      const b = BEATS[g.beat];
      return Object.assign({ step: g.beat + 1, total: BEATS.length }, b);
    }
    for (const b of LATER) {
      if (g.later[b.id]) continue;
      if (b.ready && !b.ready(game)) continue;
      return Object.assign({ step: BEATS.length, total: BEATS.length, extra: true }, b);
    }
    return null;
  }

  function completeBeat(game, id) {
    const g = ensure(game);
    if (g.beat < BEATS.length && BEATS[g.beat].id === id) {
      g.done[id] = game.simTime || 1;
      g.beat += 1;
      return true;
    }
    for (const b of LATER) {
      if (b.id === id && !g.later[id]) {
        g.later[id] = game.simTime || 1;
        g.done[id] = g.later[id];
        return true;
      }
    }
    return false;
  }

  function tick(game) {
    const g = ensure(game);
    if (!g.on || g.skipped) return;
    const beat = current(game);
    if (!beat) return;

    if (beat.id === 'select' && (g.sawSelect || (game.selectedIds && game.selectedIds.length))) {
      completeBeat(game, 'select');
    } else if (beat.id === 'gather' && (g.sawGather || game.globalDirective === 'GATHER')) {
      completeBeat(game, 'gather');
    } else if (beat.id === 'look' && g.sawPan) {
      completeBeat(game, 'look');
    } else if (beat.id === 'analyze' && g.sawAnalyze) {
      completeBeat(game, 'analyze');
    } else if (beat.id === 'build' && (g.sawBuild || (CM.structures && CM.structures.all(game).some(s => s.type === 'SHAFT')))) {
      completeBeat(game, 'build');
    } else if (beat.id === 'layers' && (game.viewDepth || 0) >= 1) {
      completeBeat(game, 'layers');
    } else if (beat.id === 'rivals' && (g.sawGift || (game.ui && game.ui.sawWorld))) {
      completeBeat(game, 'rivals');
    }
  }

  function serialize(game) {
    const g = game.guide;
    if (!g) return null;
    return { on: g.on, beat: g.beat, done: g.done, later: g.later, skipped: g.skipped };
  }

  function hydrate(game, data) {
    game.guide = {
      on: !!(data && data.on),
      beat: data && data.beat || 0,
      done: (data && data.done) || {},
      later: (data && data.later) || {},
      skipped: !!(data && data.skipped)
    };
  }

  CM.guide = { BEATS, LATER, ensure, start, skip, note, current, tick, serialize, hydrate };
})(window.CM = window.CM || {});
