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
    { tier: 1, name: 'Cairn',             wood: 12,  coin: 60,   grandeur: 4,  rank: 0 },
    { tier: 2, name: 'Standing Ring',     wood: 40,  coin: 320,  grandeur: 14, rank: 1 },
    { tier: 3, name: 'Sky Altar',         wood: 110, coin: 1400, grandeur: 38, rank: 2 },
    { tier: 4, name: 'Cathedral of Cloud',wood: 260, coin: 5200, grandeur: 90, rank: 3 },
    { tier: 5, name: 'The Reach Itself',  wood: 600, coin: 18000,grandeur: 210,rank: 4 }
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
    { id: 'day_10',         name: 'Ten Days',            desc: 'Survive ten days.',                         renown: 30,   check: g => g.day >= 10 },
    { id: 'day_40',         name: 'Forty Days',          desc: 'Survive forty days.',                       renown: 200,  check: g => g.day >= 40 }
  ];

  const HATCH_HINTS = [
    'Whatever you praise, it will do again. Whatever you strike it for, it will hide from you.',
    'A creature taught to water your plots is worth more than any miracle you can buy.',
    'Love and terror both climb the Register. They just climb it differently.'
  ];

  SW.content = {
    TICKS_PER_DAY, CROPS, CROP_LIST, RANKS, MIRACLES, MIRACLE_LIST,
    LINEAGES, LINEAGE_LIST, ACTS, ACT_LIST, TRAINABLE, LEASHES, LEASH_LIST,
    SHRINE_TIERS, HUT_COST, PLOT_COST, FESTIVALS, RIVALS, BARBS, FEATS, HATCH_HINTS
  };
})(window.SW = window.SW || {});
