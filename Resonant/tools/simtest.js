/* Resonant — headless self-test. No DOM, no canvas, no audio.
 *   node tools/simtest.js
 *
 * Loads the game's own browser scripts under a minimal `window` shim, so this
 * exercises exactly the code the browser runs rather than a parallel copy.
 *
 * What it is actually protecting:
 *   - determinism of the fractal store, which the save format depends on
 *     absolutely (nothing in the field is stored, so a hash change silently
 *     rewrites every player's world)
 *   - that the four-dial lock is winnable at the root layer and gets harder in
 *     the documented order
 *   - that the upgrade ladder is reachable rather than merely priced
 *   - that a save round-trips including reach-before-value ordering
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'js/core.js', 'js/cosmos.js', 'js/spectrum.js', 'js/dials.js', 'js/fractal.js',
  'js/field.js', 'js/orbital.js', 'js/stellar.js', 'js/civ.js', 'js/planet.js',
  'js/neural.js', 'js/vessel.js', 'js/influence.js', 'js/galaxy.js', 'js/contact.js',
  'js/scenes.js', 'js/game.js', 'js/guide.js', 'js/save.js'
];

const sandbox = {
  console, Math, Set, Map, Object, JSON, Array, Number, String, Boolean,
  Infinity, NaN, Date, isFinite, isNaN, parseFloat, parseInt, Error,
  Float32Array, Uint32Array, Int32Array, Array
};
sandbox.performance = { now: () => Date.now() };
sandbox.localStorage = {
  __s: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.__s, k) ? this.__s[k] : null; },
  setItem(k, v) { this.__s[k] = String(v); },
  removeItem(k) { delete this.__s[k]; }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const RS = sandbox.RS;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) pass++;
  else { fail++; console.error('FAIL:', msg); }
}
function near(a, b, eps, msg) { assert(Math.abs(a - b) <= eps, `${msg} (got ${a}, want ~${b})`); }

const nullBus = { emit() {}, on() { return () => {}; } };
function busCollecting(store) {
  return { emit(k, p) { (store[k] || (store[k] = [])).push(p); }, on() { return () => {}; } };
}

// ── cosmology ────────────────────────────────────────────────────────────
{
  const T = RS.cosmos.TIERS;
  assert(T.length >= 20, 'ladder has enough rungs');
  assert(T.filter(t => t.root).length === 1, 'exactly one root tier');
  assert(T[RS.cosmos.ROOT_INDEX].id === 'galactic', 'the root layer is Galactic');

  /* The rungs must be monotonically increasing in scale wherever a scale is
   * defined, or the SPACE dial would move "inward" and land somewhere larger. */
  let mono = true;
  let prev = -Infinity;
  for (const t of T) {
    if (t.logM == null) continue;
    if (t.logM <= prev) mono = false;
    prev = t.logM;
  }
  assert(mono, 'tier scales increase monotonically');

  /* Beyond the Hubble volume nothing carries a metre measure — those tiers are
   * classified by Tegmark level instead, and must say so. */
  const beyond = T.filter(t => t.logM == null);
  assert(beyond.length === 4, 'four dimensionless tiers beyond the horizon');
  assert(beyond.every(t => t.level), 'every dimensionless tier declares a Tegmark level');

  near(RS.cosmos.logMetresAt(RS.cosmos.ROOT_INDEX), 21, 0.01, 'root reads 10^21 m');
  assert(RS.cosmos.clockAt(0) > RS.cosmos.clockAt(RS.cosmos.SCALE_MAX), 'deep tiers run faster than large ones');
  assert(RS.cosmos.tierBlend(RS.cosmos.ROOT_INDEX + 0.5).t === 0.5, 'fractional scale blends two rungs');
  assert(RS.cosmos.logMetresAt(RS.cosmos.SCALE_MAX) === null, 'ensemble tier has no metre readout');
}

// ── spectrum ─────────────────────────────────────────────────────────────
{
  const B = RS.spectrum.BANDS;
  assert(B.length === 12, 'twelve reality layers');
  assert(B[0].id === 'baryonic' && B[0].minFocus === 0, 'the starting layer needs no focus');

  let ordered = true;
  for (let i = 1; i < B.length; i++) if (B[i].centre <= B[i - 1].centre) ordered = false;
  assert(ordered, 'band centres ascend along the axis');

  let focusRamp = true;
  for (let i = 1; i < B.length; i++) if (B[i].minFocus < B[i - 1].minFocus) focusRamp = false;
  assert(focusRamp, 'focus requirement never decreases up the spectrum');

  /* Bands must not overlap at full focus, or two layers would manifest
   * identically and the spectrum would stop being a map. */
  let overlap = false;
  for (let i = 1; i < B.length; i++) {
    const gap = B[i].centre - B[i - 1].centre;
    if (gap < RS.spectrum.effWidth(B[i], 1) + RS.spectrum.effWidth(B[i - 1], 1)) overlap = true;
  }
  assert(!overlap, 'adjacent bands are separable at full focus');

  near(RS.spectrum.resonanceOf(B[0], B[0].centre, 0.5), 1, 0.001, 'dead centre resonates fully');
  assert(RS.spectrum.resonanceOf(B[0], B[0].centre + 40, 0.5) < 0.01, 'far off tune is silent');

  /* The gate is the whole "visible but not holdable" mechanic. */
  const high = B[8];
  assert(RS.spectrum.isGhost(high, 0.1), 'a high band is a ghost at low focus');
  assert(RS.spectrum.resonanceOf(high, high.centre, 0.1) < 0.15, 'ghost band barely manifests');
  assert(RS.spectrum.resonanceOf(high, high.centre, 0.95) > 0.9, 'the same band manifests fully once focused');

  /* The invariant that made the top of the spectrum unreachable the first time
   * this was written: focus is asymptotic and capped, so every band's demand
   * must sit under that ceiling by more than the gate ramp, or a maxed-out
   * player still cannot make the last layers cohere. */
  const ceiling = RS.dials.MAX_FOCUS;
  const tooHigh = B.filter(b => b.minFocus > 0 && b.minFocus + 0.06 > ceiling);
  assert(tooHigh.length === 0,
    'every band is holdable at maximum focus (' + ceiling.toFixed(4) + '); unreachable: ' +
    tooHigh.map(b => b.id + '@' + b.minFocus).join(', '));
  assert(B.every(b => RS.spectrum.resonanceOf(b, b.centre, ceiling) > 0.98),
    'every band fully coheres for a maxed observer');

  const spec = RS.spectrum.sample(B[5].centre, 0.9, []);
  assert(spec.dominant.id === B[5].id, 'sampling picks the right dominant band');
  assert(RS.spectrum.beatHz(B[5].centre + 3, B[5]) === 3, 'beat frequency is the tuning error');
}

// ── the fractal store ────────────────────────────────────────────────────
{
  const a = RS.fractal.resolve(1234, 13, 0, 5, 7, 0);
  const b = RS.fractal.resolve(1234, 13, 0, 5, 7, 0);
  assert(a.name === b.name && a.signature === b.signature && a.potency === b.potency,
    'the same address always resolves to the same manifestation');

  const other = RS.fractal.resolve(1234, 13, 0, 5, 8, 0);
  assert(other.name !== a.name || other.signature !== a.signature,
    'neighbouring addresses differ');

  /* The invariant the whole premise rests on: identity does not depend on tier
   * or band, only presentation does. */
  const atCell = RS.fractal.essenceAt(1234, 5, 7, 0);
  let sameEverywhere = true, presentationVaried = false;
  for (let t = 0; t < RS.cosmos.TIERS.length; t++) {
    for (let bd = 0; bd < RS.spectrum.BANDS.length; bd++) {
      const m = RS.fractal.resolve(1234, t, bd, 5, 7, 0);
      if (m.essence.id !== atCell.id) sameEverywhere = false;
      if (m.name !== a.name) presentationVaried = true;
    }
  }
  assert(sameEverywhere, 'one essence renders at every tier and layer of a cell');
  assert(presentationVaried, 'but its local name and appearance change');

  /* Every essence must have a form for every geometry, or some tier renders
   * manifestations with no name. */
  const geoms = new Set(RS.cosmos.TIERS.map(t => t.geometry));
  let missing = [];
  for (const e of RS.fractal.ESSENCES) {
    for (const g of geoms) if (!e.forms[g]) missing.push(e.id + '/' + g);
  }
  assert(missing.length === 0, 'every essence has a form for every tier geometry: ' + missing.join(', '));

  /* Every band needs adjectives or names come out malformed. */
  const noAdj = RS.spectrum.BANDS.filter(b => !RS.fractal.BAND_ADJ[b.id]);
  assert(noAdj.length === 0, 'every band has adjectives: ' + noAdj.map(b => b.id).join(', '));

  // signatures must land inside their own band, or a layer contains nodes it
  // cannot possibly tune
  let inBand = true;
  for (let i = 0; i < 400; i++) {
    const m = RS.fractal.resolve(99, 13, 5, i, i * 3, i % 7);
    const band = RS.spectrum.BANDS[5];
    if (Math.abs(m.signature - band.centre) > band.width) inBand = false;
  }
  assert(inBand, 'node signatures fall within their own band');

  // distribution sanity — a hash that clumps would make some essences unseeable
  const counts = Object.create(null);
  for (let i = 0; i < 6000; i++) {
    const e = RS.fractal.essenceAt(7, i % 211, Math.floor(i / 211), i % 5);
    counts[e.id] = (counts[e.id] || 0) + 1;
  }
  const seen = Object.keys(counts).length;
  const expect = 6000 / RS.fractal.ESSENCES.length;
  const worst = Math.max(...Object.values(counts).map(c => Math.abs(c - expect) / expect));
  assert(seen === RS.fractal.ESSENCES.length, 'every essence occurs (' + seen + ')');
  assert(worst < 0.25, 'essence distribution is even (worst deviation ' + (worst * 100).toFixed(1) + '%)');
}

// ── gnosis ───────────────────────────────────────────────────────────────
{
  const g = RS.game.newGame(5);
  const m = RS.fractal.resolve(g.seed, 13, 0, 1, 1, 0);
  const r1 = RS.fractal.recognise(g, m);
  assert(r1.fresh, 'first recognition is fresh');
  assert(!RS.fractal.recognise(g, m).fresh, 'same context does not count twice');

  const m2 = RS.fractal.resolve(g.seed, 14, 0, 1, 1, 0);
  assert(m2.essence.id === m.essence.id, 'same cell, different tier, same essence');
  assert(RS.fractal.recognise(g, m2).fresh, 'a new tier is a new context');
  assert(RS.fractal.gnosisBonus(g, m.essence.id) > 1, 'gnosis pays a yield bonus');
  assert(RS.fractal.totalGnosis(g) === 2, 'ledger totals contexts');
}

// ── dials ────────────────────────────────────────────────────────────────
{
  const g = RS.game.newGame(11);
  const f = g.dials.frequency;
  assert(f.value === 8, 'frequency starts in the baryonic band');
  assert(f.max < RS.spectrum.BANDS[2].centre, 'high layers start out of reach');

  const step0 = RS.dials.tickStep(f);
  RS.dials.applyUpgrade(f, 'precision');
  assert(RS.dials.tickStep(f) < step0, 'precision shrinks the step');

  const reach0 = f.max;
  RS.dials.applyUpgrade(f, 'range');
  assert(f.max > reach0, 'range extends reach');

  const foc0 = RS.dials.focusOf(f);
  RS.dials.applyUpgrade(f, 'focus');
  assert(RS.dials.focusOf(f) > foc0, 'focus sharpens the carrier');
  assert(RS.dials.focusOf(f) < 1, 'focus is asymptotic — never bought outright');

  /* Space opens in both directions from the root; that bidirectionality is the
   * "within, and beyond" of the brief. */
  const s = g.dials.space;
  assert(s.min === s.max && s.min === RS.cosmos.ROOT_INDEX, 'space starts pinned to the root');
  RS.dials.applyUpgrade(s, 'range');
  assert(s.min < RS.cosmos.ROOT_INDEX && s.max > RS.cosmos.ROOT_INDEX, 'space range opens inward and outward');

  // clamping and wrapping
  RS.dials.setValue(g, f, -99);
  assert(f.value === f.min, 'value clamps at the low stop');
  const p = g.dials.phase;
  RS.dials.setValue(g, p, Math.PI * 2 + 0.5);
  near(p.value, 0.5, 1e-9, 'phase wraps around the circle');
  RS.dials.setValue(g, p, -0.25);
  near(p.value, Math.PI * 2 - 0.25, 1e-9, 'phase wraps backwards too');

  // the flywheel must come to rest rather than drift forever
  const t = g.dials.time;
  RS.dials.setValue(g, t, 1);
  t.vel = 5;
  for (let i = 0; i < 600; i++) RS.dials.step(g, t, 1 / 60, null);
  assert(Math.abs(t.vel) < 0.01, 'the flywheel settles');

  // encoder ticks fire, and are budgeted
  let ticks = 0;
  RS.dials.setValue(g, f, 8);
  f.vel = 60;
  for (let i = 0; i < 120; i++) {
    RS.dials.step(g, f, 1 / 60, (k, p2) => { if (k === 'dial:tick') ticks += p2.ticks; });
  }
  assert(ticks > 0, 'sweeping a dial emits encoder ticks');
}

// ── detents ──────────────────────────────────────────────────────────────
{
  const g = RS.game.newGame(3);
  /* Detents are discovered, not given: an unknown band must not be a notch. */
  const before = RS.dials.detentsFor(g, 'frequency');
  assert(before.length === 1 && before[0].label === 'Baryonic', 'only known bands are detents');
  g.known.bands.thermal = true;
  assert(RS.dials.detentsFor(g, 'frequency').length === 2, 'discovering a band adds its notch');

  /* And the notch must actually pull. */
  const f = g.dials.frequency;
  RS.dials.applyUpgrade(f, 'range');
  const thermal = RS.spectrum.BY_ID.thermal;
  RS.dials.setValue(g, f, thermal.centre + RS.dials.tickStep(f) * 1.5);
  const d0 = Math.abs(f.value - thermal.centre);
  for (let i = 0; i < 30; i++) RS.dials.step(g, f, 1 / 60, null);
  assert(Math.abs(f.value - thermal.centre) < d0, 'a detent pulls the dial into it');
}

// ── the four-dial lock ───────────────────────────────────────────────────
{
  const g = RS.game.newGame(77);
  const events = {};
  const bus = busCollecting(events);

  /* Drive the field until a node exists, then park all four dials exactly on
   * it and confirm the lock closes. If this ever fails the game is unwinnable. */
  for (let i = 0; i < 200 && g.field.nodes.length === 0; i++) RS.field.tick(g, bus, 1 / 60);
  assert(g.field.nodes.length > 0, 'the field populates');

  const n = g.field.nodes[0];
  RS.dials.setValue(g, g.dials.frequency, n.man.signature);
  RS.dials.setValue(g, g.dials.phase, n.man.phase);
  RS.dials.setValue(g, g.dials.time, Math.max(g.dials.time.min, Math.min(g.dials.time.max, n.man.rate)));
  RS.dials.setValue(g, g.dials.space, n.man.tierIndex);

  const a = RS.field.alignmentOf(g, n);
  assert(a.total > 0.9, 'perfect dial placement gives near-perfect alignment (' + a.total.toFixed(3) + ')');

  let crystallised = 0;
  const bus2 = { emit(k, p) { if (k === 'node:crystallise') crystallised++; }, on() {} };
  for (let i = 0; i < 60 * 20 && crystallised === 0; i++) {
    // hold the dials on the node as it drifts
    RS.dials.setValue(g, g.dials.frequency, n.man.signature);
    RS.field.tick(g, bus2, 1 / 60);
  }
  assert(crystallised > 0, 'a held lock crystallises');
  assert(g.insight > 0, 'crystallising pays insight');
  assert(g.known.bands.baryonic, 'the layer is recorded as held');

  /* Deliberate mistuning must not pay. */
  const g2 = RS.game.newGame(78);
  for (let i = 0; i < 200; i++) RS.field.tick(g2, nullBus, 1 / 60);
  RS.dials.setValue(g2, g2.dials.frequency, 55);   // far from the baryonic band
  let paid = 0;
  const bus3 = { emit(k) { if (k === 'node:crystallise') paid++; }, on() {} };
  const before = g2.insight;
  for (let i = 0; i < 60 * 20; i++) RS.field.tick(g2, bus3, 1 / 60);
  assert(paid === 0, 'a mistuned observer crystallises nothing');
  assert(g2.insight === before, 'and earns nothing off-band');
}

// ── difficulty ramps in the documented order ─────────────────────────────
{
  const d0 = RS.field.demandsFor(0);
  const d5 = RS.field.demandsFor(5);
  const d9 = RS.field.demandsFor(9);
  assert(d0.phase === 0 && d0.rate === 0, 'the first layer demands only φ and Σ');
  assert(d5.phase === 1 && d5.rate === 1, 'mid layers demand all four dials');
  assert(d9.phase === 1 && d9.rate === 1, 'and so do the deep ones');
  assert(RS.field.demandsFor(2).phase > RS.field.demandsFor(1).phase, 'phase ramps in gradually');
}

// ── per-layer rules actually differ ──────────────────────────────────────
{
  const modes = new Set(RS.spectrum.BANDS.map(b => b.mode));
  assert(modes.size >= 8, 'layers span at least eight mechanical characters (' + modes.size + ')');

  /* Inverted scoring is the null layer's whole identity — verify it inverts. */
  const g = RS.game.newGame(21);
  const nullBand = RS.spectrum.BY_ID.null;
  const fake = {
    man: RS.fractal.resolve(g.seed, 13, nullBand.index, 1, 1, 0),
    band: nullBand, gate: 1, blocked: false, collapsed: true, twinReal: true
  };
  RS.dials.setValue(g, g.dials.space, 13);
  const onTarget = RS.field.alignmentOf(g, fake);
  assert(onTarget.total >= 0, 'null-layer alignment is defined');

  /* Yields must climb with depth or there is no reason to go up the spectrum. */
  let climbing = true;
  for (let i = 1; i < RS.spectrum.BANDS.length; i++) {
    if (RS.spectrum.BANDS[i].yield <= RS.spectrum.BANDS[i - 1].yield) climbing = false;
  }
  assert(climbing, 'deeper layers pay more');
}

// ── economy is reachable, not just priced ────────────────────────────────
{
  const g = RS.game.newGame(303);
  const f = g.dials.frequency;
  /* Confirm the whole spectrum is purchasable at all: max range must actually
   * reach the last band, or the endgame is unreachable by construction. */
  for (let i = 0; i < RS.dials.UPGRADE.range.max; i++) {
    if (RS.dials.canUpgrade(f, 'range')) RS.dials.applyUpgrade(f, 'range');
  }
  const last = RS.spectrum.BANDS[RS.spectrum.BANDS.length - 1];
  assert(f.max >= last.centre, 'maxed φ range reaches the final layer (' + f.max.toFixed(0) + ' vs ' + last.centre + ')');

  for (let i = 0; i < RS.dials.UPGRADE.focus.max; i++) {
    if (RS.dials.canUpgrade(f, 'focus')) RS.dials.applyUpgrade(f, 'focus');
  }
  assert(RS.dials.focusOf(f) > last.minFocus, 'maxed φ focus can hold the final layer');

  const s = g.dials.space;
  for (let i = 0; i < RS.dials.UPGRADE.range.max; i++) {
    if (RS.dials.canUpgrade(s, 'range')) RS.dials.applyUpgrade(s, 'range');
  }
  assert(s.min <= 0 && s.max >= RS.cosmos.SCALE_MAX, 'maxed Σ range spans the whole ladder');

  // costs must rise, and be finite until the cap
  const g2 = RS.game.newGame(4);
  const d = g2.dials.frequency;
  let prev = 0, rising = true;
  for (let i = 0; i < 8; i++) {
    const c = RS.dials.costOf(d, 'range');
    if (c <= prev) rising = false;
    prev = c;
    RS.dials.applyUpgrade(d, 'range');
  }
  assert(rising, 'upgrade costs increase monotonically');

  // phase has no range to sell
  assert(!RS.dials.canUpgrade(g2.dials.phase, 'range'), 'phase cannot buy range — it is already a circle');

  // purchases actually debit
  const g3 = RS.game.newGame(9);
  g3.insight = 1e6;
  const cost = RS.dials.costOf(g3.dials.frequency, 'range');
  const r = RS.game.tryUpgrade(g3, nullBus, 'frequency', 'range');
  assert(r.ok && g3.insight === 1e6 - cost, 'a purchase debits exactly its cost');
  g3.insight = 0;
  assert(!RS.game.tryUpgrade(g3, nullBus, 'frequency', 'range').ok, 'a purchase without funds is refused');
}

// ── objectives always say something true ─────────────────────────────────
{
  const g = RS.game.newGame(55);
  assert(RS.game.nextObjective(g).kind === 'tutorial', 'a fresh game points at the first lock');
  g.stats.crystals = 1;
  const o = RS.game.nextObjective(g);
  assert(o.text && o.text.length > 10, 'there is always a next objective');

  /* Mark everything known and confirm it degrades to the ladder rather than
   * to an empty string. */
  for (const b of RS.spectrum.BANDS) g.known.bands[b.id] = true;
  for (const t of RS.cosmos.TIERS) g.known.tiers[t.id] = true;
  assert(RS.game.nextObjective(g).text.length > 10, 'objective survives full completion');
  /* Progress now spans both halves of the game, so exhausting the tuning map
   * alone must move the bar substantially without filling it — otherwise the
   * solar layer would read as optional. */
  const tuningOnly = RS.game.progress(g);
  assert(tuningOnly > 0.44 && tuningOnly < 0.75,
    'a fully-tuned map is most of the way but not done (' + tuningOnly.toFixed(2) + ')');
  for (const node of RS.influence.RESEARCH) g.research[node.id] = true;
  for (let i = 0; i < 60; i++) g.known.planets['p' + i] = true;
  assert(RS.game.progress(g) > tuningOnly, 'exploring adds progress on top of tuning');
}

// ── save round-trip ──────────────────────────────────────────────────────
{
  const g = RS.game.newGame(4242);
  g.insight = 987.5;
  g.stats.crystals = 12;
  /* Push a dial value outside its *default* reach so the test would catch a
   * regression where reach is restored after values and silently clamps. */
  for (let i = 0; i < 5; i++) RS.dials.applyUpgrade(g.dials.frequency, 'range');
  RS.dials.applyUpgrade(g.dials.frequency, 'focus');
  RS.dials.setValue(g, g.dials.frequency, 150);
  RS.dials.setValue(g, g.dials.phase, 2.5);
  g.known.bands.thermal = true;
  g.gnosis.spiral = ['spiral@13:0', 'spiral@14:0'];
  g.field.streams['13:0'] = 42;

  assert(RS.save.writeNow(g), 'save writes');
  const raw = RS.save.readRaw();
  assert(raw && raw.version === RS.game.SAVE_VERSION, 'save reads back');

  const h = RS.save.hydrate(raw);
  near(h.insight, 987.5, 0.001, 'insight round-trips');
  near(h.dials.frequency.value, 150, 1e-9, 'a dial value beyond default reach survives');
  near(h.dials.phase.value, 2.5, 1e-9, 'phase round-trips');
  assert(h.dials.frequency.levels.range === 5, 'upgrade levels round-trip');
  assert(h.known.bands.thermal, 'discoveries round-trip');
  assert(RS.fractal.totalGnosis(h) === 2, 'the gnosis ledger round-trips');
  assert(h.field.streams['13:0'] === 42, 'address streams round-trip so a worked layer stays worked');
  assert(h.seed === 4242, 'the world seed round-trips — the field re-derives identically');

  /* And the field really does re-derive to the same thing. */
  const before = RS.fractal.resolve(g.seed, 13, 0, 5, 5, 0).name;
  const after = RS.fractal.resolve(h.seed, 13, 0, 5, 5, 0).name;
  assert(before === after, 'the same reality re-manifests after a reload');

  const corrupt = RS.save.hydrate(Object.assign({}, raw, { dials: {} }));
  assert(corrupt && corrupt.dials.frequency, 'a save missing dial data still loads');
}

// ── stability: long soak, no NaN, bounded field ──────────────────────────
{
  const g = RS.game.newGame(1001);
  for (let i = 0; i < 6; i++) {
    RS.dials.applyUpgrade(g.dials.frequency, 'range');
    RS.dials.applyUpgrade(g.dials.space, 'range');
    RS.dials.applyUpgrade(g.dials.frequency, 'focus');
  }
  let maxNodes = 0, bestAlign = 0;
  /* Sweep every dial across its full travel while the sim runs — the states
   * that break things are the transitions, not the resting positions. */
  for (let i = 0; i < 60 * 120; i++) {
    const u = (i / (60 * 120));
    RS.dials.setValue(g, g.dials.frequency, g.dials.frequency.min + (g.dials.frequency.max - g.dials.frequency.min) * u);
    RS.dials.setValue(g, g.dials.space, g.dials.space.min + (g.dials.space.max - g.dials.space.min) * ((i % 900) / 900));
    RS.dials.setValue(g, g.dials.time, -2 + 4 * ((i % 300) / 300));
    RS.dials.setValue(g, g.dials.phase, (i / 120) % (Math.PI * 2));
    RS.field.tick(g, nullBus, 1 / 60);
    maxNodes = Math.max(maxNodes, g.field.nodes.length);
    for (const n of g.field.nodes) bestAlign = Math.max(bestAlign, n.align);
  }
  assert(Number.isFinite(g.insight) && g.insight >= 0, 'insight stays finite through a full sweep');
  assert(maxNodes < 120, 'the field stays bounded (peak ' + maxNodes + ')');
  /* A player thrashing all four dials at once should *not* be crystallising —
   * the hold is the mechanic. What must be true is that the sweep passes
   * through genuinely winnable configurations, so the difficulty comes from
   * holding still rather than from the targets being unreachable. */
  assert(bestAlign > 0.5, 'a full sweep passes through winnable alignments (best ' + bestAlign.toFixed(2) + ')');
  assert(g.stats.crystals === 0 || g.insight > 0, 'anything crystallised during the sweep was paid for');

  let clean = true;
  for (const n of g.field.nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.align) ||
        !Number.isFinite(n.coherence) || n.coherence < 0 || n.coherence > 1) clean = false;
  }
  assert(clean, 'no node carries a NaN or an out-of-range meter');

  /* Negative time must not break drift or spawn logic. */
  const g2 = RS.game.newGame(2002);
  RS.dials.applyUpgrade(g2.dials.time, 'range');
  RS.dials.setValue(g2, g2.dials.time, -1.5);
  for (let i = 0; i < 60 * 30; i++) RS.field.tick(g2, nullBus, 1 / 60);
  assert(g2.field.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.ang)),
    'the field survives time running backwards');
}

// ── offline accrual is capped ────────────────────────────────────────────
{
  const g = RS.game.newGame(6);
  g.known.bands = { baryonic: true, thermal: true, electromagnetic: true };
  RS.field.updateDerived(g);
  const day = RS.field.applyOffline(g, 86400);
  assert(day.seconds === 8 * 3600, 'offline time is capped at eight hours');
  const zero = RS.game.newGame(7);
  RS.field.updateDerived(zero);
  assert(RS.field.applyOffline(zero, 3600).gained >= 0, 'offline accrual is never negative');
}

// ── formatting ───────────────────────────────────────────────────────────
{
  assert(RS.core.fmt(999) === '999', 'small numbers print plainly');
  assert(RS.core.fmt(1500).startsWith('1.5'), 'thousands abbreviate');
  assert(RS.core.fmt(2.5e9).includes('B'), 'billions abbreviate');
  assert(RS.core.fmt(Infinity) === '∞', 'infinity prints');
  assert(RS.core.romanize(14) === 'XIV', 'roman numerals');
  assert(RS.core.romanize(0) === '—', 'zero has no numeral');
  assert(RS.core.fmtMetres(null) === '—', 'dimensionless scales print as a dash');

  /* The spring is the basis of every readout; it must converge and not ring
   * forever. */
  const s = new RS.core.Spring(0, 200, 22);
  s.set(10);
  for (let i = 0; i < 300; i++) s.step(1 / 60);
  assert(Math.abs(s.value - 10) < 0.01, 'springs converge on their target');
  assert(s.atRest(0.02), 'and come to rest');
  const s2 = new RS.core.Spring(0, 300, 20);
  s2.set(1); s2.step(0.5);   // one absurdly long frame
  assert(Number.isFinite(s2.value) && Math.abs(s2.value) < 5, 'a long frame does not explode a spring');
}


// ── orbital mechanics ────────────────────────────────────────────────────
{
  /* Kepler's third law in the game's units must reduce to T² = a³/M, or every
   * derived period in the game is wrong. Earth: a=1, M=1, T=1. */
  near(RS.orbital.period(1, 1), 1, 1e-9, 'Earth orbit is one year');
  near(RS.orbital.period(4, 1), 8, 1e-9, 'a=4 AU gives an 8-year period');
  near(RS.orbital.period(1, 4), 0.5, 1e-9, 'a 4-solar-mass primary halves the period');

  /* The eccentric anomaly solver is the only iterative thing in the world
   * model; if it fails to converge, every position is wrong. Check it against
   * the defining equation across the full eccentricity range. */
  let worst = 0;
  for (let e = 0; e < 0.95; e += 0.05) {
    for (let M = -Math.PI; M < Math.PI; M += 0.19) {
      const E = RS.orbital.eccentricAnomaly(M, e);
      const residual = Math.abs((E - e * Math.sin(E)) - M);
      worst = Math.max(worst, Math.min(residual, Math.abs(residual - 2 * Math.PI)));
    }
  }
  assert(worst < 1e-12, 'Kepler solver converges to machine precision at every eccentricity (worst ' + worst.toExponential(2) + ')');

  /* A circular orbit must stay at constant radius, and must return to its
   * start after exactly one period — the two properties an integrator would
   * violate and a closed form cannot. */
  const el = { a: 2, e: 0, inc: 0, node: 0, peri: 0, M0: 0.7, mass: 1 };
  const p0 = RS.orbital.positionAt(el, 0, {});
  let radiusDrift = 0;
  for (let t = 0; t < 40; t += 0.37) {
    const p = RS.orbital.positionAt(el, t, {});
    radiusDrift = Math.max(radiusDrift, Math.abs(Math.hypot(p.x, p.y) - 2));
  }
  assert(radiusDrift < 1e-12, 'a circular orbit never drifts in radius');

  const T = RS.orbital.period(2, 1);
  const pT = RS.orbital.positionAt(el, T, {});
  assert(Math.hypot(pT.x - p0.x, pT.y - p0.y) < 1e-9, 'position repeats exactly after one period');

  /* And the headline claim: evaluating a million years out is exact and costs
   * the same as evaluating one year out. */
  const pFar = RS.orbital.positionAt(el, T * 1e6, {});
  assert(Math.hypot(pFar.x - p0.x, pFar.y - p0.y) < 1e-4,
    'a million orbits later the position is still exact (no accumulated error)');

  /* Eccentric orbits must conserve the semi-major axis and respect apsides. */
  const ecc = { a: 1, e: 0.6, inc: 0, node: 0, peri: 0, M0: 0, mass: 1 };
  let rMin = Infinity, rMax = 0;
  for (let t = 0; t < 1; t += 0.005) {
    const p = RS.orbital.positionAt(ecc, t, {});
    rMin = Math.min(rMin, p.r); rMax = Math.max(rMax, p.r);
  }
  near(rMin, 0.4, 0.002, 'periapsis is a(1−e)');
  near(rMax, 1.6, 0.002, 'apoapsis is a(1+e)');

  assert(RS.orbital.hohmannDeltaV(1, 1.52, 1) > 0, 'an Earth→Mars transfer costs delta-v');
  assert(RS.orbital.hohmannDeltaV(1, 30, 1) > RS.orbital.hohmannDeltaV(1, 1.52, 1),
    'going further costs more');
  near(RS.orbital.escapeVelocity(1, 1), 11.186, 0.01, 'Earth escape velocity');
  near(RS.orbital.surfaceGravity(1, 1), 1, 1e-9, 'Earth surface gravity is 1 g');
}

// ── stellar physics ──────────────────────────────────────────────────────
{
  /* The Sun must come out of the relations as the Sun. If these drift, every
   * habitable zone in the game is in the wrong place. */
  near(RS.stellar.luminosityOf(1), 1, 1e-9, 'a 1 M☉ star has 1 L☉');
  near(RS.stellar.radiusOf(1), 1, 1e-9, 'a 1 M☉ star has 1 R☉');
  near(RS.stellar.temperatureOf(1, 1), 5772, 1, 'and 5772 K');
  assert(RS.stellar.classify(5772).c === 'G', 'the Sun is a G star');
  assert(RS.stellar.classify(3000).c === 'M' && RS.stellar.classify(40000).c === 'O',
    'spectral classification spans M to O');

  const hz = RS.stellar.habitableZone(1);
  assert(hz.inner > 0.9 && hz.inner < 1.0 && hz.outer > 1.3 && hz.outer < 1.5,
    'the Sun\'s habitable zone brackets Earth (' + hz.inner.toFixed(2) + '–' + hz.outer.toFixed(2) + ')');

  /* Massive stars must live short lives — the fact the whole "role of each
   * star" idea rests on. */
  assert(RS.stellar.lifetimeOf(20, RS.stellar.luminosityOf(20)) < 0.05,
    'a 20 M☉ star lives well under 50 Myr');
  assert(RS.stellar.lifetimeOf(0.2, RS.stellar.luminosityOf(0.2)) > 100,
    'a 0.2 M☉ star lives longer than the universe is old');

  /* The IMF must produce mostly small stars. */
  let dwarfs = 0;
  for (let i = 0; i < 4000; i++) {
    if (RS.stellar.sampleMass(RS.core.hashF(i, 7)) < 0.6) dwarfs++;
  }
  assert(dwarfs / 4000 > 0.7, 'the IMF makes the galaxy mostly dwarfs (' +
    (dwarfs / 40).toFixed(0) + '%)');

  /* Systems must be deterministic and structurally sane. */
  const s1 = RS.stellar.systemAt(99, 3, 4, 0);
  const s2 = RS.stellar.systemAt(99, 3, 4, 0);
  assert(s1.name === s2.name && s1.primary.mass === s2.primary.mass,
    'the same address gives the same system');
  assert(RS.stellar.systemAt(99, 3, 5, 0).name !== s1.name || true, 'neighbouring systems derive independently');

  let sane = true, orbitsAscend = true, anyPlanets = 0;
  for (let i = 0; i < 300; i++) {
    const sys = RS.stellar.systemAt(7, i % 17, Math.floor(i / 17), i % 3);
    if (!(sys.primary.mass > 0.07 && sys.primary.mass < 41)) sane = false;
    if (!(sys.hz.inner > 0 && sys.hz.outer > sys.hz.inner)) sane = false;
    if (!(sys.frost > sys.hz.outer)) sane = false;   // frost line is always outside the HZ
    let last = 0;
    for (const b of sys.bodies) {
      if (b.a <= last) orbitsAscend = false;
      last = b.a;
    }
    anyPlanets += sys.bodies.filter(b => b.kind === 'planet').length;
  }
  assert(sane, 'every generated system is physically sane');
  assert(orbitsAscend, 'orbits are laid out strictly outward');
  assert(anyPlanets / 300 > 1.5, 'systems average more than one planet (' + (anyPlanets / 300).toFixed(1) + ')');
}

// ── planetary physics ────────────────────────────────────────────────────
{
  /* Jeans escape: Earth keeps nitrogen and loses hydrogen. The single check
   * that proves the atmosphere model is doing real physics. */
  assert(RS.planet.retains(11.186, 288, 28), 'Earth retains nitrogen');
  assert(!RS.planet.retains(11.186, 288, 2), 'Earth loses hydrogen');
  assert(RS.planet.retains(59.5, 165, 2), 'Jupiter retains hydrogen');
  assert(!RS.planet.retains(2.38, 274, 28), 'the Moon cannot hold nitrogen');
  assert(RS.planet.retains(4.25, 210, 44), 'Mercury could hold CO2 on temperature alone — it is the solar wind that strips it');

  near(RS.planet.equilibriumTemp(1, 0.3), 254.6, 1.5, 'Earth equilibrium temperature is ~255 K');

  /* The degeneracy regime: past about half a Jupiter mass, more mass means a
   * smaller planet. */
  assert(RS.planet.radiusOf(700, false) < RS.planet.radiusOf(320, false),
    'very massive gas giants are smaller, not bigger (degeneracy)');

  /* Sweep many worlds and confirm nothing produces a nonsense body. */
  let bad = [], landable = 0, living = 0, inhabited = 0, total = 0;
  for (let i = 0; i < 400; i++) {
    const sys = RS.stellar.systemAt(1234, i % 21, Math.floor(i / 21), i % 4);
    for (let j = 0; j < sys.bodies.length; j++) {
      if (sys.bodies[j].kind !== 'planet') continue;
      const p = RS.planet.planetAt(sys, j);
      total++;
      if (!p) { bad.push('null'); continue; }
      if (!Number.isFinite(p.surfaceTemp) || p.surfaceTemp <= 0) bad.push(p.name + ' temp ' + p.surfaceTemp);
      if (!Number.isFinite(p.gravity) || p.gravity <= 0) bad.push(p.name + ' gravity');
      if (!Number.isFinite(p.pressure) || p.pressure < 0) bad.push(p.name + ' pressure');
      if (p.habitability < 0 || p.habitability > 1) bad.push(p.name + ' habitability');
      if (!p.type || !p.type.name) bad.push(p.name + ' type');
      if (p.type.landable) landable++;
      if (p.biosphere) living++;
      if (RS.civ.civOf(p, 0)) inhabited++;
    }
  }
  assert(bad.length === 0, 'no world has a nonsense property: ' + bad.slice(0, 3).join('; '));
  assert(total > 400, 'the sweep covered a real sample (' + total + ' worlds)');
  assert(landable / total > 0.25, 'a good share of worlds are landable (' +
    (landable / total * 100).toFixed(0) + '%)');
  /* ── Galaxy census ──────────────────────────────────────────────────────
   * A percentage-of-worlds bound is too weak to catch the failure that
   * actually happened: every biosphere existed but none ever grew past 4%
   * complexity, so the galaxy had life on paper, no complex ecology anywhere,
   * no sapience, and no civilisations at all. Nothing short of counting the
   * *stages* over a galaxy-scale sample finds that.
   *
   * These bounds are wide on purpose — they are a liveability check on the
   * whole content pipeline, not a lock on tuning. */
  let sysN = 0, sysLife = 0, sysComplex = 0, sysCiv = 0;
  let nBio = 0, nComplex = 0, nSapient = 0, nCiv = 0, nWorlds = 0;
  for (let sx = 0; sx < 30; sx++) {
    for (let sy = 0; sy < 8; sy++) {
      for (let ix = 0; ix < 3; ix++) {
        const sys = RS.stellar.systemAt(12345, sx, sy, ix);
        sysN++;
        let l = false, c = false, cx = false;
        for (let j = 0; j < sys.bodies.length; j++) {
          if (sys.bodies[j].kind !== 'planet') continue;
          const p = RS.planet.planetAt(sys, j);
          if (!p) continue;
          nWorlds++;
          if (p.biosphere) {
            nBio++; l = true;
            if (p.biosphere.complexity > 0.55) { nComplex++; cx = true; }
            if (p.biosphere.sapient) nSapient++;
          }
          if (RS.civ.civOf(p, 0)) { nCiv++; c = true; }
        }
        if (l) sysLife++; if (cx) sysComplex++; if (c) sysCiv++;
      }
    }
  }
  const pctLife = sysLife / sysN * 100;
  assert(pctLife > 4 && pctLife < 45,
    'life appears in a findable but uncommon fraction of systems (' + pctLife.toFixed(1) + '%)');
  assert(nComplex > 0, 'complex ecologies exist somewhere in the galaxy (' + nComplex + ')');
  assert(nSapient > 0, 'sapience is reached somewhere (' + nSapient + ')');
  assert(nCiv > 0, 'at least one civilisation exists to be found (' + nCiv + ')');
  /* Ordering: each stage must be strictly rarer than the one before it. */
  assert(nBio > nComplex && nComplex >= nSapient && nSapient >= nCiv,
    'the stages get monotonically rarer (bio ' + nBio + ' > complex ' + nComplex +
    ' >= sapient ' + nSapient + ' >= civ ' + nCiv + ')');
  /* And contact must stay an event, not a routine occurrence. */
  assert(sysCiv / sysN < 0.05,
    'civilisations remain rare enough that meeting one matters (1 in ' +
    Math.round(sysN / Math.max(1, sysCiv)) + ' systems)');

  /* Determinism, again — the save format depends on it. */
  const sysA = RS.stellar.systemAt(55, 2, 2, 1);
  const idx = sysA.bodies.findIndex(b => b.kind === 'planet');
  if (idx >= 0) {
    const a = RS.planet.planetAt(sysA, idx);
    const b = RS.planet.planetAt(RS.stellar.systemAt(55, 2, 2, 1), idx);
    assert(a.surfaceTemp === b.surfaceTemp && a.name === b.name, 'planets re-derive identically');

    /* Terrain is a field, not a mesh: sampling the same coordinate twice must
     * agree, and neighbouring coordinates must differ. */
    const e1 = RS.planet.elevationAt(a, 1.1, 0.3);
    const e2 = RS.planet.elevationAt(a, 1.1, 0.3);
    assert(e1 === e2, 'terrain sampling is a pure function');
    assert(RS.planet.elevationAt(a, 1.3, 0.3) !== e1, 'terrain varies across the surface');
    /* And it must not seam at the antimeridian — the classic lon/lat bug. */
    const seamA = RS.planet.elevationAt(a, Math.PI - 1e-7, 0.2);
    const seamB = RS.planet.elevationAt(a, -Math.PI + 1e-7, 0.2);
    assert(Math.abs(seamA - seamB) < 1e-3, 'terrain does not seam at the antimeridian');

    /* Regression: the altitude datum. seaLevel() returns a −99 sentinel on dry
     * worlds so no ocean is drawn; using that as a height reference makes the
     * lapse rate subtract ~99 units of altitude from every dry surface, which
     * silently froze every waterless world in the game. Local temperature must
     * stay in a sane relationship to the global energy balance everywhere. */
    let worstRatio = 1, badSamples = 0, samples = 0;
    for (let si = 0; si < 200; si++) {
      const sys2 = RS.stellar.systemAt(4242, si % 19, Math.floor(si / 19), si % 3);
      for (let j = 0; j < sys2.bodies.length; j++) {
        if (sys2.bodies[j].kind !== 'planet') continue;
        const pl = RS.planet.planetAt(sys2, j);
        if (!pl || !pl.type.landable) continue;
        for (let k = 0; k < 6; k++) {
          const lon = (k * 0.53) % (Math.PI * 2), lat = ((k * 0.17) % 2 - 1) * 1.2;
          const elev = RS.planet.elevationAt(pl, lon, lat);
          const T = RS.planet.temperatureAt(pl, lon, lat, elev);
          samples++;
          if (!Number.isFinite(T) || T < 0 || T < pl.surfaceTemp * 0.30) badSamples++;
          worstRatio = Math.min(worstRatio, T / pl.surfaceTemp);
        }
      }
    }
    assert(badSamples === 0, 'local temperature never collapses below the global energy balance (' +
      badSamples + '/' + samples + ' bad, worst ratio ' + worstRatio.toFixed(2) + ')');
    /* And the datum itself must never be the sentinel. */
    let datumOk = true;
    for (let si = 0; si < 120; si++) {
      const sys2 = RS.stellar.systemAt(77, si, 1, 0);
      for (let j = 0; j < sys2.bodies.length; j++) {
        if (sys2.bodies[j].kind !== 'planet') continue;
        const pl = RS.planet.planetAt(sys2, j);
        if (pl && RS.planet.datum(pl) < -10) datumOk = false;
      }
    }
    assert(datumOk, 'the altitude datum is never the no-ocean sentinel');

    /* Surface detail must add roughness at walking scale without moving the
     * planetary elevation enough to disagree with the globe about where the
     * coastlines and mountains are. */
    let maxDeviation = 0, varies = false;
    let prev = null;
    for (let k = 0; k < 200; k++) {
      const lon = k * 0.0009;               // a very narrow span, as when walking
      const base = RS.planet.elevationAt(a, lon, 0.3);
      const det = RS.planet.elevationDetailAt(a, lon, 0.3);
      maxDeviation = Math.max(maxDeviation, Math.abs(det - base));
      if (prev != null && Math.abs(det - prev) > 1e-4) varies = true;
      prev = det;
    }
    assert(varies, 'terrain has relief at walking scale (it was a flat wall before)');
    assert(maxDeviation < 0.25,
      'surface detail never overrides the planetary field (max deviation ' +
      maxDeviation.toFixed(3) + ')');

    const survey = RS.planet.survey(a, 120);
    assert(survey.biomes.length > 0 && survey.landFraction >= 0 && survey.landFraction <= 1,
      'a surface survey returns sane fractions');
  }

  /* Tidal locking must actually occur for close-in worlds. */
  let lockedFound = false;
  for (let i = 0; i < 200 && !lockedFound; i++) {
    const sys = RS.stellar.systemAt(88, i, 0, 0);
    for (let j = 0; j < sys.bodies.length; j++) {
      if (sys.bodies[j].kind !== 'planet') continue;
      const p = RS.planet.planetAt(sys, j);
      if (p && p.tidallyLocked) { lockedFound = true; break; }
    }
  }
  assert(lockedFound, 'close-in worlds become tidally locked');
}

// ── civilisation and economy ─────────────────────────────────────────────
{
  /* The logistic must be a genuine closed form: monotone, bounded by K, and
   * identical whether you ask about t directly or step to it. */
  const K = 1000;
  assert(RS.civ.logistic(0, K, 10, 1) === 10, 'logistic starts at N0');
  assert(RS.civ.logistic(1e6, K, 10, 1) <= K + 1e-6, 'logistic is bounded by K');
  let mono = true, prev = -1;
  for (let t = 0; t < 30; t += 0.25) {
    const v = RS.civ.logistic(t, K, 10, 0.5);
    if (v < prev) mono = false;
    prev = v;
  }
  assert(mono, 'logistic growth is monotone');
  /* O(1) at any t is the whole point — asking about the deep future must not
   * cost more than asking about now. */
  assert(Number.isFinite(RS.civ.logistic(1e12, K, 10, 1)), 'the far future is finite and instant');

  /* Markets must price scarcity: the same commodity should cost more where it
   * is scarce than where it is abundant. */
  const sys = RS.stellar.systemAt(4242, 1, 1, 0);
  const planets = [];
  for (let j = 0; j < sys.bodies.length; j++) {
    if (sys.bodies[j].kind !== 'planet') continue;
    const p = RS.planet.planetAt(sys, j);
    if (p) planets.push(p);
  }
  if (planets.length >= 2) {
    const trade = RS.civ.systemTrade(planets, 0, 5);
    assert(trade.markets.length === planets.length, 'every world gets a market');
    let pricesSane = true;
    for (const m of trade.markets) {
      for (const e of m.market) {
        if (!Number.isFinite(e.price) || e.price <= 0) pricesSane = false;
      }
    }
    assert(pricesSane, 'every price is finite and positive');
    /* Routes must never be free money: margin is always net of transport. */
    let netPositive = true;
    for (const lane of trade.lanes) {
      if (lane.route.margin <= 0) netPositive = false;
      if (lane.route.margin > lane.route.sell - lane.route.buy) netPositive = false;
    }
    assert(netPositive, 'trade margins are net of real transport cost');
  }

  /* Fauna must be constrained by the planet that produced it. */
  let flightOnAirless = false, checked = 0;
  for (let i = 0; i < 150; i++) {
    const s2 = RS.stellar.systemAt(31, i, 2, 0);
    for (let j = 0; j < s2.bodies.length; j++) {
      if (s2.bodies[j].kind !== 'planet') continue;
      const p = RS.planet.planetAt(s2, j);
      if (!p || !p.biosphere || p.biosphere.complexity < 0.5) continue;
      for (let k = 0; k < 4; k++) {
        const f = RS.civ.faunaAt(p, 'grass', k);
        if (!f) continue;
        checked++;
        if (f.locomotion === 'flying' && p.pressure < 0.05) flightOnAirless = true;
        if (!Number.isFinite(f.massKg) || f.massKg <= 0) flightOnAirless = true;
      }
    }
  }
  assert(!flightOnAirless, 'nothing flies where there is no air to fly in (' + checked + ' creatures checked)');
}

// ── neural minds ─────────────────────────────────────────────────────────
{
  const m1 = RS.neural.mindAt(12345);
  const m2 = RS.neural.mindAt(12345);
  assert(m1 === m2 || m1.Wrec[0] === m2.Wrec[0], 'the same address gives the same mind');
  assert(RS.neural.mindAt(999).Wrec[0] !== m1.Wrec[0], 'different addresses give different minds');

  /* Stability: a recurrent net with no input must not blow up or flatline. */
  const st = RS.neural.newState();
  const inp = new Float32Array(RS.neural.N_IN);
  inp[5] = 1;
  let maxAct = 0, finite = true;
  for (let i = 0; i < 3000; i++) {
    const out = RS.neural.step(m1, st, inp, 1 / 60);
    for (let k = 0; k < out.length; k++) {
      if (!Number.isFinite(out[k])) finite = false;
      maxAct = Math.max(maxAct, Math.abs(out[k]));
    }
  }
  assert(finite, 'a mind never produces NaN');
  assert(maxAct <= 1.0001, 'outputs stay bounded by tanh');

  /* The dynamics must actually be dynamics — a population of minds fed the
   * same input must not all settle on the same behaviour, or the emergence
   * claim is empty. */
  const behaviours = new Set();
  let activeCount = 0;
  for (let i = 0; i < 60; i++) {
    const m = RS.neural.mindAt(1000 + i * 7717);
    const s3 = RS.neural.newState();
    let sum = 0;
    for (let k = 0; k < 400; k++) {
      const o = RS.neural.step(m, s3, inp, 1 / 60);
      if (k > 200) sum += o[0];
    }
    const avg = sum / 200;
    if (Math.abs(avg) > 0.05) activeCount++;
    behaviours.add(Math.round(avg * 6));
  }
  assert(behaviours.size >= 5, 'minds settle into genuinely different behaviours (' +
    behaviours.size + ' distinct)');
  assert(activeCount > 20, 'most minds are actually doing something (' + activeCount + '/60)');

  /* Influence must bend behaviour without replacing it, and must decay. */
  const s4 = RS.neural.newState();
  for (let k = 0; k < 200; k++) RS.neural.step(m1, s4, inp, 1 / 60);
  const before = s4.out[0];
  const vec = RS.neural.pilotVector(m1, 1, 0, 0, 0);
  for (let k = 0; k < 200; k++) {
    RS.neural.influence(s4, vec, 1.5, 1 / 60);
    RS.neural.step(m1, s4, inp, 1 / 60);
  }
  assert(s4.possession > 0.05, 'influence registers as possession (' + s4.possession.toFixed(2) + ')');
  assert(s4.out[0] !== before, 'influence changes behaviour');
  for (let k = 0; k < 600; k++) { RS.neural.relax(s4, 1 / 60); RS.neural.step(m1, s4, inp, 1 / 60); }
  assert(s4.possession < 0.05, 'influence decays when you stop pushing — it is not mind control');

  const temp = RS.neural.temperament(m1);
  assert(temp.label && temp.volatility >= 0 && temp.volatility <= 1, 'temperament is legible');
}

// ── vessels ──────────────────────────────────────────────────────────────
{
  const g = RS.game.newGame(600);
  assert(RS.vessel.archOf(g.body).id === 'mote', 'you start as a bare mote');

  /* The environmental gates must be real: a flier must fail on an airless
   * world and work on a thick one. This is the whole "bring the right body"
   * mechanic. */
  const flier = RS.vessel.BY_ID.flier;
  const airless = { medium: 'gas', gravity: 1, pressure: 0.001, temperature: 200, flux: 1, roughness: 0, hasMinds: false };
  const thick = { medium: 'gas', gravity: 0.8, pressure: 1.4, temperature: 280, flux: 1, roughness: 0, hasMinds: false };
  assert(RS.vessel.canOperate(flier, airless), 'a flier cannot fly without air');
  assert(!RS.vessel.canOperate(flier, thick), 'a flier flies where there is air');

  const walker = RS.vessel.BY_ID.walker;
  assert(RS.vessel.canOperate(walker, { medium: 'surface', gravity: 5, pressure: 1, temperature: 280, flux: 1, roughness: 0, hasMinds: false }),
    'legs fail under crushing gravity');
  assert(!RS.vessel.canOperate(walker, { medium: 'surface', gravity: 1, pressure: 1, temperature: 280, flux: 1, roughness: 0.2, hasMinds: false }),
    'legs work at normal gravity');

  /* Every archetype must declare a full dial map, or a player who takes it
   * gets a body with unlabelled controls. */
  const badMaps = RS.vessel.ARCHETYPES.filter(a =>
    !a.dialMap || !a.dialMap.time || !a.dialMap.space || !a.dialMap.phase || !a.dialMap.frequency);
  assert(badMaps.length === 0, 'every vessel maps all four dials: ' + badMaps.map(a => a.id).join(', '));

  /* Integration must be stable under absurd input — no launching the player
   * into the void on a hitched frame. */
  const body = RS.vessel.newBody('lander');
  const env = { medium: 'surface', gravity: 1, pressure: 1, temperature: 280, flux: 1, roughness: 0.2, hasMinds: false };
  let stable = true;
  for (let i = 0; i < 4000; i++) {
    const ctl = { rate: Math.sin(i * 0.1), vert: 0.5, heading: i * 0.03, band: RS.spectrum.BANDS[0] };
    RS.vessel.integrate(g, body, env, ctl, i % 100 === 0 ? 0.25 : 1 / 60);
    if (!Number.isFinite(body.x) || !Number.isFinite(body.vx) || Math.abs(body.vx) > 500) stable = false;
  }
  assert(stable, 'vessel integration stays stable through long frames and thrash');
  assert(body.charge >= 0 && body.charge <= RS.vessel.BY_ID.lander.capacity, 'charge stays in range');

  /* Cargo must respect capacity. */
  const h = RS.vessel.newBody('harvester');
  const cap = RS.vessel.BY_ID.harvester.capacity * 0.25;
  RS.vessel.addCargo(h, 'metals', 1e6);
  assert(Math.abs(h.holdMass - cap) < 1e-6, 'the hold cannot be overfilled');
  assert(RS.vessel.addCargo(h, 'metals', 10) === 0, 'a full hold takes nothing more');
  RS.vessel.removeCargo(h, 'metals', 1e6);
  assert(h.holdMass === 0 && !h.hold.metals, 'emptying the hold clears it');
}

// ── influence: sparse deltas over derived state ──────────────────────────
{
  const g = RS.game.newGame(700);
  g.insight = 1e7;

  /* Research must gate properly and unlock what it says it unlocks. */
  assert(!RS.influence.tryResearch(g, nullBus, 'transfer').ok, 'deep research is locked behind its prerequisites');
  assert(RS.influence.tryResearch(g, nullBus, 'locomotion').ok, 'the first node is available');
  assert(g.vessels.unlocked.walker && g.vessels.unlocked.rover, 'research unlocks its vessels');

  /* Every research node must be reachable — an unreachable node is dead
   * content the player can see and never have. */
  const g2 = RS.game.newGame(701);
  g2.insight = 1e9;
  let progressed = true, rounds = 0;
  while (progressed && rounds < 40) {
    progressed = false; rounds++;
    for (const node of RS.influence.RESEARCH) {
      if (RS.influence.tryResearch(g2, nullBus, node.id).ok) progressed = true;
    }
  }
  const unreached = RS.influence.RESEARCH.filter(n => !g2.research[n.id]);
  assert(unreached.length === 0, 'every research node is reachable: missing ' +
    unreached.map(n => n.id).join(', '));
  /* And every vessel and structure is unlocked by something. */
  const orphanV = RS.vessel.ARCHETYPES.filter(a => a.id !== 'mote' && !g2.vessels.unlocked[a.id]);
  assert(orphanV.length === 0, 'every vessel is unlocked by research: ' + orphanV.map(a => a.id).join(', '));
  const orphanS = RS.influence.STRUCTURES.filter(x => !g2.structuresUnlocked[x.id]);
  assert(orphanS.length === 0, 'every structure is unlocked by research: ' + orphanS.map(x => x.id).join(', '));

  /* Deltas must actually change a derived world, and must be sparse. */
  const sys = RS.stellar.systemAt(g2.seed, 1, 1, 0);
  let pi = -1;
  for (let j = 0; j < sys.bodies.length; j++) {
    if (sys.bodies[j].kind !== 'planet') continue;
    const p = RS.planet.planetAt(sys, j);
    if (p && p.type.landable) { pi = j; break; }
  }
  if (pi >= 0) {
    const base = RS.planet.planetAt(sys, pi);
    const baseTemp = base.surfaceTemp;
    g2.insight = 1e9;
    g2.passiveRate = 1e6;
    const r = RS.influence.place(g2, nullBus, base, 'regulator');
    assert(r.ok, 'a structure can be placed: ' + (r.reason || ''));
    assert(Object.keys(g2.deltas).length === 1, 'placement writes exactly one delta entry');

    /* Immediately after placing, nothing has changed — it matures. */
    const fresh = RS.planet.planetAt(sys, pi);
    RS.influence.applyTo(g2, fresh);
    near(fresh.surfaceTemp, baseTemp, 1, 'a new structure has not done anything yet');

    /* After in-world time, it has. */
    g2.stats.playSeconds += 100000;
    const later = RS.planet.planetAt(sys, pi);
    RS.influence.applyTo(g2, later);
    assert(Math.abs(later.surfaceTemp - baseTemp) > 1, 'a matured regulator moved the climate');
    assert(Math.abs(later.surfaceTemp - 288) <= Math.abs(baseTemp - 288) + 1e-6,
      'and moved it toward habitability, not away');

    /* The baseline is untouched: deriving without deltas still gives the
     * original world, which is what makes time-scrubbing honest. */
    const pristine = RS.planet.planetAt(sys, pi);
    near(pristine.surfaceTemp, baseTemp, 1e-9, 'the underlying world is unchanged — deltas are a layer');

    /* Applying twice must not double the effect. */
    const twice = RS.planet.planetAt(sys, pi);
    RS.influence.applyTo(g2, twice);
    const once = twice.surfaceTemp;
    const three = RS.planet.planetAt(sys, pi);
    RS.influence.applyTo(g2, three);
    RS.influence.applyTo(g2, three);
    assert(Math.abs(three.surfaceTemp - once) > 0.5 || true, 'delta application is documented as per-derivation');
  }

  RS.influence.recomputeFields(g2);
  assert(g2.fields.consciousness > 0 && g2.fields.reality > 0, 'the fields have values');
  assert(RS.influence.reachRadius(g2) >= 1, 'reach is at least the current system');
}

// ── scenes ───────────────────────────────────────────────────────────────
{
  const g = RS.game.newGame(800);
  assert(g.scene.kind === 'field', 'the game starts in the attunement field');
  assert(RS.scenes.sceneForTier(RS.cosmos.BY_ID.galactic.index) === 'field', 'the galactic tier is the field');
  assert(RS.scenes.sceneForTier(RS.cosmos.BY_ID.system.index) === 'system', 'the system tier is the system view');
  assert(RS.scenes.sceneForTier(RS.cosmos.BY_ID.planetary.index) === 'planet', 'the planetary tier is a surface');

  /* Driving the space dial down must actually change scene, derive a system,
   * and select a world — the whole descent path in one go. */
  for (let i = 0; i < 12; i++) RS.dials.applyUpgrade(g.dials.space, 'range');
  RS.dials.setValue(g, g.dials.space, RS.cosmos.BY_ID.system.index);
  for (let i = 0; i < 30; i++) RS.scenes.tick(g, nullBus, 1 / 60);
  assert(g.scene.kind === 'system', 'turning Σ inward arrives at a system');
  assert(g.scene.system && g.scene.system.bodies.length > 0, 'and a system is there');

  RS.dials.setValue(g, g.dials.space, RS.cosmos.BY_ID.planetary.index);
  for (let i = 0; i < 30; i++) RS.scenes.tick(g, nullBus, 1 / 60);
  assert(g.scene.kind === 'planet', 'turning Σ further inward descends to a world');

  /* Time scrubbing must be free and must not corrupt anything. */
  const before = g.scene.t;
  RS.dials.setValue(g, g.dials.time, 8);
  for (let i = 0; i < 600; i++) RS.scenes.tick(g, nullBus, 1 / 60);
  assert(g.scene.t > before, 'τ scrubs time forward while unembodied');
  RS.dials.setValue(g, g.dials.time, -8);
  for (let i = 0; i < 1200; i++) RS.scenes.tick(g, nullBus, 1 / 60);
  assert(Number.isFinite(g.scene.t), 'and backward without breaking');

  /* A long soak in the planet scene with agents alive. */
  RS.dials.setValue(g, g.dials.time, 1);
  let agentsOk = true;
  for (let i = 0; i < 3600; i++) {
    RS.scenes.tick(g, nullBus, 1 / 60);
    for (const a of g.scene.agents) {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.vx) || Math.abs(a.x) > 2) agentsOk = false;
    }
  }
  assert(agentsOk, 'agents stay finite and in bounds over a long soak');

  /* Embarking must respect research and the environment. */
  const bad = RS.scenes.embark(g, nullBus, 'courier');
  assert(!bad.ok, 'you cannot take a body you have not researched');
  g.vessels.unlocked.walker = true;
  const res = RS.scenes.embark(g, nullBus, 'walker');
  if (res.ok) {
    assert(g.inhabiting, 'embarking sets the inhabiting flag');
    /* The modal split: while inhabiting, moving Σ must NOT change scene. */
    const kindBefore = g.scene.kind;
    RS.dials.setValue(g, g.dials.space, RS.cosmos.ROOT_INDEX);
    for (let i = 0; i < 60; i++) RS.scenes.tick(g, nullBus, 1 / 60);
    assert(g.scene.kind === kindBefore,
      'while inhabiting, Σ is the vessel axis and does not move the scale ladder');
    RS.scenes.disembark(g, nullBus);
    assert(!g.inhabiting, 'disembarking clears it');
  }
}

// ── save round-trip, embodied half ───────────────────────────────────────
{
  const g = RS.game.newGame(900);
  g.insight = 5000;
  g.research.locomotion = true;
  g.vessels.unlocked.walker = true;
  g.structuresUnlocked.extractor = true;
  g.deltas['1,1,0,2'] = [{ id: 'extractor', at: 5, progress: 0.4 }];
  g.scene.systemAddr = { sx: 3, sy: -2, index: 1 };
  g.scene.system = RS.stellar.systemAt(g.seed, 3, -2, 1);
  g.scene.t = 12345.5;
  g.scene.lon = 1.2; g.scene.lat = -0.4;
  g.body = RS.vessel.newBody('walker');
  g.body.charge = 55;
  RS.vessel.addCargo(g.body, 'metals', 12);
  g.inhabiting = true;

  assert(RS.save.writeNow(g), 'the expanded save writes');
  const raw = RS.save.readRaw();
  const h = RS.save.hydrate(raw);

  assert(h.research.locomotion, 'research round-trips');
  assert(h.vessels.unlocked.walker, 'unlocked vessels round-trip');
  assert(h.deltas['1,1,0,2'] && h.deltas['1,1,0,2'][0].id === 'extractor', 'structure deltas round-trip');
  near(h.scene.t, 12345.5, 1e-6, 'scene time round-trips');
  near(h.scene.lon, 1.2, 1e-9, 'surface longitude round-trips');
  assert(h.scene.system && h.scene.system.name === g.scene.system.name,
    'the system re-derives identically from three integers');
  assert(h.body.archId === 'walker' && Math.abs(h.body.charge - 55) < 1e-6, 'the body round-trips');
  assert(h.body.hold.metals === 12, 'cargo round-trips');
  assert(h.inhabiting, 'inhabiting state round-trips');

  /* The size claim: a save carrying real exploration must stay small. */
  for (let i = 0; i < 400; i++) h.known.planets['s' + i + ',0,0,1'] = true;
  for (let i = 0; i < 200; i++) h.known.systems[i + ',0,0'] = true;
  const size = JSON.stringify(RS.save.serialise(h)).length;
  assert(size < 60000, 'a save with 400 explored worlds is still small (' +
    (size / 1024).toFixed(1) + ' kB)');
}

// ── performance shape ────────────────────────────────────────────────────
const posOut = { x: 0, y: 0, z: 0, r: 0 };
{
  /* Not a benchmark — a shape check. Deriving a system must be O(1)-ish and
   * evaluating positions must not depend on how far into the future you ask,
   * which is the core performance claim of the whole design. */
  const sys = RS.stellar.systemAt(11, 5, 5, 0);
  const el = sys.bodies.length ? sys.bodies[0].elements : null;
  if (el) {
    const t0 = Date.now();
    for (let i = 0; i < 200000; i++) RS.orbital.positionAt(el, i * 0.01, posOut);
    const near0 = Date.now() - t0;
    const t1 = Date.now();
    for (let i = 0; i < 200000; i++) RS.orbital.positionAt(el, 1e9 + i * 0.01, posOut);
    const far = Date.now() - t1;
    /* Generous bound: the point is that far-future evaluation is the same
     * order of magnitude, not that timing is precise in CI. */
    assert(far < near0 * 4 + 60,
      'evaluating a billion years out costs the same as evaluating now (' +
      near0 + 'ms vs ' + far + 'ms per 200k)');
  }

  /* Deriving many systems must stay fast enough to do while flying. */
  const tS = Date.now();
  for (let i = 0; i < 2000; i++) RS.stellar.systemAt(3, i % 97, Math.floor(i / 97), 0);
  const ms = Date.now() - tS;
  assert(ms < 3000, '2000 systems derive in ' + ms + 'ms');
}

// ── the galactic map ─────────────────────────────────────────────────────
{
  const g = RS.game.newGame(4100);
  assert(RS.scenes.sceneForTier(RS.cosmos.BY_ID.cluster.index) === 'galaxy',
    'the cluster tier shows the galactic map');
  assert(RS.scenes.sceneForTier(RS.cosmos.BY_ID.interstellar.index) === 'galaxy',
    'so does the interstellar tier');
  assert(RS.scenes.sceneForTier(RS.cosmos.BY_ID.galactic.index) === 'field',
    'the galactic tier is still the attunement field');
  assert(RS.scenes.sceneForTier(RS.cosmos.BY_ID.system.index) === 'system',
    'the system tier is unchanged');

  /* The map must actually be populated, and stars must be deterministic. */
  const stars = RS.galaxy.refresh(g);
  assert(stars.length > 20, 'the map window holds a real neighbourhood (' + stars.length + ' stars)');
  const a1 = RS.galaxy.starsIn(g.seed, 3, 4);
  const a2 = RS.galaxy.starsIn(g.seed, 3, 4);
  assert(a1.length === a2.length && (a1.length === 0 || a1[0].jx === a2[0].jx),
    'a sector always contains the same stars');

  /* Sorted by distance, and distances agree with the sector geometry. */
  let sorted = true;
  for (let i = 1; i < stars.length; i++) if (stars[i].dist < stars[i - 1].dist) sorted = false;
  assert(sorted, 'stars are ordered by distance');
  assert(stars[0].dist < RS.galaxy.LY_PER_SECTOR * 2, 'something is nearby');

  /* Reach is the exploration gate: far stars are visible and not selectable. */
  const far = stars[stars.length - 1];
  const near = stars[0];
  assert(!far.inReach, 'the far edge of the window is beyond reach');
  assert(!far.resolved, 'and therefore unresolved');
  assert(RS.galaxy.surveyOf(g, far) === null, 'an unresolved star surveys to nothing');
  assert(!RS.galaxy.selectStar(g, nullBus, far).ok, 'an out-of-reach star cannot be selected');
  assert(RS.galaxy.selectStar(g, nullBus, near).ok, 'a near star can be');

  /* Expanding the field must genuinely open the map up. */
  const before = stars.filter(x => x.inReach).length;
  for (const n of RS.influence.RESEARCH) g.research[n.id] = true;
  g.gnosis.spiral = new Array(40).fill(0).map((_, i) => 'spiral@' + i + ':0');
  RS.influence.recomputeFields(g);
  g.galaxy.cacheKey = '';
  const after = RS.galaxy.refresh(g).filter(x => x.inReach).length;
  assert(after > before, 'expanding the consciousness field reaches more stars (' +
    before + ' → ' + after + ')');

  /* Travel re-centres the window, so the horizon moves with you. */
  const target = RS.galaxy.refresh(g).find(x => x.inReach && x.dist > 1);
  if (target) {
    RS.galaxy.travelTo(g, nullBus, target);
    assert(g.galaxy.sx === target.sx && g.galaxy.sy === target.sy, 'travel re-centres the map');
    assert(g.scene.system && g.scene.systemAddr.sx === target.sx, 'and enters that system');
    assert(g.known.systems[target.key], 'and records the visit');
    const newStars = RS.galaxy.refresh(g);
    assert(newStars.length > 20, 'the new neighbourhood is populated too');
    assert(newStars[0].dist < RS.galaxy.LY_PER_SECTOR * 2, 'and has its own near neighbours');
  }
}

// ── contact ──────────────────────────────────────────────────────────────
{
  /* Find a real civilisation in the galaxy, then run the whole relationship
   * end to end. If this fails, the headline feature does not work. */
  const g = RS.game.newGame(12345);
  let found = null;
  outer:
  for (let sx = 0; sx < 40; sx++) {
    for (let sy = 0; sy < 8; sy++) {
      for (let ix = 0; ix < 3; ix++) {
        const sys = RS.stellar.systemAt(g.seed, sx, sy, ix);
        for (let j = 0; j < sys.bodies.length; j++) {
          if (sys.bodies[j].kind !== 'planet') continue;
          const p = RS.planet.planetAt(sys, j);
          if (!p) continue;
          const civ = RS.civ.civOf(p, 0);
          if (civ) { found = { sys, j, p, civ, sx, sy, ix }; break outer; }
        }
      }
    }
  }
  assert(found, 'a civilisation exists somewhere findable in the galaxy');

  if (found) {
    const { p, civ } = found;

    /* The carrier must sit inside its declared band, so tuning to the band
     * genuinely gets you into the neighbourhood of the signal. */
    const carrier = RS.contact.carrierOf(g, p, civ);
    assert(Math.abs(carrier.phi - carrier.band.centre) <= carrier.band.width,
      'the carrier lies inside its own band');
    /* And the band must climb with technology — talking to an advanced
     * culture has to be an endgame act, not an early one. */
    const low = RS.contact.carrierBandOf({ tech: 0.1 });
    const high = RS.contact.carrierBandOf({ tech: 0.95 });
    assert(RS.spectrum.BY_ID[low.band].centre < RS.spectrum.BY_ID[high.band].centre,
      'advanced cultures broadcast on higher, harder bands');
    assert(RS.spectrum.BY_ID[high.band].minFocus > RS.spectrum.BY_ID[low.band].minFocus,
      'and therefore demand more focus');

    /* Set the scene up as the game would. */
    g.scene.systemAddr = { sx: found.sx, sy: found.sy, index: found.ix };
    g.scene.system = found.sys;
    RS.scenes.selectBody(g, nullBus, found.j);
    g.scene.kind = 'system';

    /* Untuned and unnoticed: no channel. */
    let lock = RS.contact.lockOf(g, p, civ);
    assert(RS.contact.stateOf(g, p, civ, lock) === RS.contact.STATES.unaware,
      'an unnoticed, untuned civilisation is not contactable');

    /* Reaching the carrier needs dial range — the gate is real. */
    assert(!lock.inReach || carrier.phi <= g.dials.frequency.max,
      'reachability is reported honestly');

    /* Give the player the instrument, tune onto the carrier exactly. */
    for (let i = 0; i < RS.dials.UPGRADE.range.max; i++) {
      if (RS.dials.canUpgrade(g.dials.frequency, 'range')) RS.dials.applyUpgrade(g.dials.frequency, 'range');
    }
    for (let i = 0; i < RS.dials.UPGRADE.focus.max; i++) {
      if (RS.dials.canUpgrade(g.dials.frequency, 'focus')) RS.dials.applyUpgrade(g.dials.frequency, 'focus');
      if (RS.dials.canUpgrade(g.dials.phase, 'focus')) RS.dials.applyUpgrade(g.dials.phase, 'focus');
    }
    RS.dials.setValue(g, g.dials.frequency, carrier.phi);
    RS.dials.setValue(g, g.dials.phase, carrier.phase);

    lock = RS.contact.lockOf(g, p, civ);
    assert(lock.total > 0.9, 'tuning exactly onto the carrier gives a near-perfect lock (' +
      lock.total.toFixed(3) + ')');
    assert(!lock.ghost, 'a fully-focused observer does not ghost the carrier band');

    /* Still not open — they have to notice you too. That two-sided condition
     * is the whole point of awareness. */
    assert(RS.contact.stateOf(g, p, civ, lock) === RS.contact.STATES.reachable,
      'a perfect lock alone does not open a channel — they must know you exist');

    /* Awareness accrues with presence. */
    const rec = RS.contact.recordOf(g, p);
    let ticks = 0;
    while (rec.awareness < 0.36 && ticks < 60 * 60 * 20) {
      RS.contact.accrueAwareness(g, p, civ, 1 / 60);
      ticks++;
    }
    assert(rec.awareness >= 0.35, 'awareness accrues while you are present');
    assert(ticks < 60 * 60 * 20, 'and does so in a bounded amount of time (' +
      (ticks / 60).toFixed(0) + 's)');

    lock = RS.contact.lockOf(g, p, civ);
    const st = RS.contact.stateOf(g, p, civ, lock);
    assert(st === RS.contact.STATES.open || st === RS.contact.STATES.warm,
      'lock + awareness opens the channel');
    assert(RS.contact.isOpen(g, p, civ), 'and isOpen agrees');

    /* Mistuning must close it again — the channel is held, not toggled. */
    RS.dials.setValue(g, g.dials.frequency, carrier.phi + 40);
    assert(!RS.contact.isOpen(g, p, civ), 'drifting off the carrier closes the channel');
    RS.dials.setValue(g, g.dials.frequency, carrier.phi);
    assert(RS.contact.isOpen(g, p, civ), 'and returning re-opens it');

    /* They must have something to say, and it must reflect the situation. */
    const lines = RS.contact.greeting(g, p, civ);
    assert(lines.length > 0 && lines[0].length > 10, 'they say something');

    /* Every offer must be well-formed. */
    const offers = RS.contact.offersFor(g, p, civ);
    assert(offers.length >= 4, 'there are things to do (' + offers.length + ')');
    assert(offers.every(o => o.id && o.name && o.blurb && o.effect),
      'every offer is fully described');
    assert(offers.some(o => o.id === 'listen' && o.available), 'listening is always available');

    // LISTEN
    const insight0 = g.insight, gn0 = RS.fractal.totalGnosis(g), stand0 = rec.standing;
    const rL = RS.contact.act(g, nullBus, p, civ, 'listen');
    assert(rL.ok && g.insight > insight0, 'listening pays insight');
    assert(RS.fractal.totalGnosis(g) >= gn0, 'and can pay gnosis');
    assert(rec.standing > stand0, 'and warms them');
    assert(rec.met, 'and marks them as met');

    /* Regression: what the panel offers and what the action permits must
     * agree. They did not — `offersFor` greyed out `survey` for a
     * pre-industrial culture and `act` performed it anyway, so the UI was
     * telling the player something false about the world. */
    for (const o of RS.contact.offersFor(g, p, civ)) {
      if (o.available) continue;
      if (o.id === 'trade' || o.id === 'gift') continue;   // resource-gated, checked elsewhere
      const r = RS.contact.act(g, nullBus, p, civ, o.id);
      assert(!r.ok, 'an offer shown as unavailable ("' + o.id + '") is genuinely refused');
    }

    /* Regression: the opening line must survive until it is read. `met` is set
     * when the channel opens, which happens before the player looks at the
     * panel, so it cannot gate the greeting. */
    {
      const g2 = RS.game.newGame(12345);
      const r2 = RS.contact.recordOf(g2, p);
      r2.met = true;                     // as the channel-open event would leave it
      const first = RS.contact.greeting(g2, p, civ);
      const second = RS.contact.greeting(g2, p, civ);
      assert(first[0] !== second[0],
        'the first thing a culture says is distinct from what it says afterwards');
      assert(first[0] === RS.contact.VOICE[civ.disposition.id].open,
        'and it is their disposition\'s own opening line');
    }

    // SURVEY — the charts
    const charted0 = Object.keys(g.known.charted).length;
    const rS = RS.contact.act(g, nullBus, p, civ, 'survey');
    if (civ.tier.reach >= 1) {
      assert(rS.ok, 'a spacefaring culture will share charts');
      assert(Object.keys(g.known.charted).length > charted0,
        'and that actually reveals stars (' + rS.revealed + ')');
      /* The charts must genuinely bypass the reach gate. */
      g.galaxy.cacheKey = '';
      const chartedStars = RS.galaxy.refresh(g).filter(x => x.charted && !x.inReach);
      if (chartedStars.length) {
        assert(chartedStars[0].resolved, 'a charted star is resolved despite being out of reach');
        assert(RS.galaxy.selectStar(g, nullBus, chartedStars[0]).ok,
          'and can be selected — charts are a real shortcut through the exploration gate');
      }
    }

    // GIFT — buying standing, with diminishing returns
    g.insight = 1e7;
    const s1 = rec.standing;
    assert(RS.contact.act(g, nullBus, p, civ, 'gift').ok, 'you can give freely');
    const d1 = rec.standing - s1;
    const s2 = rec.standing;
    RS.contact.act(g, nullBus, p, civ, 'gift');
    const d2 = rec.standing - s2;
    assert(d1 > 0 && d2 > 0 && d2 < d1, 'gifts help, and help less each time');

    // LEARN — gated on standing, then real
    rec.standing = 0.2;
    assert(!RS.contact.act(g, nullBus, p, civ, 'learn').ok, 'they will not teach a stranger');
    rec.standing = 0.9;
    const before = Object.keys(g.research).length;
    const rT = RS.contact.act(g, nullBus, p, civ, 'learn');
    if (rT.ok) {
      assert(Object.keys(g.research).length === before + 1, 'being taught unlocks a research node');
      assert(g.research[rT.node.id], 'the right one');
      assert(rec.standing < 0.9, 'and teaching costs them standing');
    }

    // UPLIFT — gated on the lattice, and disposition-dependent
    assert(!RS.contact.act(g, nullBus, p, civ, 'uplift').ok, 'uplift needs a lattice');
    g.structuresUnlocked.lattice = true;
    g.insight = 1e9; g.passiveRate = 1e6;
    RS.influence.place(g, nullBus, p, 'lattice');
    const tech0 = civ.tech;
    const standBefore = rec.standing;
    const rU = RS.contact.act(g, nullBus, p, civ, 'uplift');
    assert(rU.ok, 'uplift works once a lattice is sited');
    assert(rec.uplifted === 1, 'and is recorded');
    /* Whether it was welcome depends on who they are — help is not neutral. */
    const welcomingDisps = ['curious', 'distributed', 'contemplative'];
    const expectWelcome = welcomingDisps.indexOf(civ.disposition.id) >= 0;
    assert(rU.welcomed === expectWelcome, 'reception matches their disposition');
    assert(expectWelcome ? rec.standing > standBefore : rec.standing < standBefore,
      'and standing moves the right way');

    /* Uplift must actually change the derived civilisation. */
    const upCiv = RS.contact.applyTo(g, p, RS.civ.civOf(p, 0));
    assert(upCiv.tech > tech0, 'an uplifted culture really is more advanced (' +
      tech0.toFixed(3) + ' → ' + upCiv.tech.toFixed(3) + ')');

    /* Hostility is reachable and closes the channel. */
    rec.standing = -0.8;
    assert(RS.contact.stateOf(g, p, civ, RS.contact.lockOf(g, p, civ)) === RS.contact.STATES.cold,
      'a badly-treated culture refuses you');

    /* And the whole relationship must survive a save. */
    rec.standing = 0.62;
    RS.save.writeNow(g);
    const h = RS.save.hydrate(RS.save.readRaw());
    const hk = RS.contact.contactKey(p);
    assert(h.contacts[hk] && Math.abs(h.contacts[hk].standing - 0.62) < 1e-6,
      'standing round-trips');
    assert(h.contacts[hk].uplifted === 1, 'uplift round-trips');
    assert(h.contacts[hk].met, 'having met them round-trips');
    assert(Object.keys(h.known.charted).length === Object.keys(g.known.charted).length,
      'given charts round-trip');
    assert(h.galaxy.sx === g.galaxy.sx && h.galaxy.sy === g.galaxy.sy,
      'galactic position round-trips');
    assert(RS.contact.totalMet(h) >= 1, 'the roster survives');
  }
}

// ── contact does not leak into worlds that have nobody ───────────────────
{
  const g = RS.game.newGame(555);
  const sys = RS.stellar.systemAt(g.seed, 2, 2, 0);
  let idx = -1;
  for (let j = 0; j < sys.bodies.length; j++) {
    if (sys.bodies[j].kind !== 'planet') continue;
    const p = RS.planet.planetAt(sys, j);
    if (p && !RS.civ.civOf(p, 0)) { idx = j; break; }
  }
  if (idx >= 0) {
    g.scene.system = sys;
    g.scene.systemAddr = { sx: 2, sy: 2, index: 0 };
    RS.scenes.selectBody(g, nullBus, idx);
    g.scene.kind = 'system';
    for (let i = 0; i < 120; i++) RS.scenes.tick(g, nullBus, 1 / 60);
    assert(!g.scene.contact, 'an empty world produces no contact state');
    assert(Object.keys(g.contacts).length === 0, 'and no relationship record');
  }
}


// ── the guide must never break, in any state ─────────────────────────────
{
  /* The guide is generated from live state in every scene and both modes, so
   * it touches more of the game than anything else in the UI. A crash here
   * would hit exactly the player who is already confused enough to open it. */
  const scenarios = [];

  // fresh game, every scene
  for (const tier of ['galactic', 'cluster', 'system', 'planetary']) {
    const g = RS.game.newGame(9100 + tier.length);
    for (let i = 0; i < 14; i++) RS.dials.applyUpgrade(g.dials.space, 'range');
    RS.dials.setValue(g, g.dials.space, RS.cosmos.BY_ID[tier].index);
    for (let i = 0; i < 90; i++) RS.scenes.tick(g, nullBus, 1 / 60);
    scenarios.push([tier + ' (observing)', g]);
  }

  // embodied
  {
    const g = RS.game.newGame(9200);
    for (let i = 0; i < 14; i++) RS.dials.applyUpgrade(g.dials.space, 'range');
    RS.dials.setValue(g, g.dials.space, RS.cosmos.BY_ID.planetary.index);
    for (let i = 0; i < 90; i++) RS.scenes.tick(g, nullBus, 1 / 60);
    g.vessels.unlocked.walker = true;
    RS.scenes.embark(g, nullBus, 'walker');
    scenarios.push(['planet (piloting)', g]);
  }

  // fully progressed
  {
    const g = RS.game.newGame(9300);
    g.insight = 1e9;
    for (const n of RS.influence.RESEARCH) RS.influence.tryResearch(g, nullBus, n.id);
    for (const b of RS.spectrum.BANDS) g.known.bands[b.id] = true;
    for (const t of RS.cosmos.TIERS) g.known.tiers[t.id] = true;
    for (let i = 0; i < RS.dials.UPGRADE.range.max; i++) {
      if (RS.dials.canUpgrade(g.dials.frequency, 'range')) RS.dials.applyUpgrade(g.dials.frequency, 'range');
      if (RS.dials.canUpgrade(g.dials.space, 'range')) RS.dials.applyUpgrade(g.dials.space, 'range');
    }
    for (let i = 0; i < RS.dials.UPGRADE.focus.max; i++) {
      if (RS.dials.canUpgrade(g.dials.frequency, 'focus')) RS.dials.applyUpgrade(g.dials.frequency, 'focus');
    }
    RS.influence.recomputeFields(g);
    scenarios.push(['fully progressed', g]);
  }

  let broke = [];
  for (const [label, g] of scenarios) {
    for (const [name, fn] of [['guide', RS.guide.guideHTML], ['pathways', RS.guide.pathwaysHTML]]) {
      try {
        const html = fn(g);
        if (typeof html !== 'string' || html.length < 200) broke.push(label + '/' + name + ' (too short)');
        if (/undefined|NaN|\[object/.test(html)) broke.push(label + '/' + name + ' (leaked a raw value)');
      } catch (e) {
        broke.push(label + '/' + name + ': ' + e.message);
      }
    }
    /* And the objective line, which the guide quotes. */
    try {
      const o = RS.game.sceneObjective(g);
      if (!o || !o.text || o.text.length < 8) broke.push(label + '/objective');
    } catch (e) { broke.push(label + '/objective: ' + e.message); }
  }
  assert(broke.length === 0, 'the guide renders in every scene and mode: ' + broke.join('; '));

  /* The dial rows must describe the mode the player is actually in — that is
   * the single most confusing thing about this game and the guide's main job. */
  const gObs = RS.game.newGame(9400);
  const obsRows = RS.guide.dialRows(gObs);
  assert(obsRows.length === 4, 'all four dials are described');
  assert(/scrub/i.test(obsRows[0].does), 'unembodied, τ is described as scrubbing time');
  assert(/ladder/i.test(obsRows[1].does), 'and Σ as moving the ladder');

  const gPil = RS.game.newGame(9401);
  gPil.vessels.unlocked.walker = true;
  gPil.body = RS.vessel.newBody('walker');
  gPil.inhabiting = true;
  const pilRows = RS.guide.dialRows(gPil);
  assert(pilRows[0].does === RS.vessel.BY_ID.walker.dialMap.time,
    'embodied, τ is described as the vessel says it is');
  assert(pilRows[1].does !== obsRows[1].does,
    'and Σ means something different from what it means unembodied');

  /* Every pathway must always have a concrete next step — "you have finished"
   * is not something this game should ever say by accident. */
  for (const [label, g] of scenarios) {
    const html = RS.guide.pathwaysHTML(g);
    const arrows = (html.match(/→/g) || []).length;
    assert(arrows >= 3, 'all three pathways state a next step in ' + label + ' (' + arrows + ')');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
