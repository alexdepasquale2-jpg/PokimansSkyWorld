/* Primal Isle — every tunable table for the survival half of the game.
 * The monetisation tables live in store.js, deliberately separate: the survival
 * numbers are the thing being sold, and it should be possible to read them
 * without the price tags in the way.
 */
(function (ISLE) {
  'use strict';

  const WORLD = 2600;            // world is WORLD x WORLD units
  const HATCH_GROWTH = 0.06;     // you always start here
  const ADULT = 1.0;

  /* Stat scale from growth. A hatchling is not a small adult — it is nearly
   * helpless, which is what makes the growth grind (and the serum that skips
   * it) matter. */
  function scaleOf(growth) { return 0.28 + 0.72 * Math.pow(growth, 1.15); }
  /* Radius scales more gently than stats so a hatchling is still clickable. */
  function sizeScale(growth) { return 0.34 + 0.66 * Math.pow(growth, 0.85); }

  /* --- species ---------------------------------------------------------
   * dmg/hp/spd are adult values; everything is multiplied by scaleOf(growth).
   * `tier` is the rough food-chain rung, used by the AI to decide who is
   * worth attacking and who is worth running from.
   */
  const SPECIES = {
    velox: {
      id: 'velox', name: 'Velox', tag: 'Pack raptor', diet: 'carnivore',
      hp: 260, dmg: 22, biteCd: 0.75, spd: 132, sprint: 1.62, stam: 100,
      stamDrain: 12, stamRegen: 9, growthRate: 1.15, size: 15, tier: 2,
      night: 0.75, swim: 0.9, bulk: 0.55, color: '#b6764a', color2: '#5e3a24',
      premium: false, packBonus: 0.18,
      blurb: 'Fast, fragile, and pointless alone. Three of them will take down anything.'
    },
    fernback: {
      id: 'fernback', name: 'Fernback', tag: 'Herd grazer', diet: 'herbivore',
      hp: 620, dmg: 26, biteCd: 1.3, spd: 108, sprint: 1.52, stam: 130,
      stamDrain: 9, stamRegen: 11, growthRate: 1.0, size: 20, tier: 2,
      night: 0.45, swim: 1.0, bulk: 0.8, color: '#7d9a5a', color2: '#3f5230',
      premium: false, packBonus: 0.08,
      blurb: 'Eats anything green, outruns most things, wins no fights. The honest starter.'
    },
    gorehorn: {
      id: 'gorehorn', name: 'Gorehorn', tag: 'Bulwark', diet: 'herbivore',
      hp: 900, dmg: 58, biteCd: 1.5, spd: 92, sprint: 1.4, stam: 115,
      stamDrain: 10, stamRegen: 9, growthRate: 0.86, size: 22, tier: 3,
      night: 0.4, swim: 0.75, bulk: 1.0, color: '#9a7f52', color2: '#4a3a22',
      premium: false, packBonus: 0.12, knockback: 46,
      blurb: 'Slow to grow, hard to kill, and it throws whatever it hits. Grown ones are a wall.'
    },
    marshjaw: {
      id: 'marshjaw', name: 'Marshjaw', tag: 'River ambusher', diet: 'carnivore',
      hp: 780, dmg: 52, biteCd: 1.15, spd: 104, sprint: 1.48, stam: 120,
      stamDrain: 10, stamRegen: 10, growthRate: 0.82, size: 24, tier: 3,
      night: 0.65, swim: 1.45, bulk: 0.85, color: '#5f7f80', color2: '#2c4344',
      premium: false, packBonus: 0.05, fishes: true,
      blurb: 'Owns the water and struggles out of it. Fish keep it fed while it grows.'
    },

    // --- the paid roster. Not sidegrades. ---
    duskclaw: {
      id: 'duskclaw', name: 'Duskclaw', tag: 'PREMIUM · raptor', diet: 'carnivore',
      hp: 345, dmg: 31, biteCd: 0.68, spd: 149, sprint: 1.76, stam: 118,
      stamDrain: 9.5, stamRegen: 12, growthRate: 1.42, size: 16, tier: 3,
      night: 1.0, swim: 1.05, bulk: 0.6, color: '#7a5fb0', color2: '#33244f',
      premium: true, packBonus: 0.24,
      blurb: 'A Velox with 33% more health, 41% more damage, better night sight and a faster grow curve.'
    },
    tyrant: {
      id: 'tyrant', name: 'Tyrant Prime', tag: 'PREMIUM · apex', diet: 'carnivore',
      hp: 1250, dmg: 96, biteCd: 1.25, spd: 118, sprint: 1.58, stam: 140,
      stamDrain: 8, stamRegen: 11, growthRate: 1.3, size: 27, tier: 5,
      night: 0.8, swim: 0.9, bulk: 1.0, color: '#a2453c', color2: '#4a1c19',
      premium: true, packBonus: 0.1, knockback: 38,
      blurb: 'Top of the chain and it grows faster than the animals it eats. There is no free counter.'
    },
    ivory: {
      id: 'ivory', name: 'Ivory Titan', tag: 'PREMIUM · titan', diet: 'herbivore',
      hp: 2450, dmg: 74, biteCd: 1.9, spd: 84, sprint: 1.26, stam: 160,
      stamDrain: 6, stamRegen: 8, growthRate: 1.12, size: 34, tier: 5,
      night: 0.4, swim: 0.7, bulk: 1.35, color: '#cdc3ae', color2: '#6a6153',
      premium: true, packBonus: 0.06, knockback: 70,
      blurb: 'Two and a half thousand health on a herbivore. Grown, it simply cannot be killed by free players.'
    }
  };

  const FREE_SPECIES = ['velox', 'fernback', 'gorehorn', 'marshjaw'];
  const PREMIUM_SPECIES = ['duskclaw', 'tyrant', 'ivory'];

  /* --- biomes ----------------------------------------------------------
   * `cover` hides you from distant eyes; `slow` is a movement multiplier.
   */
  const BIOMES = {
    ocean:    { id: 'ocean',    name: 'Open sea',  water: 'salt',  slow: 0.5,  cover: 0.0, sand: '#1c3b52' },
    shallow:  { id: 'shallow',  name: 'Shallows',  water: 'salt',  slow: 0.72, cover: 0.1, sand: '#2f6079' },
    beach:    { id: 'beach',    name: 'Beach',     water: null,    slow: 0.94, cover: 0.05, sand: '#c8b78a' },
    plains:   { id: 'plains',   name: 'Plains',    water: null,    slow: 1.0,  cover: 0.15, sand: '#8ba05c' },
    forest:   { id: 'forest',   name: 'Forest',    water: null,    slow: 0.9,  cover: 0.62, sand: '#4d6b3f' },
    swamp:    { id: 'swamp',    name: 'Marsh',     water: 'fresh', slow: 0.76, cover: 0.45, sand: '#5c6b46' },
    river:    { id: 'river',    name: 'River',     water: 'fresh', slow: 0.68, cover: 0.1, sand: '#3f7a86' },
    lake:     { id: 'lake',     name: 'Lake',      water: 'fresh', slow: 0.62, cover: 0.1, sand: '#356a7d' },
    highland: { id: 'highland', name: 'Highlands', water: null,    slow: 0.86, cover: 0.3, sand: '#7d7f63' }
  };

  /* --- food ------------------------------------------------------------
   * `quality` is the important number: as you grow, low-quality food fills
   * less and less, so a grown herbivore has to walk to the good stuff. It is
   * also the pressure the Growth Serum exists to relieve.
   */
  const PLANTS = {
    fern:      { id: 'fern',      name: 'Fern',        food: 26, quality: 0.35, regrow: 65,  biomes: ['plains', 'forest'], color: '#6f8f4a' },
    cycad:     { id: 'cycad',     name: 'Cycad',       food: 44, quality: 0.62, regrow: 105, biomes: ['forest'], color: '#4f7a3c' },
    marshweed: { id: 'marshweed', name: 'Marshweed',   food: 34, quality: 0.5,  regrow: 78,  biomes: ['swamp'], color: '#7d8f4e' },
    kelp:      { id: 'kelp',      name: 'Kelp',        food: 30, quality: 0.45, regrow: 70,  biomes: ['beach', 'shallow'], color: '#4a7a63' },
    ironleaf:  { id: 'ironleaf',  name: 'Ironleaf',    food: 72, quality: 1.0,  regrow: 190, biomes: ['highland'], color: '#8fae5f' },
    palmcrown: { id: 'palmcrown', name: 'Palm crown',  food: 58, quality: 0.85, regrow: 150, biomes: ['forest', 'plains'], color: '#5d9145' }
  };

  const CRITTERS = {
    scurrier: { id: 'scurrier', name: 'Scurrier', food: 22, quality: 0.4, respawn: 55, biomes: ['plains', 'forest', 'beach'] },
    fish:     { id: 'fish',     name: 'Fish',     food: 30, quality: 0.55, respawn: 40, biomes: ['river', 'lake', 'shallow'] },
    egg:      { id: 'egg',      name: 'Nest egg', food: 40, quality: 0.7, respawn: 240, biomes: ['forest', 'swamp'] }
  };

  /* Meat off a body. Bigger animal, more meals — and a fresh kill is worth
   * far more than a rotten one, which is what makes stealing kills a tactic. */
  const CARCASS_ROT = 150;       // seconds until worthless
  const MEAT_QUALITY = 1.0;

  /* --- needs -----------------------------------------------------------
   * Drains are per second at adult size, scaled by bulk and by size.
   */
  const NEEDS = {
    hungerDrain: 0.155,
    thirstDrain: 0.29,
    growthPerSec: 0.00042,       // adult from hatch in ~37 min of perfect play
    growthHunger: 35,            // both needs must be above this to grow
    growthThirst: 35,
    starveDps: 1.1,
    thirstDps: 1.5,
    healPerSec: 0.9,             // when fed, watered and out of combat
    healHunger: 60,
    bleedDps: 0.85,              // per stack
    bleedDur: 26,
    boneSlow: 0.62,
    boneHeal: 95,                // seconds for a break to mend
    saltSick: 22                 // seconds of nausea from drinking the sea
  };

  /* --- calls -----------------------------------------------------------
   * Every call is a trade: it does something useful and it tells the map
   * where you are.
   */
  const CALLS = {
    broadcast: { id: 'broadcast', name: 'Broadcast', icon: '📣', range: 900, cd: 6,
      blurb: 'Says your species and size to everything in earshot. Herds form on it. So do ambushes.' },
    distress: { id: 'distress', name: 'Distress', icon: '🆘', range: 1250, cd: 9,
      blurb: 'Calls your group. Also rings the dinner bell for anything hungry.' },
    group: { id: 'group', name: 'Group call', icon: '🤝', range: 520, cd: 12,
      blurb: 'Offers to group with same-species nearby. Grouped animals share a damage bonus.' }
  };

  /* --- server population ----------------------------------------------- */
  const SERVER_CAP = 34;         // "other players" alive at once
  const NAMES = [
    'xX_ApexLord_Xx', 'SwampDaddy', 'Tyler', 'notaKOS', 'GrowthGrinder', 'BigTeeth42',
    'ScaleQueen', 'mudcrab', 'RaptorJesus', 'HerdMomma', 'silent', 'CretaceousCarl',
    'p2wandproud', 'FeatheredFury', 'stompstompstomp', 'Nibbles', 'AmberAddict',
    'JurassicJan', 'lowtierhero', 'TheRealRex', 'kelpfarmer', 'NightPounce',
    'BasedBrontosaur', 'toothmuncher', 'Vex', 'quietwaters', 'GnashGnash',
    'FossilFuel', 'clawedandconfused', 'MegaWhale99', 'ScuteBoy', 'Threnody',
    'RiverRat', 'boneappetit', 'IsleVeteran07', 'freshspawn', 'GrindNeverStops',
    'DiamondJaws', 'wallet_warrior', 'Pebble', 'ThunderThighs', 'Kai'
  ];

  /* Some of the server is paying. This is the number that makes the whole
   * design legible: a third of the lobby has advantages you do not. */
  const AI_WHALE_RATE = 0.32;
  const AI_KOS_RATE = 0.45;      // proportion who attack anything they can beat

  /* Nobody chases a mouthful. Anything under this is beneath the notice of a
   * predator that is not actually starving, which is the only reason a
   * hatchling gets to exist at all. */
  const IGNORE_GROWTH = 0.18;
  const SPAWN_PROTECT = 10;      // seconds of being hard to notice, after hatching

  /* --- day/night -------------------------------------------------------- */
  const DAY_LENGTH = 420;        // seconds for a full cycle
  const NIGHT_VISION_FLOOR = 0.34;

  /* --- damage / combat -------------------------------------------------- */
  const COMBAT = {
    biteReach: 1.35,             // multiple of combined radii
    biteArc: 1.15,               // radians, half-angle
    biteStam: 12,
    sprintTax: 1.0,
    bleedChance: 0.42,
    boneChance: 0.09,
    packRange: 260,
    combatMemory: 7              // seconds you count as "in combat"
  };

  /* Growth is the score, so growth is what everything is priced against. */
  function growthLabel(g) {
    if (g < 0.14) return 'Hatchling';
    if (g < 0.3) return 'Juvenile';
    if (g < 0.55) return 'Sub-adult';
    if (g < 0.85) return 'Adult';
    return 'Elder';
  }

  ISLE.content = {
    WORLD, HATCH_GROWTH, ADULT, scaleOf, sizeScale,
    SPECIES, FREE_SPECIES, PREMIUM_SPECIES, BIOMES, PLANTS, CRITTERS,
    CARCASS_ROT, MEAT_QUALITY, NEEDS, CALLS, SERVER_CAP, NAMES, IGNORE_GROWTH, SPAWN_PROTECT,
    AI_WHALE_RATE, AI_KOS_RATE, DAY_LENGTH, NIGHT_VISION_FLOOR, COMBAT, growthLabel
  };
})(window.ISLE = window.ISLE || {});
