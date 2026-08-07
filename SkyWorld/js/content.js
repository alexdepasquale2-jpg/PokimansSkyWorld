/* Skyward Reach — static content tables.
 * Everything designers would want to tune lives here. No game logic.
 */
(function (SW) {
  'use strict';

  const TICKS_PER_DAY = 60;

  const CROPS = {
    sunwheat: {
      id: 'sunwheat', name: 'Sunwheat', glyph: '🌾', tint: '#e8c264',
      seedCost: 4, growTicks: 40, thirst: 0.9, yield: 3, price: 8, feed: 14,
      rank: 0, blurb: 'Hardy, cheap, forgiving. The grain every godling starts on.'
    },
    glimmerroot: {
      id: 'glimmerroot', name: 'Glimmerroot', glyph: '🥕', tint: '#7fd1c2',
      seedCost: 14, growTicks: 70, thirst: 1.15, yield: 3, price: 22, feed: 13,
      rank: 1, blurb: 'Drinks light through its leaves and hoards it underground.'
    },
    duskberry: {
      id: 'duskberry', name: 'Duskberry', glyph: '🫐', tint: '#9a86e0',
      seedCost: 30, growTicks: 100, thirst: 1.3, yield: 4, price: 40, feed: 22,
      rank: 2, blurb: 'Ripens only after nightfall. Sweet enough to spoil a beast.'
    },
    aetherbloom: {
      id: 'aetherbloom', name: 'Aetherbloom', glyph: '🌸', tint: '#f19ac7',
      seedCost: 70, growTicks: 140, thirst: 1.5, yield: 3, price: 130, feed: 30,
      rank: 3, blurb: 'Grows toward whoever is watching. Judges adore it.'
    }
  };
  const CROP_LIST = Object.values(CROPS);

  // Rank ladder. Renown thresholds gate features — the whole social spine.
  const RANKS = [
    { id: 0, name: 'Unlisted',  renown: 0,    color: '#8b93a7', unlock: null },
    { id: 1, name: 'Mote',      renown: 100,  color: '#79c0ff', unlock: 'Glimmerroot seed · 3rd farm plot · the Quickening' },
    { id: 2, name: 'Ember',     renown: 600,  color: '#ffa657', unlock: 'Duskberry seed · Shrine tier II · the Storm' },
    { id: 3, name: 'Beacon',    renown: 2200, color: '#e3b341', unlock: 'Aetherbloom seed · Shrine tier III' },
    { id: 4, name: 'Luminary',  renown: 6000, color: '#d2a8ff', unlock: 'Shrine tier IV · the Festival crown' },
    { id: 5, name: 'Ascendant', renown: 16000, color: '#7ee787', unlock: 'Nothing left above you.' }
  ];

  const MIRACLES = {
    rain:       { id: 'rain',       name: 'Rain',        glyph: '🌧️', cost: 12, rank: 0, desc: 'Fills every plot to the brim.' },
    quickening: { id: 'quickening', name: 'Quickening',  glyph: '✨', cost: 28, rank: 1, desc: 'Shoves all growing crops forward by a quarter.' },
    bounty:     { id: 'bounty',     name: 'Bounty',      glyph: '🍞', cost: 22, rank: 0, desc: '+42 food straight into the granary.' },
    mend:       { id: 'mend',       name: 'Mend',        glyph: '💗', cost: 18, rank: 0, desc: 'Restores your creature\'s vigour and fills its belly.' },
    storm:      { id: 'storm',      name: 'Storm',       glyph: '⚡', cost: 34, rank: 2, desc: 'Terror in the sky. Awe up, faith down, mortals remember.' }
  };
  const MIRACLE_LIST = Object.values(MIRACLES);

  // Creature lineages — starting stats and pre-wired instincts.
  const LINEAGES = {
    thistlebeak: {
      id: 'thistlebeak', name: 'Thistlebeak', glyph: '🪶',
      blurb: 'Quick, nosy, hollow-boned. Learns fastest, tires fastest.',
      base: { strength: 4, cunning: 9, grace: 7, size: 0.85 },
      wits: 1.30, appetite: 1.05, stamina: 0.85,
      instinct: { forage: 1.5, play: 1.4, graze: 1.2 },
      palette: { hide: '#c9d6a8', belly: '#eef3dc', mark: '#8fa86b' }
    },
    mossback: {
      id: 'mossback', name: 'Mossback', glyph: '🐢',
      blurb: 'Slow, patient, enormously durable. Forgets nothing, learns late.',
      base: { strength: 9, cunning: 4, grace: 5, size: 1.15 },
      wits: 0.78, appetite: 1.25, stamina: 1.35,
      instinct: { rest: 1.6, water: 1.3, harvest: 1.1 },
      palette: { hide: '#8fae8a', belly: '#d8e6cd', mark: '#5c7a58' }
    },
    emberwing: {
      id: 'emberwing', name: 'Emberwing', glyph: '🦎',
      blurb: 'Hot-tempered and magnificent. Villagers fear it before they love it.',
      base: { strength: 8, cunning: 7, grace: 8, size: 1.0 },
      wits: 1.0, appetite: 1.15, stamina: 1.0,
      instinct: { terrorize: 1.5, perform: 1.4, feast: 1.2 },
      palette: { hide: '#d99a6c', belly: '#f6dcc0', mark: '#a85c3a' }
    }
  };
  const LINEAGE_LIST = Object.values(LINEAGES);

  /* Creature behaviours. `weight` is what learning actually modifies.
   * kind/diligent: how performing this act nudges the two alignment axes.
   * teachable: whether praise/scold can move it at all (instincts like `rest` are).
   */
  const ACTS = {
    water:     { id: 'water',     name: 'water a plot',        verb: 'waters',      icon: '💧', vigor: 4,  kind: 0.6,  diligent: 1.0, useful: true },
    harvest:   { id: 'harvest',   name: 'bring in a harvest',  verb: 'harvests',    icon: '🧺', vigor: 6,  kind: 0.5,  diligent: 1.0, useful: true },
    till:      { id: 'till',      name: 'break new soil',      verb: 'tills',       icon: '⛏️', vigor: 7,  kind: 0.2,  diligent: 1.0, useful: true },
    sow:       { id: 'sow',       name: 'sow a seed',          verb: 'sows',        icon: '🌱', vigor: 3,  kind: 0.4,  diligent: 1.0, useful: true },
    forage:    { id: 'forage',    name: 'gather wood',         verb: 'forages',     icon: '🪵', vigor: 5,  kind: 0.2,  diligent: 0.9, useful: true },
    tithe:     { id: 'tithe',     name: 'feed the villagers',  verb: 'feeds',       icon: '🥣', vigor: 3,  kind: 1.0,  diligent: 0.6, useful: true },
    play:      { id: 'play',      name: 'play with mortals',   verb: 'plays with',  icon: '🎈', vigor: 3,  kind: 0.9,  diligent: -0.3, useful: true },
    perform:   { id: 'perform',   name: 'perform',             verb: 'performs for',icon: '🎭', vigor: 5,  kind: 0.5,  diligent: 0.4, useful: true },
    graze:     { id: 'graze',     name: 'eat your crops',      verb: 'devours',     icon: '😋', vigor: -4, kind: -0.4, diligent: -0.8, useful: false },
    feast:     { id: 'feast',     name: 'raid the granary',    verb: 'raids',       icon: '🍖', vigor: -6, kind: -0.5, diligent: -0.6, useful: false },
    terrorize: { id: 'terrorize', name: 'terrorise the village', verb: 'terrorises', icon: '💀', vigor: 5, kind: -1.4, diligent: 0.2,  useful: false },
    rest:      { id: 'rest',      name: 'sleep',               verb: 'sleeps by',   icon: '💤', vigor: -14, kind: 0,   diligent: -1.0, useful: false },
    wander:    { id: 'wander',    name: 'wander',              verb: 'wanders past',icon: '🌀', vigor: 1,  kind: 0,    diligent: -0.4, useful: false }
  };
  const ACT_LIST = Object.values(ACTS);
  // Acts shown in the training panel, in teaching order.
  const TRAINABLE = ['water', 'harvest', 'sow', 'till', 'forage', 'tithe', 'play', 'perform', 'graze', 'feast', 'terrorize', 'rest'];

  const LEASHES = {
    none:       { id: 'none',       name: 'Unleashed',  glyph: '🌬️', desc: 'It does as it pleases. You can still praise and scold.' },
    compassion: { id: 'compassion', name: 'Compassion', glyph: '💚', desc: 'Kind and useful acts are twice as likely. Cruelty is suppressed.' },
    aggression: { id: 'aggression', name: 'Aggression', glyph: '🔥', desc: 'Cruelty and spectacle are twice as likely. Awe over love.' },
    learning:   { id: 'learning',   name: 'Learning',   glyph: '👁️', desc: 'It watches you. Every chore you do by hand, it learns a little.' }
  };
  const LEASH_LIST = Object.values(LEASHES);

  const SHRINE_TIERS = [
    { tier: 0, name: 'Bare Stone',        wood: 0,   coin: 0,    grandeur: 0,  rank: 0 },
    { tier: 1, name: 'Cairn',             wood: 12,   coin: 60,     grandeur: 4,  rank: 0 },
    { tier: 2, name: 'Standing Ring',     wood: 40,   coin: 340,    grandeur: 12, rank: 1 },
    { tier: 3, name: 'Sky Altar',         wood: 190,  coin: 6000,   grandeur: 30, rank: 2, ring: 0 },
    { tier: 4, name: 'Cathedral of Cloud',wood: 620,  coin: 60000,  grandeur: 70, rank: 3, ring: 1 },
    { tier: 5, name: 'The Reach Itself',  wood: 2000, coin: 320000, grandeur: 170,rank: 4, ring: 2 }
  ];

  const HUT_COST = { wood: 8, coin: 40, scale: 1.32 };
  const PLOT_COST = { wood: 6, coin: 50, scale: 1.45 };

  // Festival categories rotate. Each scores a different half of your empire.
  const FESTIVALS = [
    { id: 'harvest', name: 'The Harvest Fair', glyph: '🧺',
      blurb: 'Judges weigh the finest crate you can put on the table.',
      par: d => 22 * Math.pow(d, 1.15) },
    { id: 'beast', name: 'The Beast Trial', glyph: '🐾',
      blurb: 'Your creature, alone in the ring, judged on what you made of it.',
      par: d => 120 + 900 * (1 - Math.exp(-d / 38)) + 1.2 * d },
    { id: 'rite', name: 'The Grand Rite', glyph: '🕯️',
      blurb: 'Shrine, faith, awe. Pure standing, nothing to hide behind.',
      par: d => 70 + 1500 * (1 - Math.exp(-d / 45)) + 1.5 * d }
  ];

  const RIVALS = [
    { name: 'Vashti of the Nine Terraces', pace: 1.00, spike: 0.35, tone: 'proud' },
    { name: 'Old Kellum',                  pace: 0.72, spike: 0.15, tone: 'kind' },
    { name: 'The Pale Auditor',            pace: 1.18, spike: 0.10, tone: 'cold' },
    { name: 'Bright Sisera',               pace: 0.88, spike: 0.45, tone: 'proud' },
    { name: 'Hob of the Low Cloud',        pace: 0.55, spike: 0.55, tone: 'crude' },
    { name: 'Mother Anneth',               pace: 0.95, spike: 0.20, tone: 'kind' },
    { name: 'Sixfold Ryn',                 pace: 1.32, spike: 0.30, tone: 'cold' },
    { name: 'The Gardener in Grey',        pace: 0.80, spike: 0.25, tone: 'kind' },
    { name: 'Tallow Marrek',               pace: 1.05, spike: 0.50, tone: 'crude' },
    { name: 'Ilsabet Ninewinds',           pace: 1.22, spike: 0.28, tone: 'proud' },
    { name: 'The Quiet Thing Below',       pace: 1.45, spike: 0.12, tone: 'cold' }
  ];

  // Rival chatter, keyed by how they feel about you right now.
  const BARBS = {
    ahead: { // rival is above you
      proud: ['{r} has not looked down once today.', '{r} lets it be known that the Register speaks for itself.'],
      kind:  ['{r} says there is no shame in a slow climb.', '{r} sends a sack of seed and no comment.'],
      cold:  ['{r} has recorded your position. That is all.', '{r} finds your rate of growth unremarkable.'],
      crude: ['{r} asks if your island is the small one.', '{r} laughs at something. Probably you.']
    },
    near: { // within striking distance
      proud: ['{r} has begun to watch you properly.', '{r} says the gap is a courtesy, not a fact.'],
      kind:  ['{r} says you are doing well. {r} means it.', '{r} raises a cup in your direction.'],
      cold:  ['{r} has revised your entry upward.', '{r} is now accounting for you.'],
      crude: ['{r} is telling everyone you got lucky.', '{r} wants a word. Bring the creature.']
    },
    behind: { // you passed them
      proud: ['{r} refuses to discuss the standings.', '{r} calls the Register a popularity contest now.'],
      kind:  ['{r} congratulates you, loudly, twice.', '{r} says they always knew.'],
      cold:  ['{r} has stopped commenting on the Register.', '{r} notes the change without emotion.'],
      crude: ['{r} says the rankings are rigged.', '{r} demands a rematch at the next festival.']
    }
  };

  const FEATS = [
    { id: 'first_harvest',  name: 'First Bushel',        desc: 'Harvest anything at all.',                  renown: 10,   check: g => g.stats.harvests >= 1 },
    { id: 'harvest_50',     name: 'Calloused Hands',     desc: 'Harvest 50 crops.',                         renown: 30,   check: g => g.stats.harvests >= 50 },
    { id: 'harvest_400',    name: 'Grinder',             desc: 'Harvest 400 crops.',                        renown: 180,  check: g => g.stats.harvests >= 400 },
    { id: 'harvest_2000',   name: 'The Long Furrow',     desc: 'Harvest 2000 crops.',                       renown: 900, check: g => g.stats.harvests >= 2000 },
    { id: 'coin_500',       name: 'Coin in the Jar',     desc: 'Hold 500 coin at once.',                    renown: 25,   check: g => g.res.coin >= 500 },
    { id: 'coin_5000',      name: 'Merchant God',        desc: 'Hold 5,000 coin at once.',                  renown: 150,  check: g => g.res.coin >= 5000 },
    { id: 'coin_50000',     name: 'Obscene Wealth',      desc: 'Hold 50,000 coin at once.',                 renown: 900, check: g => g.res.coin >= 50000 },
    { id: 'plots_8',        name: 'Enclosure',           desc: 'Own 8 farm plots.',                         renown: 60,  check: g => g.plots.length >= 8 },
    { id: 'plots_16',       name: 'Horizon to Horizon',  desc: 'Own all 16 farm plots.',                    renown: 350,  check: g => g.plots.length >= 16 },
    { id: 'village_6',      name: 'A Real Village',      desc: 'Shelter 6 villagers.',                      renown: 60,  check: g => g.village.villagers >= 6 },
    { id: 'village_14',     name: 'Congregation',        desc: 'Shelter 14 villagers.',                     renown: 320,  check: g => g.village.villagers >= 14 },
    { id: 'faith_80',       name: 'Beloved',             desc: 'Reach 80 Faith.',                           renown: 110,  check: g => g.village.faith >= 80 },
    { id: 'awe_80',         name: 'Feared',              desc: 'Reach 80 Awe.',                             renown: 110,  check: g => g.village.awe >= 80 },
    { id: 'both_60',        name: 'Loved and Feared',    desc: 'Hold 60 Faith and 60 Awe at the same time.', renown: 320,  check: g => g.village.faith >= 60 && g.village.awe >= 60 },
    { id: 'taught_one',     name: 'It Understood',       desc: 'Teach any chore to 60% mastery.',           renown: 40,   check: g => SW.creature.masteredCount(g, 0.60) >= 1 },
    { id: 'taught_three',   name: 'A Working Beast',     desc: 'Teach three chores to 60% mastery.',        renown: 160,  check: g => SW.creature.masteredCount(g, 0.60) >= 3 },
    { id: 'taught_all',     name: 'Farmhand of the Gods',desc: 'Teach all five farm chores to 70%.',        renown: 600, check: g => SW.creature.farmChoresMastered(g, 0.70) },
    { id: 'bond_90',        name: 'Inseparable',         desc: 'Reach 90 Bond with your creature.',         renown: 160,  check: g => g.creature.bond >= 90 },
    { id: 'size_2',         name: 'It Blots the Sun',    desc: 'Grow your creature to twice its birth size.',renown: 150, check: g => g.creature.size >= 2.0 },
    { id: 'saint',          name: 'Saint',               desc: 'Push your creature to +90 Kindness.',       renown: 130,  check: g => g.creature.kind >= 90 },
    { id: 'monster',        name: 'Monster',             desc: 'Push your creature to -90 Kindness.',       renown: 130,  check: g => g.creature.kind <= -90 },
    { id: 'shrine_3',       name: 'Something Permanent', desc: 'Raise the shrine to tier III.',             renown: 150,  check: g => g.shrine >= 3 },
    { id: 'shrine_5',       name: 'The Reach Itself',    desc: 'Raise the shrine to its final tier.',       renown: 1200, check: g => g.shrine >= 5 },
    { id: 'fest_win',       name: 'Crowned',             desc: 'Win a festival.',                           renown: 120,  check: g => g.stats.festivalWins >= 1 },
    { id: 'fest_win_5',     name: 'Serial Winner',       desc: 'Win five festivals.',                       renown: 500, check: g => g.stats.festivalWins >= 5 },
    { id: 'top_five',       name: 'Named in the Register',desc: 'Reach the top five of the Register.',      renown: 200,  check: g => g.lastStanding > 0 && g.lastStanding <= 5 },
    { id: 'top_one',        name: 'Ascendant',           desc: 'Stand first in the Skyward Register.',      renown: 900, check: g => g.lastStanding === 1 },
    { id: 'gen_2',          name: 'It Bred True',        desc: 'Complete a generation leap.',               renown: 40,   check: g => (g.gens | 0) >= 1 },
    { id: 'gen_6',          name: 'A Real Lineage',      desc: 'Complete six generation leaps.',            renown: 300,  check: g => (g.gens | 0) >= 6 },
    { id: 'gen_15',         name: 'Deep Time',           desc: 'Complete fifteen generation leaps.',        renown: 1600, check: g => (g.gens | 0) >= 15 },
    { id: 'evo_1',          name: 'The Line Turns',      desc: 'Reach the first evolution.',                renown: 140,  check: g => (g.evo | 0) >= 1 },
    { id: 'evo_3',          name: 'Something Else Now',  desc: 'Reach the third evolution.',                renown: 900,  check: g => (g.evo | 0) >= 3 },
    { id: 'evo_5',          name: 'Skyborn',             desc: 'Take the line as far as it goes.',          renown: 3200, check: g => (g.evo | 0) >= 5 },
    { id: 'ingrain_3',      name: 'Bone Deep',           desc: 'Fully ingrain three behaviours.',           renown: 220,  check: g => SW.lineage.ingrainedCount(g, 0.95) >= 3 },
    { id: 'ring_1',         name: 'Wider Ground',        desc: 'Raise the second terrace.',                 renown: 140,  check: g => (g.ring | 0) >= 1 },
    { id: 'ring_3',         name: 'The Far Reach',       desc: 'Build the island out as far as it goes.',   renown: 2000, check: g => (g.ring | 0) >= 3 },
    { id: 'found_8',        name: 'Curious',             desc: 'Examine eight unknown things.',             renown: 110,  check: g => Object.keys(g.discovered).length >= 8 },
    { id: 'found_all',      name: 'Nothing Left Unknown',desc: 'Examine everything on the island.',         renown: 1400, check: g => Object.keys(g.discovered).length >= SW.content.FEATURES.length },
    { id: 'neurons_6',      name: 'Rewired',             desc: 'Grow six neurons.',                         renown: 180,  check: g => Object.keys(g.neurons).length >= 6 },
    { id: 'neurons_all',    name: 'The Whole Web',       desc: 'Grow every neuron.',                        renown: 1800, check: g => Object.keys(g.neurons).length >= SW.content.NEURONS.length },
    { id: 'recipes_8',      name: 'Handy',               desc: 'Discover eight things at the bench.',       renown: 150,  check: g => Object.keys(g.recipes).length >= 8 },
    { id: 'recipes_all',    name: 'Master of the Bench', desc: 'Discover every pairing that works.',        renown: 1500, check: g => Object.keys(g.recipes).length >= SW.content.RECIPES.length },
    { id: 'day_10',         name: 'Ten Days',            desc: 'Survive ten days.',                         renown: 30,   check: g => g.day >= 10 },
    { id: 'day_40',         name: 'Forty Days',          desc: 'Survive forty days.',                       renown: 200,  check: g => g.day >= 40 }
  ];

  const HATCH_HINTS = [
    'Whatever you praise, it will do again. Whatever you strike it for, it will hide from you.',
    'A creature taught to water your plots is worth more than any miracle you can buy.',
    'Love and terror both climb the Register. They just climb it differently.'
  ];

  /* ---------------------------------------------------------------------
   * Lineage — the creature ages, breeds, and passes on what you managed to
   * ingrain. Learning within one life is cheap and temporary; the only thing
   * that survives a generation is behaviour you reinforced hard enough.
   * ------------------------------------------------------------------- */
  const LIFESPAN = 66;   // days, if nothing kills it first

  const AGES = [
    { id: 'whelp', name: 'Whelp', from: 0,  wits: 1.5,  stamina: 0.7,  statMul: 0.55, sizeCap: 1.3,
      note: 'Soaks up everything. Too small to be much use.' },
    { id: 'prime', name: 'Prime', from: 10, wits: 1.0,  stamina: 1.0,  statMul: 1.0,  sizeCap: 3.2,
      note: 'Strong, steady, and set in its ways.' },
    { id: 'elder', name: 'Elder', from: 48, wits: 0.65, stamina: 0.72, statMul: 0.92, sizeCap: 3.2,
      note: 'Slower now, but what it knows, it knows to the bone.' }
  ];

  /* Every third generation the line itself changes shape. These are permanent
   * and cumulative — the reason to keep breeding rather than coddle one beast. */
  const EVOLUTIONS = [
    { tier: 0, gens: 0,  name: 'Unchanged',    glyph: '·',
      blurb: 'The shape it was born in.', bonus: {} },
    { tier: 1, gens: 3,  name: 'Broad-backed', glyph: '🦴',
      blurb: 'Heavier through the shoulder. It carries more and tires later.',
      bonus: { strength: 0.25, stamina: 0.20, yield: 0.22 } },
    { tier: 2, gens: 6,  name: 'Bright-eyed',  glyph: '👁️',
      blurb: 'It notices things. Teaching takes fewer repetitions, and it finds what is hidden.',
      bonus: { wits: 0.35, insight: 0.40, yield: 0.10 } },
    { tier: 3, gens: 10, name: 'Long-limbed',  glyph: '🦵',
      blurb: 'Covers the island at a lope. It gets through far more work in a day.',
      bonus: { speed: 0.45, stamina: 0.20, yield: 0.15 } },
    { tier: 4, gens: 15, name: 'Crested',      glyph: '👑',
      blurb: 'Unmistakable at a distance. Crowds gather for it.',
      bonus: { grace: 0.40, renown: 0.45 } },
    { tier: 5, gens: 21, name: 'Skyborn',      glyph: '🌤️',
      blurb: 'Something in the line finally answers the sky.',
      bonus: { strength: 0.30, wits: 0.30, speed: 0.30, grace: 0.30, renown: 0.55, insight: 0.40, yield: 0.20 } }
  ];

  /* ---------------------------------------------------------------------
   * The island grows outward in terraces. Each one is more ground, more room
   * for people, and a fresh band of unknown things to walk up to and examine.
   * ------------------------------------------------------------------- */
  const RINGS = [
    { i: 0, name: 'The First Shelf', plots: 16, radius: 1.00, hutCap: 10, wood: 0,    coin: 0,     insight: 0 },
    { i: 1, name: 'The Low Terrace', plots: 24, radius: 1.20, hutCap: 18, wood: 190,  coin: 2600,  insight: 14 },
    { i: 2, name: 'The Wind Shelf',  plots: 30, radius: 1.38, hutCap: 26, wood: 540,  coin: 13000, insight: 44 },
    { i: 3, name: 'The Far Reach',   plots: 36, radius: 1.54, hutCap: 36, wood: 1500, coin: 52000, insight: 120 }
  ];

  /* Unknown things on the ground. Walking up and examining one is the only
   * source of Insight, and several of them permanently change the island. */
  const FEATURES = [
    { id: 'spring',    ring: 0, name: 'a cold spring',        glyph: '💧', insight: 5,
      blurb: 'Water, coming up out of nothing. Your plots will dry out more slowly now.',
      effect: 'thirst' },
    { id: 'clay',      ring: 0, name: 'a seam of red clay',   glyph: '🧱', insight: 5, mat: 'clay',
      blurb: 'Wet, heavy, and it holds a shape.' },
    { id: 'deadwood',  ring: 0, name: 'a fallen giant',       glyph: '🪵', insight: 4, wood: 45,
      blurb: 'Dead a long time. Dry enough to work.' },
    { id: 'fibre',     ring: 0, name: 'a stand of cordgrass', glyph: '🌾', insight: 4, mat: 'fibre',
      blurb: 'Tough enough to twist into rope.' },
    { id: 'bones',     ring: 1, name: 'a scatter of bones',   glyph: '🦴', insight: 5, mat: 'bone',
      blurb: 'Something enormous died here before you existed. It is oddly steadying to know that.' },
    { id: 'resin',     ring: 1, name: 'a weeping pine',       glyph: '🟠', insight: 4, mat: 'resin',
      blurb: 'It bleeds slow gold down its own bark.' },
    { id: 'glass',     ring: 1, name: 'a lightning scar',     glyph: '🔷', insight: 6, mat: 'glass',
      blurb: 'The strike fused the sand into something that holds light.' },
    { id: 'loam',      ring: 1, name: 'black loam',           glyph: '🟫', insight: 5,
      blurb: 'Soil that grew before you did. Everything comes up faster in it.',
      effect: 'growth' },
    { id: 'cave',      ring: 2, name: 'a wind-hollowed cave', glyph: '🕳️', insight: 9,
      blurb: 'Cold, dry, and out of the weather. Your granary keeps better.',
      effect: 'granary' },
    { id: 'ore',       ring: 2, name: 'a vein of skymetal',   glyph: '⛏️', insight: 9, mat: 'metal',
      blurb: 'It came down from somewhere and stayed.' },
    { id: 'grove',     ring: 2, name: 'a grove of old trees', glyph: '🌳', insight: 8, wood: 260,
      blurb: 'Older than the village. They will be sorry to see it go.' },
    { id: 'monolith',  ring: 2, name: 'a leaning monolith',   glyph: '🗿', insight: 14,
      blurb: 'Carved by nobody you have met. The village will not go near it, and they pray harder.',
      effect: 'awe' },
    { id: 'font',      ring: 3, name: 'a still black font',   glyph: '🌑', insight: 22,
      blurb: 'It does not reflect you. Prayer collects faster here, and nobody can say why.',
      effect: 'prayer' },
    { id: 'seedvault', ring: 3, name: 'a sealed seed vault',  glyph: '🌸', insight: 18, mat: 'glass',
      blurb: 'Somebody buried this against a disaster that evidently arrived.',
      effect: 'seeds' },
    { id: 'nest',      ring: 3, name: 'an abandoned nest',    glyph: '🥚', insight: 20,
      blurb: 'Big enough to sleep in. Whatever laid here was of your creature\'s line.',
      effect: 'lineage' }
  ];

  /* `buy` is what the market will sell you, priced so that buying materials
   * and crafting them is worth only a thin margin. The real money is in the
   * two it will not sell — storm glass and skymetal come only out of ground
   * you examine and the Listening, which is what keeps the mini-games the
   * actual currency engine rather than a button that prints coin. */
  const MATERIALS = {
    fibre: { id: 'fibre', name: 'Cordgrass',  glyph: '🌾', buy: 110 },
    clay:  { id: 'clay',  name: 'Red clay',   glyph: '🧱', buy: 110 },
    resin: { id: 'resin', name: 'Pine resin', glyph: '🟠', buy: 300 },
    bone:  { id: 'bone',  name: 'Old bone',   glyph: '🦴', buy: 300 },
    glass: { id: 'glass', name: 'Storm glass',glyph: '🔷', buy: 0 },
    metal: { id: 'metal', name: 'Skymetal',   glyph: '⛏️', buy: 0 }
  };
  const MATERIAL_LIST = Object.values(MATERIALS);

  /* The bench. You do not get a recipe list — you put two things together and
   * find out. Discovering a pairing is worth Insight; making it again is worth
   * coin, which is the point. */
  const RECIPES = [
    { id: 'rope',      a: 'fibre', b: 'fibre', name: 'Twisted rope',   glyph: '🪢', coin: 240,  insight: 4 },
    { id: 'brick',     a: 'clay',  b: 'fibre', name: 'Fired brick',    glyph: '🧱', coin: 260,  insight: 5, wood: 8 },
    { id: 'cordage',   a: 'resin', b: 'fibre', name: 'Waxed cordage',  glyph: '🧵', coin: 420,  insight: 7 },
    { id: 'pitch',     a: 'resin', b: 'clay',  name: 'Sealing pitch',  glyph: '🫙', coin: 430,  insight: 6 },
    { id: 'charm',     a: 'bone',  b: 'fibre', name: 'Knuckle charm',  glyph: '🧿', coin: 470,  insight: 8,  faith: 1 },
    { id: 'scrimshaw', a: 'bone',  b: 'clay',  name: 'Scrimshaw jar',  glyph: '🏺', coin: 520,  insight: 9 },
    { id: 'ossuary',   a: 'bone',  b: 'resin', name: 'Sealed ossuary', glyph: '⚰️', coin: 780,  insight: 10 },
    { id: 'beads',     a: 'glass', b: 'clay',  name: 'Glass beads',    glyph: '📿', coin: 820,  insight: 11, faith: 1 },
    { id: 'lens',      a: 'glass', b: 'resin', name: 'Burning lens',   glyph: '🔍', coin: 900,  insight: 12 },
    { id: 'net',       a: 'glass', b: 'fibre', name: 'Spun-glass net', glyph: '🕸️', coin: 760,  insight: 10 },
    { id: 'idol',      a: 'bone',  b: 'glass', name: 'Watching idol',  glyph: '🗿', coin: 1400, insight: 16 },
    { id: 'kiln',      a: 'clay',  b: 'metal', name: 'Kiln plate',     glyph: '🍳', coin: 1600, insight: 15, wood: 24 },
    { id: 'chime',     a: 'metal', b: 'bone',  name: 'Wind chime',     glyph: '🎐', coin: 1800, insight: 14, faith: 1 },
    { id: 'harness',   a: 'metal', b: 'fibre', name: 'Beast harness',  glyph: '🦯', coin: 1500, insight: 13 },
    { id: 'reliquary', a: 'metal', b: 'resin', name: 'Reliquary',      glyph: '⚱️', coin: 2200, insight: 20, faith: 2 },
    { id: 'blade',     a: 'metal', b: 'glass', name: 'Skymetal blade', glyph: '🗡️', coin: 2600, insight: 22 }
  ];

  /* Insight buys permanent changes to you, not to the creature. */
  const NEURONS = [
    { id: 'attention', name: 'Wider Attention', cost: 6,  req: [],
      desc: '+10 maximum Focus.', icon: '🕯️' },
    { id: 'patience',  name: 'Patient Hand',    cost: 14, req: ['attention'],
      desc: 'Praise and striking teach 30% harder.', icon: '✋' },
    { id: 'stamina',   name: 'Steady Nerve',    cost: 22, req: ['attention'],
      desc: 'Focus returns 40% faster.', icon: '⏳' },
    { id: 'husbandry', name: 'Husbandry',       cost: 26, req: ['patience'],
      desc: 'Crops yield 25% more in your hands and the creature\'s.', icon: '🌾' },
    { id: 'memory',    name: 'Deep Memory',     cost: 34, req: ['patience'],
      desc: 'Behaviours ingrain twice as fast, and the line forgets half as much.', icon: '🧠' },
    { id: 'sight',     name: 'Long Sight',      cost: 30, req: ['listening'],
      desc: 'Examining costs no Focus, and yields 40% more Insight.', icon: '👁️' },
    { id: 'listening', name: 'The Listening',   cost: 18, req: ['attention'],
      desc: 'Unlocks the Listening — sweep the island for what it is hiding.', icon: '🔊' },
    { id: 'bench',     name: 'The Bench',       cost: 22, req: ['husbandry'],
      desc: 'Unlocks the workbench, where two materials become something worth selling.', icon: '⚒️' },
    { id: 'craftsman', name: 'Practised Hands', cost: 46, req: ['bench'],
      desc: 'Crafted goods sell for 60% more.', icon: '🔨' },
    { id: 'devotion',  name: 'Devotion',        cost: 52, req: ['memory'],
      desc: 'Your standing accrues 30% faster.', icon: '🙏' },
    { id: 'lineage',   name: 'The Long Line',   cost: 60, req: ['memory'],
      desc: 'Offspring inherit far more of what you ingrained, and live 15% longer.', icon: '🧬' },
    { id: 'frontier',  name: 'The Frontier',    cost: 40, req: ['sight'],
      desc: 'Terraces cost a third less to raise.', icon: '🧭' }
  ];

  const GEN_HINTS = [
    'Learning dies with the animal. Only what you ingrained gets passed on.',
    'An act has to be well known before it can be ingrained at all — teach first, then drill.',
    'Whelps learn fastest and are useless. Elders are the reverse. Plan around it.'
  ];

  SW.content = {
    TICKS_PER_DAY, CROPS, CROP_LIST, RANKS, MIRACLES, MIRACLE_LIST,
    LINEAGES, LINEAGE_LIST, ACTS, ACT_LIST, TRAINABLE, LEASHES, LEASH_LIST,
    SHRINE_TIERS, HUT_COST, PLOT_COST, FESTIVALS, RIVALS, BARBS, FEATS, HATCH_HINTS,
    LIFESPAN, AGES, EVOLUTIONS, RINGS, FEATURES, MATERIALS, MATERIAL_LIST,
    RECIPES, NEURONS, GEN_HINTS
  };
})(window.SW = window.SW || {});
