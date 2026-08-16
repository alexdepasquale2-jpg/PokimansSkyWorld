/* Resonant — the field. The moment-to-moment game.
 *
 * You are a point at the centre. You cannot move, because a point of
 * consciousness has nowhere to go: what changes is not your position but
 * which information is being rendered to you. Manifestations drift through
 * the field, each carrying a tuning signature, and the loop is:
 *
 *     sweep ──▶ a smudge resolves ──▶ hold four dials on it ──▶ it crystallises
 *
 * ── The four-dial lock ─────────────────────────────────────────────────────
 *
 * Alignment is the product of four Gaussians, one per dial. On its own that
 * would be brutal, so each band declares how much it *demands* of each dial,
 * and the demand ramps with band index. The baryonic layer only really asks
 * for frequency and scale; by the causal layer all four are live and a node
 * exists in one narrow four-dimensional spot. That ramp is the difficulty
 * curve and it is also the tutorial: each new layer introduces exactly one
 * more thing to think about, which is the Spore trick applied to controls
 * rather than to body parts.
 *
 * ── Why hold, and not tap ──────────────────────────────────────────────────
 *
 * Coherence fills while aligned and drains while not. The payoff is gated on
 * a *sustained* state, because tension that builds and then releases is worth
 * far more than an instant reward — everything in feel.js and audio.js is
 * arranged around that ramp: the tone climbs, the beat slows, the ring
 * tightens, and then it breaks. Tap-to-collect would throw all of that away.
 */
(function (RS) {
  'use strict';
  const { clamp, clamp01, lerp, damp, TAU, hashF, hashN, angDelta } = RS.core;

  const FIELD_RADIUS = 1.0;      // normalised; the renderer scales to viewport
  const SPAWN_MARGIN = 1.16;     // nodes are born just outside the visible rim
  const BASE_CAPACITY = 14;

  function newField() {
    return {
      nodes: [],
      /* Per-(tier,band) address stream. Returning to a layer continues its own
       * sequence rather than restarting it, so a place you have worked feels
       * worked. */
      streams: Object.create(null),
      t: 0,
      tierIndex: RS.cosmos.ROOT_INDEX,
      bandIndex: 0,
      /* Rises when the rendered reality changes out from under the player;
       * the renderer uses it to tear the old layer apart and re-form. */
      upheaval: 0,
      lastTierIndex: RS.cosmos.ROOT_INDEX,
      lastBandIndex: 0,
      spawnAcc: 0,
      /* Causal layer bookkeeping: the essence most recently crystallised, which
       * is what unblocks its dependents. */
      lastCrystal: null
    };
  }

  function streamKey(t, b) { return t + ':' + b; }

  function nextAddress(field, tierIndex, bandIndex) {
    const k = streamKey(tierIndex, bandIndex);
    const n = (field.streams[k] = (field.streams[k] || 0) + 1);
    /* Spread the stream over a 2D cell space rather than a line, so the hash
     * inputs vary in both arguments and the essence sequence doesn't fall into
     * a short cycle. */
    return { cellX: n % 977, cellY: Math.floor(n / 977), slot: n % 7 };
  }

  /* Capacity scales with the tier's density — the quantum tiers are crowded,
   * the ensemble tiers nearly empty — and with focus, because a sharper
   * observer resolves more at once. */
  function capacityOf(game) {
    const dens = RS.cosmos.densityAt(game.dials.space.value);
    const foc = RS.dials.observerFocus(game.dials);
    return Math.round(BASE_CAPACITY * dens * (0.7 + foc * 0.9)) + 3;
  }

  // --- demands -------------------------------------------------------------

  /* How much each dial matters in a given band. Ramps in deliberately: this is
   * the mechanic-per-layer curve. */
  function demandsFor(bandIndex) {
    return {
      freq: 1,
      tier: 1,
      phase: clamp01((bandIndex - 1) / 2.6),
      rate: clamp01((bandIndex - 2) / 2.8)
    };
  }

  function gauss(d) { return Math.exp(-d * d); }

  /* A demand-weighted Gaussian: at demand 0 the term is a free 1, at demand 1
   * it is the raw Gaussian, and in between it is softened. */
  function term(d, demand) { return lerp(1, gauss(d), demand); }

  /* The full four-dial alignment for one node, plus the per-axis breakdown the
   * HUD needs to tell the player *which* dial is wrong — a lock they can't
   * diagnose is just noise. */
  function alignmentOf(game, node) {
    const D = game.dials;
    const man = node.man;
    const band = RS.spectrum.BANDS[man.bandIndex];
    const dem = demandsFor(man.bandIndex);

    const fFoc = RS.dials.focusOf(D.frequency);
    const pFoc = RS.dials.focusOf(D.phase);
    const tFoc = RS.dials.focusOf(D.time);
    const sFoc = RS.dials.focusOf(D.space);

    /* Focus widens the window: it buys the ability to *hold* a lock. Reach is
     * bought with range and landing is bought with precision — three upgrades,
     * three genuinely different jobs. */
    const fWin = band.width * 0.34 * (0.5 + 1.25 * fFoc);
    const pWin = 0.62 * (0.42 + 1.30 * pFoc);
    const rWin = 0.62 * (0.42 + 1.35 * tFoc);
    const sWin = 0.46 * (0.55 + 1.05 * sFoc);

    const fd = (D.frequency.value - man.signature) / fWin;
    const pd = angDelta(D.phase.value, man.phase) / pWin;
    const rd = (D.time.value - man.rate) / rWin;
    const sd = (D.space.value - man.tierIndex) / sWin;

    const af = term(fd, dem.freq);
    const ap = term(pd, dem.phase);
    const ar = term(rd, dem.rate);
    const as = term(sd, dem.tier);

    let total = af * ap * ar * as;

    /* The null layer scores inverted — everything the player learned reads
     * backwards, which is the entire joke of that band. */
    if (band.mode === 'inverted') total = 1 - total;
    /* Unity cannot be discriminated against: everything is partly aligned and
     * nothing is ever fully so. */
    if (band.mode === 'unity') total = 0.45 + total * 0.5;

    return { total: clamp01(total), f: af, p: ap, r: ar, s: as, fd, pd, rd, sd, dem };
  }

  // --- spawning ------------------------------------------------------------

  function spawnNode(game, field) {
    const tierIndex = clamp(Math.round(game.dials.space.value), 0, RS.cosmos.TIERS.length - 1);
    /* Which layer a node belongs to is biased toward — but not locked to — the
     * band being observed. A quarter of nodes come from neighbouring bands, so
     * the spectrum always feels like it is bleeding at the edges and there is
     * always something just off-tune to chase. */
    let bandIndex = field.bandIndex;
    const spread = hashF(hashN(game.seed, field.t * 1000 | 0, 3));
    if (spread > 0.78) {
      const dir = spread > 0.89 ? 1 : -1;
      const alt = bandIndex + dir;
      const focus = RS.dials.focusOf(game.dials.frequency);
      if (alt >= 0 && alt < RS.spectrum.BANDS.length &&
          RS.spectrum.BANDS[alt].centre <= game.dials.frequency.max &&
          !RS.spectrum.isGhost(RS.spectrum.BANDS[alt], focus)) bandIndex = alt;
    }

    const addr = nextAddress(field, tierIndex, bandIndex);
    const man = RS.fractal.resolve(game.seed, tierIndex, bandIndex, addr.cellX, addr.cellY, addr.slot);
    const band = RS.spectrum.BANDS[bandIndex];
    const h = hashN(man.seed, 31);

    const ang = hashF(h, 1) * TAU;
    const rad = FIELD_RADIUS * SPAWN_MARGIN;
    /* Nodes drift on slow near-circular paths rather than straight lines —
     * straight lines leave the field too fast to ever be tuned into, and an
     * orbit reads as "this place has structure". */
    const orbit = 0.30 + hashF(h, 2) * 0.62;
    const node = {
      id: 'n' + (game.__nodeSeq = (game.__nodeSeq || 0) + 1),
      man, band,
      ang, rad,
      targetRad: orbit,
      spin: (hashF(h, 3) * 2 - 1) * 0.32 * band.drift,
      bob: hashF(h, 4) * TAU,
      x: Math.cos(ang) * rad, y: Math.sin(ang) * rad,
      age: 0,
      life: 26 + hashF(h, 5) * 34,
      fade: 0,               // 0..1 presence, springs in and out
      align: 0, alignParts: null,
      coherence: 0,
      resolved: 0,           // 0..1 how much of its identity is legible
      crystallised: false,
      dying: false,
      /* mode-specific live state */
      gate: 1,               // electromagnetic: open/closed window
      gatePhase: hashF(h, 6) * TAU,
      twinAng: ang + Math.PI * (0.6 + hashF(h, 7) * 0.8), // probabilistic
      twinReal: hashF(h, 8) < 0.5,
      collapsed: false,
      valence: hashF(h, 9) * 2 - 1,                        // emotive
      depth: 0,                                            // recursive nesting
      parent: null,
      blocked: false                                       // causal
    };
    field.nodes.push(node);
    return node;
  }

  /* Recursive layers: crystallising a parent exposes its children, which are
   * resolved from the *same* cell one slot deeper. Descent is the payout. */
  function spawnChildren(game, field, parent) {
    const n = 2 + (hashN(parent.man.seed, 41) % 2);
    for (let i = 0; i < n; i++) {
      const man = RS.fractal.resolve(game.seed, parent.man.tierIndex, parent.man.bandIndex,
        parent.man.cellX, parent.man.cellY, parent.man.slot + 1 + i);
      const h = hashN(man.seed, 53);
      const ang = parent.ang + (i - (n - 1) / 2) * 0.55;
      field.nodes.push({
        id: 'n' + (game.__nodeSeq = (game.__nodeSeq || 0) + 1),
        man, band: parent.band,
        ang, rad: parent.rad,
        targetRad: clamp(parent.targetRad - 0.1, 0.16, 0.95),
        spin: parent.spin * 1.3,
        bob: hashF(h, 4) * TAU,
        x: parent.x, y: parent.y,
        age: 0, life: 22 + hashF(h, 5) * 18,
        fade: 0, align: 0, alignParts: null, coherence: 0, resolved: 0.4,
        crystallised: false, dying: false,
        gate: 1, gatePhase: hashF(h, 6) * TAU,
        twinAng: ang + Math.PI, twinReal: hashF(h, 8) < 0.5, collapsed: false,
        valence: hashF(h, 9) * 2 - 1,
        depth: parent.depth + 1, parent: parent.id, blocked: false,
        /* Children are worth more the deeper they are — that is the whole
         * reason to chase the nesting. */
        bonus: Math.pow(1.85, parent.depth + 1)
      });
    }
  }

  // --- tick ----------------------------------------------------------------

  function tick(game, bus, dt) {
    const field = game.field;
    const D = game.dials;

    /* The local clock. The TIME dial is a multiplier on it, and the tier sets
     * its base rate — so 1× at the Planck tier is nothing like 1× at the
     * supercluster tier, which is the point. */
    const tierClock = RS.cosmos.clockAt(D.space.value);
    const flow = D.time.value * tierClock;
    field.t += dt * Math.abs(flow);

    const tierIndex = clamp(Math.round(D.space.value), 0, RS.cosmos.TIERS.length - 1);
    const focus = RS.dials.focusOf(D.frequency);
    const spec = RS.spectrum.sample(D.frequency.value, focus, game.__spec || (game.__spec = []));
    const bandIndex = spec.dominant.index;

    /* Reality changing out from under you is an event, not a transition. */
    if (tierIndex !== field.lastTierIndex || bandIndex !== field.lastBandIndex) {
      const bigJump = tierIndex !== field.lastTierIndex;
      field.upheaval = Math.min(1, field.upheaval + (bigJump ? 1 : 0.55));
      bus.emit('field:shift', {
        tierIndex, bandIndex,
        fromTier: field.lastTierIndex, fromBand: field.lastBandIndex,
        big: bigJump
      });
      /* Nodes belonging to the reality you just left do not survive it. They
       * are released rather than deleted so they visibly dissolve. */
      for (const n of field.nodes) {
        if (n.man.tierIndex !== tierIndex) { n.dying = true; }
      }
      field.lastTierIndex = tierIndex;
      field.lastBandIndex = bandIndex;
    }
    field.tierIndex = tierIndex;
    field.bandIndex = bandIndex;
    field.upheaval = damp(field.upheaval, 0, 1.9, dt);

    /* Spawning. Rate follows how much of the spectrum is actually manifesting:
     * tuned to nothing, almost nothing appears, which makes the empty parts of
     * the axis feel genuinely empty rather than merely unrewarding. */
    const cap = capacityOf(game);
    const manifestStrength = clamp01(spec.peak);
    field.spawnAcc += dt * (0.55 + manifestStrength * 2.3);
    while (field.spawnAcc >= 1 && field.nodes.length < cap) {
      field.spawnAcc -= 1;
      spawnNode(game, field);
    }
    if (field.spawnAcc > 3) field.spawnAcc = 3;

    const holdRate = 0.55 + RS.dials.observerFocus(D) * 0.85;

    for (let i = field.nodes.length - 1; i >= 0; i--) {
      const n = field.nodes[i];
      const band = n.band;

      n.age += dt;

      // ── presence ──────────────────────────────────────────────────────
      const wantFade = n.dying ? 0 : 1;
      n.fade = damp(n.fade, wantFade, n.dying ? 2.6 : 1.5, dt);
      if (n.dying && n.fade < 0.01) { field.nodes.splice(i, 1); continue; }
      if (!n.dying && n.age > n.life) { n.dying = true; }

      // ── drift ─────────────────────────────────────────────────────────
      /* Orbital motion, scaled by the band's drift character and the local
       * clock. Under negative time it genuinely runs backwards. */
      const sgn = Math.sign(flow) || 1;
      n.ang += n.spin * dt * sgn * (0.6 + band.drift * 0.7);
      n.rad = damp(n.rad, n.targetRad, 0.5, dt);
      /* A slow bob keeps everything alive even when the player is not moving
       * a dial — a still field reads as a broken field. */
      const bobAmt = 0.022 * (1 + band.drift);
      const bx = Math.cos(field.t * 0.7 + n.bob) * bobAmt;
      const by = Math.sin(field.t * 0.53 + n.bob * 1.7) * bobAmt;
      n.x = Math.cos(n.ang) * n.rad + bx;
      n.y = Math.sin(n.ang) * n.rad + by;

      // ── mode rules ────────────────────────────────────────────────────
      applyMode(game, field, n, band, dt, sgn);

      // ── alignment ─────────────────────────────────────────────────────
      const a = alignmentOf(game, n);
      n.alignParts = a;
      let eff = a.total * n.gate;
      if (band.mode === 'superposed' && !n.collapsed && !n.twinReal) eff *= 0.35;
      if (n.blocked) eff *= 0.15;
      n.align = damp(n.align, eff, 12, dt);

      /* Resolution: a node you are anywhere near begins to become legible.
       * Below that it is an unresolved smudge with no name and no glyph — the
       * fog of war is over *identity*, not position. */
      const wantRes = clamp01((n.align - 0.06) / 0.30);
      n.resolved = damp(n.resolved, Math.max(n.resolved * 0.998, wantRes), 3.2, dt);

      // ── coherence ─────────────────────────────────────────────────────
      if (!n.crystallised) {
        const need = 0.52;
        if (n.align > need) {
          const gain = (n.align - need) / (1 - need);
          const before = n.coherence;
          n.coherence = clamp01(n.coherence + gain * holdRate * dt / holdTimeOf(n));
          /* Crossing 25/50/75% is worth marking — the ramp needs waypoints or
           * the last second of a long hold feels unearned. */
          for (const mark of [0.25, 0.5, 0.75]) {
            if (before < mark && n.coherence >= mark) {
              bus.emit('node:step', { node: n, mark });
            }
          }
          if (n.coherence >= 1) crystallise(game, bus, field, n);
        } else {
          /* Accretion layers hold what they have gained; everything else
           * bleeds. That single difference is what makes the baryonic layer
           * feel like an idle game and the thermal layer feel like a chase. */
          const decay = band.mode === 'accretion' ? 0.035 : 0.14 * (1 + band.drift);
          n.coherence = Math.max(0, n.coherence - decay * dt);
        }
      }
    }

    /* Passive accretion: the baryonic layer pays a trickle without attention,
     * which is what makes leaving the game running mean something. */
    if (RS.spectrum.BANDS[bandIndex].mode === 'accretion') {
      game.insight += game.passiveRate * dt;
    }

    updateDerived(game);
  }

  /* Hold time scales with what the node is worth. A common node is a beat; a
   * rare one at a deep layer is a genuine sustained effort, and the audio ramp
   * has room to become an event. */
  function holdTimeOf(n) {
    return (1.15 + n.man.potency * 0.42 + n.man.rarity * 0.9) / (1 + n.depth * 0.25);
  }

  function applyMode(game, field, n, band, dt, sgn) {
    switch (band.mode) {
      case 'pulse': {
        /* Rhythmic gating. The window is generous enough to be fair and tight
         * enough that you play to the beat rather than around it. */
        n.gatePhase += dt * 2.1 * sgn;
        const s = (Math.sin(n.gatePhase) + 1) / 2;
        n.gate = s > 0.42 ? 1 : clamp01((s - 0.16) / 0.26);
        break;
      }
      case 'superposed': {
        /* Two positions, one of them load-bearing. Sustained attention
         * collapses the pair — observation is the mechanic, not a metaphor. */
        n.twinAng += n.spin * dt * 0.6 * sgn;
        if (!n.collapsed && n.coherence > 0.3) n.collapsed = true;
        n.gate = 1;
        break;
      }
      case 'valence': {
        /* Emotional physics: like valences cluster, opposites push apart, and
         * the resulting pattern *is* the layer's appearance. */
        let fx = 0, fy = 0;
        for (const o of field.nodes) {
          if (o === n || o.band !== band) continue;
          const dx = o.x - n.x, dy = o.y - n.y;
          const d2 = dx * dx + dy * dy + 0.004;
          const affinity = n.valence * o.valence;
          const f = affinity * 0.0016 / d2;
          fx += dx * f; fy += dy * f;
        }
        n.targetRad = clamp(n.targetRad + (fx * n.x + fy * n.y) * dt * 4, 0.16, 1.02);
        n.spin += (fy * n.x - fx * n.y) * dt * 2.5;
        n.spin = clamp(n.spin, -0.9, 0.9);
        n.gate = 1;
        break;
      }
      case 'causal': {
        /* A node cannot be held before its antecedent has been. The antecedent
         * is another essence, derived from this one — so the layer is a
         * dependency graph you have to read and satisfy in order. */
        const need = RS.fractal.ESSENCES[(n.man.essence.index + 3) % RS.fractal.ESSENCES.length];
        n.antecedent = need;
        n.blocked = !(field.lastCrystal && field.lastCrystal === need.id);
        n.gate = 1;
        break;
      }
      case 'flux':
        /* Thermal nodes cool as they age — the longer you dither, the less
         * they are worth, so the layer rewards decisiveness. */
        n.targetRad = clamp(n.targetRad + dt * 0.02 * sgn, 0.16, 1.1);
        n.gate = 1;
        break;
      case 'unity':
        n.gate = 1;
        break;
      default:
        n.gate = 1;
    }
  }

  function crystallise(game, bus, field, n) {
    n.crystallised = true;
    n.coherence = 1;
    n.dying = true;

    const man = n.man;
    const band = RS.spectrum.BANDS[man.bandIndex];
    const tier = RS.cosmos.TIERS[man.tierIndex];

    /* Payout. Every multiplier here is knowledge the player earned rather than
     * a number that went up on its own: the band they reached, the distance
     * from the root they are holding, and how well they understand this
     * particular essence across the whole ladder. */
    const gnosisMul = RS.fractal.gnosisBonus(game, man.essence.id);
    const depthMul = 1 + RS.cosmos.depthFromRoot(man.tierIndex) * 0.09;
    const nestMul = n.bonus || 1;
    const amount = man.potency * band.yield * gnosisMul * depthMul * nestMul * game.yieldMul;

    game.insight += amount;
    game.stats.crystals++;
    game.stats.bestSingle = Math.max(game.stats.bestSingle, amount);

    /* Discovery bookkeeping — this is what fills in the map. */
    const firstBand = !game.known.bands[band.id];
    const firstTier = !game.known.tiers[tier.id];
    game.known.bands[band.id] = true;
    game.known.tiers[tier.id] = true;

    const rec = RS.fractal.recognise(game, man);
    field.lastCrystal = man.essence.id;

    bus.emit('node:crystallise', {
      node: n, amount, man, band, tier,
      recognition: rec, firstBand, firstTier
    });
    if (firstBand) bus.emit('discover:band', { band });
    if (firstTier) bus.emit('discover:tier', { tier });
    if (rec.fresh) bus.emit('discover:gnosis', { essence: man.essence, level: rec.level, man });

    if (band.mode === 'recursive' && n.depth < 4) spawnChildren(game, field, n);
  }

  /* Aggregates the HUD and the economy read every frame. */
  function updateDerived(game) {
    let best = null;
    for (const n of game.field.nodes) {
      if (n.dying || n.crystallised) continue;
      if (!best || n.align > best.align) best = n;
    }
    game.focusNode = best;

    /* Passive income is a function of how much of the ladder has been opened —
     * an idle floor that grows as the game does, so returning after a while is
     * always worth something. */
    const bands = Object.keys(game.known.bands).length;
    const tiers = Object.keys(game.known.tiers).length;
    game.passiveRate = (bands * 0.22 + tiers * 0.14) * (1 + RS.fractal.totalGnosis(game) * 0.03);
  }

  /* Offline accrual, applied once on load. Capped so the game is never better
   * played by not playing it. */
  function applyOffline(game, seconds) {
    const capped = Math.min(seconds, 8 * 3600);
    const gained = game.passiveRate * capped * 0.4;
    if (gained > 0.5) game.insight += gained;
    return { seconds: capped, gained };
  }

  RS.field = {
    FIELD_RADIUS, newField, tick, alignmentOf, demandsFor, capacityOf,
    holdTimeOf, spawnNode, applyOffline, updateDerived
  };
})(typeof window !== 'undefined' ? (window.RS = window.RS || {}) : (globalThis.RS = globalThis.RS || {}));
