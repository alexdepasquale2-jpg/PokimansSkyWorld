/* Resonant — the fractal store.
 *
 * The premise, stated plainly: there is exactly one body of information, and
 * every layer and every scale is a *rendering* of it under local rules. Two
 * things that look nothing alike — a spiral arm at the galactic tier and a
 * coiled flagellum at the cellular one — are the same essence wearing
 * different clothes, and learning to see that is the game's real progression.
 *
 * So nothing here is stored. There is no array of world objects anywhere in
 * this codebase. A *manifestation* is derived on demand from its address:
 *
 *     (worldSeed, tier, band, cellX, cellY, slot) ──hash──▶ manifestation
 *
 * That is what makes the space endless without being random: 22 tiers × 12
 * bands × an unbounded cell grid, every cell stable forever, none of it
 * costing a byte until it is looked at. And because the essence is drawn from
 * a hash that *excludes* tier and band, the same essence recurs across the
 * whole ladder — which is the thing the player is ultimately learning to
 * recognise.
 */
(function (RS) {
  'use strict';
  const { hashN, hashF, clamp01, lerp, TAU } = RS.core;

  /* The irreducible set. These are not content; they are the alphabet every
   * tier and layer spells its content out of. `forms` gives the local noun for
   * each of cosmos.js's geometries — this table *is* the "local rules" idea in
   * its most literal form. */
  const ESSENCES = [
    { id: 'boundary', name: 'Boundary', glyph: '⊂', hueShift: -18, complexity: 0.3,
      trait: 'Separates an inside from an outside, and is neither.',
      forms: { foam: 'Horizon Quantum', orbital: 'Valence Shell', chain: 'Membrane Fold',
        cell: 'Cell Wall', body: 'Coastline', disc: 'Galactic Rim', web: 'Void Wall', abstract: 'Distinction' } },
    { id: 'flow', name: 'Flow', glyph: '≈', hueShift: 12, complexity: 0.4,
      trait: 'Transport down a gradient. Never the same twice, always the same shape.',
      forms: { foam: 'Probability Current', orbital: 'Electron Drift', chain: 'Solvent Channel',
        cell: 'Cytoplasmic Stream', body: 'River', disc: 'Density Wave', web: 'Filament Flow', abstract: 'Mapping' } },
    { id: 'recursion', name: 'Recursion', glyph: '⟳', hueShift: 34, complexity: 0.9,
      trait: 'Contains a smaller copy of itself, and is a smaller copy of something.',
      forms: { foam: 'Self-Similar Foam', orbital: 'Nested Shell', chain: 'Branched Polymer',
        cell: 'Organelle Lineage', body: 'Fern Canopy', disc: 'Sub-Spiral', web: 'Nested Void', abstract: 'Fixed Point' } },
    { id: 'attractor', name: 'Attractor', glyph: '◎', hueShift: -34, complexity: 0.6,
      trait: 'Everything nearby ends up here regardless of where it started.',
      forms: { foam: 'Vacuum Minimum', orbital: 'Ground State', chain: 'Folded Core',
        cell: 'Nucleus', body: 'Basin', disc: 'Galactic Core', web: 'Great Attractor', abstract: 'Limit' } },
    { id: 'duality', name: 'Duality', glyph: '◐', hueShift: 96, complexity: 0.5,
      trait: 'One thing that must be described two incompatible ways at once.',
      forms: { foam: 'Virtual Pair', orbital: 'Spin Doublet', chain: 'Chirality',
        cell: 'Mitotic Pair', body: 'Binary', disc: 'Bar Mode', web: 'Filament Pair', abstract: 'Complement' } },
    { id: 'emergence', name: 'Emergence', glyph: '⁂', hueShift: 62, complexity: 1.0,
      trait: 'A property of the whole that none of the parts possess.',
      forms: { foam: 'Condensate', orbital: 'Molecular Bond', chain: 'Tertiary Fold',
        cell: 'Tissue', body: 'Swarm', disc: 'Spiral Pattern', web: 'Web Topology', abstract: 'Supervenience' } },
    { id: 'threshold', name: 'Threshold', glyph: '⌇', hueShift: 8, complexity: 0.45,
      trait: 'Below it nothing happens. Above it everything does.',
      forms: { foam: 'Symmetry Break', orbital: 'Ionisation Edge', chain: 'Melting Point',
        cell: 'Action Potential', body: 'Phase Change', disc: 'Star Formation Line', web: 'Collapse Density', abstract: 'Critical Value' } },
    { id: 'lattice', name: 'Lattice', glyph: '⧉', hueShift: -62, complexity: 0.55,
      trait: 'Order that repeats without a centre and without an edge.',
      forms: { foam: 'Spin Network', orbital: 'Crystal Cell', chain: 'Polymer Grid',
        cell: 'Cytoskeleton', body: 'Mineral Seam', disc: 'Resonance Ring', web: 'Sheet Structure', abstract: 'Group' } },
    { id: 'spiral', name: 'Spiral', glyph: '❋', hueShift: 22, complexity: 0.7,
      trait: 'Rotation that does not close. The compromise between orbit and escape.',
      forms: { foam: 'Vortex Quantum', orbital: 'Precessing Orbit', chain: 'Helix',
        cell: 'Coiled Flagellum', body: 'Cyclone', disc: 'Spiral Arm', web: 'Filament Curl', abstract: 'Iteration' } },
    { id: 'void', name: 'Void', glyph: '○', hueShift: 0, complexity: 0.15,
      trait: 'The absence that gives everything else its shape.',
      forms: { foam: 'False Vacuum', orbital: 'Forbidden Gap', chain: 'Vacancy',
        cell: 'Vacuole', body: 'Cavern', disc: 'Inter-arm Gap', web: 'Cosmic Void', abstract: 'Null Set' } },
    { id: 'seed', name: 'Seed', glyph: '✦', hueShift: 46, complexity: 0.35,
      trait: 'Compressed instructions for something enormously larger.',
      forms: { foam: 'Fluctuation', orbital: 'Nucleation Site', chain: 'Codon',
        cell: 'Spore', body: 'Germ', disc: 'Protostellar Core', web: 'Primordial Overdensity', abstract: 'Axiom' } },
    { id: 'weave', name: 'Weave', glyph: '⋈', hueShift: -8, complexity: 0.8,
      trait: 'Strength that exists only in the crossing, never in the strands.',
      forms: { foam: 'Entanglement', orbital: 'Hybrid Orbital', chain: 'Double Helix',
        cell: 'Mycelium', body: 'Root Mat', disc: 'Tidal Bridge', web: 'Filament Node', abstract: 'Relation' } },
    { id: 'cascade', name: 'Cascade', glyph: '⋔', hueShift: 74, complexity: 0.75,
      trait: 'One event that spends itself buying a thousand others.',
      forms: { foam: 'Decay Chain', orbital: 'Auger Cascade', chain: 'Reaction Cascade',
        cell: 'Signal Cascade', body: 'Avalanche', disc: 'Starburst', web: 'Merger Chain', abstract: 'Entailment' } },
    { id: 'memory', name: 'Memory', glyph: '⌸', hueShift: -46, complexity: 0.65,
      trait: 'The present shaped by something that has already stopped existing.',
      forms: { foam: 'Vacuum Imprint', orbital: 'Hysteresis', chain: 'Conformational State',
        cell: 'Methylation Mark', body: 'Strata', disc: 'Stellar Stream', web: 'Relic Structure', abstract: 'State' } }
  ];

  const ESSENCE_BY_ID = Object.create(null);
  ESSENCES.forEach((e, i) => { e.index = i; ESSENCE_BY_ID[e.id] = e; });

  /* Each layer contributes an adjective. This is the other half of "local
   * rules": the essence and the geometry fix the noun, the band colours how it
   * is experienced. `Spiral` at the galactic tier is a Spiral Arm; observed
   * through the emotional layer it is a *Yearning* Spiral Arm. */
  const BAND_ADJ = {
    baryonic: ['Dense', 'Cold', 'Massive', 'Settled', 'Inert'],
    thermal: ['Seething', 'Radiant', 'Cooling', 'Restless', 'Bright'],
    electromagnetic: ['Charged', 'Pulsing', 'Polarised', 'Resonant', 'Modulated'],
    probabilistic: ['Undecided', 'Smeared', 'Superposed', 'Contingent', 'Latent'],
    vital: ['Quickening', 'Metabolic', 'Hungry', 'Reproducing', 'Persisting'],
    emotive: ['Yearning', 'Grieving', 'Exultant', 'Fearful', 'Tender', 'Furious', 'Serene'],
    mnemonic: ['Remembered', 'Rehearsed', 'Half-Forgotten', 'Indexed', 'Recurring'],
    causal: ['Necessary', 'Antecedent', 'Contingent', 'Determining', 'Downstream'],
    archetypal: ['Original', 'Undisguised', 'Primary', 'Recurrent', 'Naked'],
    noetic: ['Self-Evident', 'Transparent', 'Immediate', 'Comprehended', 'Given'],
    null: ['Absent', 'Unwitnessed', 'Erased', 'Silent', 'Negative'],
    unity: ['Undivided', 'Total', 'Single', 'Whole']
  };

  /* Address hashing. Three separate salts so that changing tier does not
   * reshuffle the essence — that stability across tiers is the entire point. */
  const SALT_ESSENCE = 0x9E3779B1;
  const SALT_LOCAL = 0x85EBCA77;
  const SALT_SIG = 0xC2B2AE3D;

  /* The essence at a cell is a function of the cell alone, plus the world
   * seed. Not the tier. Not the band. That is the fractal invariant: descend
   * the ladder over the same cell and you meet the same essence, dressed
   * differently every time. */
  function essenceAt(worldSeed, cellX, cellY, slot) {
    const h = hashN(worldSeed ^ SALT_ESSENCE, cellX, cellY, slot | 0);
    return ESSENCES[h % ESSENCES.length];
  }

  /* The full local rendering. Everything a node needs to exist, be drawn, be
   * tuned into, and be scored. */
  function resolve(worldSeed, tierIndex, bandIndex, cellX, cellY, slot) {
    slot = slot | 0;
    const tier = RS.cosmos.TIERS[tierIndex];
    const band = RS.spectrum.BANDS[bandIndex];
    const essence = essenceAt(worldSeed, cellX, cellY, slot);

    /* Local salt mixes in tier and band, so presentation varies while identity
     * does not. */
    const lh = hashN(worldSeed ^ SALT_LOCAL, cellX, cellY, slot, tierIndex, bandIndex);
    const r = RS.core.rngFrom(lh);

    const adjs = BAND_ADJ[band.id] || ['Manifest'];
    const adj = adjs[hashN(lh, 11) % adjs.length];
    const form = essence.forms[tier.geometry] || essence.name;

    /* Tuning signature. The node sits *near* its band centre but offset within
     * it — so finding the band gets you in the room, and finding the node
     * still takes work. Precision upgrades are what make that second search
     * tractable rather than tedious. */
    const sh = hashN(worldSeed ^ SALT_SIG, cellX, cellY, slot, tierIndex, bandIndex);
    const off = (hashF(sh, 1) * 2 - 1) * band.width * 0.86;
    const signature = band.centre + off;

    /* Fourth-dimensional phase, and the local clock rate it exists at. A node
     * whose rate is negative only manifests with time running backwards. */
    const phase = hashF(sh, 2) * TAU;
    const rateRoll = hashF(sh, 3);
    const rate = rateRoll < 0.14 ? -(0.4 + hashF(sh, 4) * 1.4)
      : rateRoll < 0.24 ? 0
        : 0.35 + hashF(sh, 5) * 2.1;

    /* Potency: the payout scalar. Rarity is deliberately heavy-tailed — most
     * nodes are ordinary and roughly one in forty is worth chasing across the
     * spectrum for. */
    const rare = hashF(lh, 7);
    const rarity = rare > 0.988 ? 3 : rare > 0.955 ? 2 : rare > 0.83 ? 1 : 0;
    const potency = (0.55 + hashF(lh, 8) * 0.9) * [1, 2.1, 4.6, 11][rarity];

    return {
      /* identity — invariant across tier and band */
      essence,
      /* local presentation */
      name: adj + ' ' + form,
      form, adj,
      glyph: essence.glyph,
      tierIndex, bandIndex, cellX, cellY, slot,
      /* tuning targets */
      signature, phase, rate,
      /* scoring */
      potency, rarity,
      /* rendering parameters, all derived so they never need storing */
      hue: band.hue + essence.hueShift * (0.4 + 0.6 * hashF(lh, 9)),
      sat: band.sat,
      size: 0.55 + hashF(lh, 10) * 0.9 + rarity * 0.22,
      arms: 3 + (hashN(lh, 12) % 6),
      twist: (hashF(lh, 13) * 2 - 1),
      wobble: 0.3 + hashF(lh, 14) * 1.4,
      complexity: essence.complexity,
      seed: lh
    };
  }

  /* Address key for the gnosis ledger. Deliberately (essence, tier, band) and
   * not the cell: recognising the *same* essence in a *new* context is the
   * achievement, meeting another one down the street is not. */
  function contextKey(essenceId, tierIndex, bandIndex) {
    return essenceId + '@' + tierIndex + ':' + bandIndex;
  }

  /* Gnosis level for an essence: how many distinct (tier, band) contexts it
   * has been recognised in. Each new context is worth progressively more
   * because it is progressively harder to reach. */
  function gnosisOf(game, essenceId) {
    const set = game.gnosis[essenceId];
    return set ? set.length : 0;
  }

  /* Recognition. Returns whether this was a *new* context — the thing worth
   * celebrating — so callers can fire the big feedback only when earned. */
  function recognise(game, man) {
    const key = contextKey(man.essence.id, man.tierIndex, man.bandIndex);
    const list = game.gnosis[man.essence.id] || (game.gnosis[man.essence.id] = []);
    if (list.indexOf(key) >= 0) return { fresh: false, level: list.length };
    list.push(key);
    return { fresh: true, level: list.length };
  }

  /* Permanent bonus from understanding an essence deeply. Applies to every
   * manifestation of it, at every tier, in every layer — because it is one
   * piece of knowledge, not a per-instance buff. */
  function gnosisBonus(game, essenceId) {
    return 1 + gnosisOf(game, essenceId) * 0.085;
  }

  /* Total across the ledger, for the meta-progression readout. */
  function totalGnosis(game) {
    let n = 0;
    for (const k in game.gnosis) n += game.gnosis[k].length;
    return n;
  }

  RS.fractal = {
    ESSENCES, ESSENCE_BY_ID, BAND_ADJ,
    essenceAt, resolve, contextKey, gnosisOf, recognise, gnosisBonus, totalGnosis
  };
})(typeof window !== 'undefined' ? (window.RS = window.RS || {}) : (globalThis.RS = globalThis.RS || {}));
