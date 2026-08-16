/* Resonant — the guide, and the map of progression.
 *
 * ── Why this is generated rather than written ─────────────────────────────
 *
 * This game asks a player to understand four continuous dials, a 22-rung scale
 * ladder, twelve reality layers, four scenes, ten vessel types and a contact
 * protocol. A static manual for that would be long, and — worse — it would
 * describe the game in general while the player is looking at a specific
 * situation they do not understand.
 *
 * So every panel here is derived from live state. The dial section says what
 * τ does *right now*, in this mode, in this body. The ladder shows which rungs
 * are actually open and which one you are on. The pathways show what each
 * route has cost you and what it has given you. A player who is confused can
 * open this and read about the thing in front of them rather than about the
 * game in the abstract.
 *
 * ── The three pathways ────────────────────────────────────────────────────
 *
 * The progression panel exists because this game has three genuinely different
 * routes forward and no obvious way to tell that from the inside:
 *
 *   TUNE     spectrum bands → gnosis → yield everywhere. Pure skill; needs
 *            nothing but dials. Always available, never mandatory.
 *   REACH    research → vessels → worlds → structures. The material route.
 *   CONTACT  find a culture → standing → charts and teaching. The shortcut
 *            route: a civilisation can hand you research and reveal stars
 *            your own field cannot reach.
 *
 * They feed each other — insight from any of them buys any of them — but a
 * player can lead with whichever suits them, and the panel says so explicitly
 * rather than leaving it to be inferred.
 */
(function (RS) {
  'use strict';
  const { fmt, clamp01, hsl } = RS.core;

  /* Live meaning of each dial, in the mode the player is actually in. */
  function dialRows(game) {
    const embodied = game.inhabiting;
    const arch = RS.vessel.archOf(game.body);
    const D = game.dials;

    if (embodied) {
      const m = arch.dialMap;
      return [
        { sym: 'τ', hue: 43, name: 'Time', does: m.time,
          now: D.time.value.toFixed(2) + '×',
          note: 'While you have a body, τ is your throttle. Negative reverses.' },
        { sym: 'Σ', hue: 338, name: 'Space', does: m.space,
          now: (clamp01((D.space.value - D.space.min) / Math.max(1e-6, D.space.max - D.space.min)) * 100).toFixed(0) + '%',
          note: 'Your vertical axis in this body — it does not move the scale ladder while embodied.' },
        { sym: 'Δ', hue: 268, name: 'Phase', does: m.phase,
          now: (D.phase.value * 57.3).toFixed(0) + '°',
          note: 'A closed circle, which is exactly what a heading is.' },
        { sym: 'φ', hue: 187, name: 'Frequency', does: m.frequency,
          now: 'φ' + D.frequency.value.toFixed(1),
          note: 'Which layer your senses are tuned to.' }
      ];
    }
    return [
      { sym: 'τ', hue: 43, name: 'Time', does: 'scrubs history',
        now: D.time.value.toFixed(2) + '×',
        note: 'Unembodied, τ moves through a world\'s past and future. Populations, ' +
          'technologies and prices are closed-form, so this is exact at any distance.' },
      { sym: 'Σ', hue: 338, name: 'Space', does: 'moves the scale ladder',
        now: RS.cosmos.tierAt(D.space.value).name,
        note: 'Turning Σ inward descends: map → system → surface. It is the only navigation.' },
      { sym: 'Δ', hue: 268, name: 'Phase', does: 'the fourth dimension',
        now: (D.phase.value * 57.3).toFixed(0) + '°',
        note: 'Selects which slice of a worldline is present. Required by most layers, and by carriers.' },
      { sym: 'φ', hue: 187, name: 'Frequency', does: 'selects the reality layer',
        now: 'φ' + D.frequency.value.toFixed(1) + ' / ' + D.frequency.max.toFixed(0) + ' reach',
        note: 'The axis everything else is read against. Civilisations broadcast on it too.' }
    ];
  }

  const SYMBOLS = [
    { g: 'Ψ', name: 'Insight', what: 'Spent. Buys dial upgrades, research and structures.' },
    { g: '◈', name: 'Gnosis', what: 'Never spent. Counts contexts you have recognised an essence in. Pays out everywhere at once.' },
    { g: '◉', name: 'Contact', what: 'A civilisation is within earshot. The button only appears when one is.' },
    { g: '◎', name: 'Reach ring', what: 'On the map: the edge of your consciousness field. Inside it, stars are places; outside, lights.' },
    { g: '○', name: 'Green ring', what: 'On the map: that system holds life.' },
    { g: '◍', name: 'Amber pulse', what: 'On the map: that system is inhabited. This is the rarest marker in the game.' },
    { g: '⌇', name: 'Ghost layer', what: 'A band you can see and cannot hold. Buy φ FOCUS.' },
    { g: '⊘', name: 'Dashed ring', what: 'On a node: blocked. On the map: charted by somebody else, not by you.' }
  ];

  function guideHTML(game) {
    const D = game.dials;
    const sc = game.scene;
    let h = '';

    // ── where you are, right now ──
    h += '<section><h3>Right now</h3>' +
      '<p class="blurb">You are a point of consciousness. You cannot move. ' +
      'You change what is <em>rendered</em> to you, and everything else follows.</p>' +
      '<div class="stats">' +
      '<div>Scene <b>' + sc.kind.toUpperCase() + '</b></div>' +
      '<div>Mode <b style="color:' + (game.inhabiting ? '#fca5a5' : '#7dd3fc') + '">' +
        (game.inhabiting ? 'PILOTING — ' + RS.vessel.archOf(game.body).name : 'OBSERVING') + '</b></div>' +
      '<div>Scale <b>' + RS.cosmos.tierAt(D.space.value).name + '</b></div>' +
      '<div>Next <b>' + RS.game.sceneObjective(game).text.slice(0, 46) + '</b></div>' +
      '</div></section>';

    // ── the dials, as they mean things right now ──
    h += '<section><h3>Your four dials <em>' +
      (game.inhabiting ? 'piloting' : 'observing') + '</em></h3>' +
      '<p class="blurb">The dials are the whole interface. They mean different things ' +
      'in different modes — that is the only thing you have to keep track of.</p><div class="list">';
    for (const r of dialRows(game)) {
      h += '<div class="row" style="--h:' + r.hue + '">' +
        '<span class="g">' + r.sym + '</span>' +
        '<span class="n">' + r.name + ' — ' + r.does + '<em>' + r.now + '</em></span>' +
        '<span class="d">' + r.note + '</span></div>';
    }
    h += '</div>' +
      '<p class="blurb">Drag a knob in a circle. <b>Swing your finger wide for fine control</b> — ' +
      'sensitivity falls off with distance from the hub. Double-tap latches fine mode. ' +
      'Two thumbs work two dials at once.</p></section>';

    // ── the ladder ──
    h += '<section><h3>The scale ladder <em>Σ</em></h3>' +
      '<p class="blurb">Turning Σ is how you travel. Each range of rungs shows a different world.</p>' +
      '<div class="list">';
    const rungs = [
      { name: 'Attunement field', range: 'galactic and beyond', what: 'Tune reality layers. Where insight and gnosis come from.',
        active: sc.kind === 'field', hue: 338 },
      { name: 'Galactic map', range: 'interstellar · cluster', what: 'The stars around you. Choose where to go.',
        active: sc.kind === 'galaxy', hue: 190 },
      { name: 'System', range: 'stellar · planetary system', what: 'Planets, moons, belts, trade, and anybody living there.',
        active: sc.kind === 'system', hue: 285 },
      { name: 'Surface', range: 'planetary and within', what: 'Stand on a world. Needs a body.',
        active: sc.kind === 'planet', hue: 130 },
      { name: 'Cytoplasm', range: 'cellular', what: 'Inside one cell of a living world. Work here and its biosphere changes.',
        active: sc.kind === 'cellular', hue: 150 },
      { name: 'Quantum foam', range: 'planck · quantum', what: 'Nothing persists, including your body. Find the pair that never cancelled.',
        active: sc.kind === 'foam', hue: 291 },
      { name: 'Cosmic web', range: 'local group → hubble volume', what: 'τ is the age of the universe. Catch a filament while it assembles.',
        active: sc.kind === 'web', hue: 276 }
    ];
    for (const r of rungs) {
      h += '<div class="row' + (r.active ? '' : ' dim') + '" style="--h:' + r.hue + '">' +
        '<span class="g">' + (r.active ? '◉' : '○') + '</span>' +
        '<span class="n">' + r.name + '<em>Σ ' + r.range + '</em></span>' +
        '<span class="d">' + r.what + '</span></div>';
    }
    const reachLo = RS.cosmos.TIERS[Math.round(D.space.min)].short;
    const reachHi = RS.cosmos.TIERS[Math.round(D.space.max)].short;
    h += '</div><p class="blurb">Your Σ reaches <b>' + reachLo + '</b> to <b>' + reachHi +
      '</b>. Buy Σ RANGE to open the ladder further in either direction.</p></section>';

    // ── symbols ──
    h += '<section><h3>What the symbols mean</h3><div class="list">';
    for (const s of SYMBOLS) {
      h += '<div class="row" style="--h:200"><span class="g">' + s.g + '</span>' +
        '<span class="n">' + s.name + '</span><span class="d">' + s.what + '</span></div>';
    }
    h += '</div></section>';

    // ── the beat ──
    h += '<section><h3>Tuning by ear</h3>' +
      '<p class="blurb">Two tones close in pitch beat against each other. Far off tune, a fast ' +
      'warble; close, a slow throb; dead on, silence and a steady tone. The φ dial drives a real ' +
      'detuned oscillator pair, so <b>you can find a layer with your eyes shut</b> — and the ring ' +
      'around you pulses at the same rate if you are playing muted. This is the single most useful ' +
      'thing to learn.</p></section>';

    return h;
  }

  // ── progression ──────────────────────────────────────────────────────────

  function pathwaysHTML(game) {
    const D = game.dials;
    const bands = Object.keys(game.known.bands).length;
    const tiers = Object.keys(game.known.tiers).length;
    const gn = RS.fractal.totalGnosis(game);
    const res = Object.keys(game.research).length;
    const worlds = Object.keys(game.known.planets).length;
    const systems = Object.keys(game.known.systems).length;
    const charted = Object.keys(game.known.charted).length;
    const met = RS.contact.totalMet(game);
    const allies = RS.contact.allies(game);

    let h = '<section><h3>Three ways forward</h3>' +
      '<p class="blurb">They feed each other — insight from any route buys any other — ' +
      'but you can lead with whichever suits you. None of them is the main one.</p></section>';

    const paths = [
      {
        name: 'TUNE', hue: 187,
        premise: 'Skill with the dials. Needs nothing but the instrument you already have.',
        rows: [
          ['Layers held', bands + ' / ' + RS.spectrum.BANDS.length],
          ['Scales visited', tiers + ' / ' + RS.cosmos.TIERS.length],
          ['Gnosis', gn + ' contexts'],
          ['φ reach', 'φ' + D.frequency.max.toFixed(0)],
          ['φ focus', (RS.dials.focusOf(D.frequency) * 100).toFixed(0) + '%']
        ],
        next: nextTuning(game)
      },
      {
        name: 'REACH', hue: 130,
        premise: 'Research, bodies, worlds, structures. The material route.',
        rows: [
          ['Research', res + ' / ' + RS.influence.RESEARCH.length],
          ['Bodies', Object.keys(game.vessels.unlocked).length + ' / ' + RS.vessel.ARCHETYPES.length],
          ['Systems visited', systems],
          ['Worlds surveyed', worlds],
          ['Structures sited', RS.influence.structureCount(game)],
          ['Consciousness field', game.fields.consciousness.toFixed(2) +
            ' (' + (RS.influence.reachRadius(game) * RS.galaxy.LY_PER_SECTOR).toFixed(0) + ' ly)']
        ],
        next: nextReach(game)
      },
      {
        name: 'CONTACT', hue: 45,
        premise: 'Find a culture and stay on good terms. They hand you charts and teach you research ' +
          'you would otherwise have to buy.',
        rows: [
          ['Cultures met', met],
          ['Allies', allies],
          ['Stars charted by others', charted],
          ['Reality field', game.fields.reality.toFixed(2)]
        ],
        next: nextContact(game)
      }
    ];

    for (const p of paths) {
      h += '<section class="up-dial" style="--h:' + p.hue + '">' +
        '<header><span class="sym">◈</span><h3>' + p.name + '</h3></header>' +
        '<p class="blurb">' + p.premise + '</p><div class="stats">';
      for (const [k, v] of p.rows) h += '<div>' + k + ' <b>' + v + '</b></div>';
      h += '</div><p class="blurb" style="color:hsl(' + p.hue + ',80%,70%)">→ ' + p.next + '</p></section>';
    }

    // overall
    const prog = RS.game.progress(game);
    h += '<section><h3>Overall</h3><div class="stats">' +
      '<div>Progress <b>' + (prog * 100).toFixed(1) + '%</b></div>' +
      '<div>Lifetime insight <b>' + fmt(game.lifetimeInsight) + ' Ψ</b></div>' +
      '<div>Crystallised <b>' + fmt(game.stats.crystals) + '</b></div>' +
      '<div>Jumps <b>' + (game.stats.jumps || 0) + '</b></div>' +
      '<div>Played <b>' + fmt(Math.floor(game.stats.playSeconds / 60)) + ' min</b></div>' +
      '</div></section>';
    return h;
  }

  function nextTuning(game) {
    const D = game.dials;
    const foc = RS.dials.focusOf(D.frequency);
    for (const b of RS.spectrum.BANDS) {
      if (game.known.bands[b.id]) continue;
      if (b.centre > D.frequency.max) continue;
      if (RS.spectrum.isGhost(b, foc)) return 'Buy φ FOCUS — ' + b.name + ' is in reach but will not cohere.';
      return 'Tune φ to ' + b.centre + ' and hold: the ' + b.name + ' layer is untouched.';
    }
    const nb = RS.spectrum.BANDS.find(b => b.centre > D.frequency.max);
    return nb ? 'Buy φ RANGE to reach the ' + nb.name + ' layer at φ' + nb.centre + '.'
      : 'Every layer is held. Deepen gnosis by finding the same essences at new scales.';
  }

  function nextReach(game) {
    const open = RS.influence.RESEARCH.filter(n => RS.influence.researchAvailable(game, n));
    if (open.length) {
      const cheap = open.reduce((a, b) => (a.cost < b.cost ? a : b));
      return 'Research ' + cheap.name + ' (' + fmt(cheap.cost) + ' Ψ) — ' + cheap.blurb;
    }
    if (!RS.influence.structureCount(game)) return 'Site your first structure on a world you care about.';
    return 'Raise the consciousness field with beacons to reach further stars.';
  }

  function nextContact(game) {
    const met = RS.contact.totalMet(game);
    const c = game.scene.contact;
    if (c) {
      const st = RS.contact.stateOf(game, c.planet, c.civ, c.lock);
      if (st === RS.contact.STATES.open || st === RS.contact.STATES.warm) {
        return 'A channel is open with ' + c.civ.name + '. Listen first — it costs nothing.';
      }
      return 'Tune φ to ' + c.lock.carrier.phi.toFixed(1) + ' to reach ' + c.civ.name + '.';
    }
    if (!met) {
      const foc = RS.dials.focusOf(game.dials.frequency);
      const mn = RS.spectrum.BY_ID.mnemonic;
      if (mn.centre > game.dials.frequency.max) {
        return 'Nobody is reachable yet: the lowest carrier band sits at φ' + mn.centre +
          ', past your dial. Buy φ RANGE.';
      }
      if (RS.spectrum.isGhost(mn, foc)) {
        return 'You can reach the Mnemonic layer but not hold it. Buy φ FOCUS.';
      }
      return 'Look for amber pulsing rings on the galactic map, then descend into that system.';
    }
    return 'Raise standing above +0.45 with an ally and ask them to teach you.';
  }

  RS.guide = { guideHTML, pathwaysHTML, dialRows, SYMBOLS };
})(typeof window !== 'undefined' ? (window.RS = window.RS || {}) : (globalThis.RS = globalThis.RS || {}));
