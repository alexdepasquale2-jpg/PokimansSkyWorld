/* Skyward Reach — content tables for the second layer of systems.
 * Kept separate from content.js purely for size. No logic here either.
 */
(function (SW) {
  'use strict';
  const C = SW.content;

  /* 1. SEASONS ---------------------------------------------------------- */
  const SEASON_LEN = 12;   // days each
  const SEASONS = [
    { id: 'greening', name: 'Greening', glyph: '🌱', tint: '#8fd18a',
      growth: 1.15, thirst: 0.95, feed: 1.0, faith: 1.0,
      blurb: 'Everything comes up at once. Sow wide.' },
    { id: 'high', name: 'High Sun', glyph: '☀️', tint: '#f0cf72',
      growth: 1.0, thirst: 1.35, feed: 1.0, faith: 1.05,
      blurb: 'Long days, hard ground. Water or lose it.' },
    { id: 'falling', name: 'Falling', glyph: '🍂', tint: '#d99a5f',
      growth: 0.9, thirst: 0.85, feed: 1.25, faith: 1.0,
      blurb: 'Yields are heavy and the market is generous.' },
    { id: 'still', name: 'The Still', glyph: '❄️', tint: '#9fc4e0',
      growth: 0.62, thirst: 0.55, feed: 0.85, faith: 0.9,
      blurb: 'Almost nothing grows. Build, breed, and get through it.' }
  ];

  /* 2. WEATHER ----------------------------------------------------------- */
  const WEATHER = {
    clear:    { id: 'clear',    name: 'Clear',      glyph: '🌤️', weight: 30, growth: 1.0,  thirst: 1.0,  mood: 0,   blurb: 'Nothing in the way.' },
    downpour: { id: 'downpour', name: 'Downpour',   glyph: '🌧️', weight: 14, growth: 1.1,  thirst: 0,    mood: -2,  water: 100, blurb: 'Every plot drinks for free.' },
    drought:  { id: 'drought',  name: 'Dry Wind',   glyph: '🏜️', weight: 11, growth: 0.8,  thirst: 2.0,  mood: -4,  blurb: 'The soil gives up its water twice as fast.' },
    gale:     { id: 'gale',     name: 'Gale',       glyph: '🌪️', weight: 9,  growth: 0.85, thirst: 1.2,  mood: -8,  rot: 1.6, blurb: 'Ripe crops are torn about. Bring them in.' },
    mist:     { id: 'mist',     name: 'Cloud Mist', glyph: '🌫️', weight: 12, growth: 1.05, thirst: 0.5,  mood: 2,   listen: 1.5, blurb: 'Sound carries strangely. The Listening pays more.' },
    swelter:  { id: 'swelter',  name: 'Swelter',    glyph: '🔥', weight: 8,  growth: 1.2,  thirst: 1.8,  mood: -6,  vigor: 0.7, blurb: 'Growth races; the creature wilts.' },
    auroral:  { id: 'auroral',  name: 'Auroral',    glyph: '🌈', weight: 6,  growth: 1.15, thirst: 0.9,  mood: 8,   insight: 1.6, faith: 1.25, blurb: 'The sky is showing off. Insight and faith come easier.' },
    hush:     { id: 'hush',     name: 'The Hush',   glyph: '🌑', weight: 5,  growth: 0.9,  thirst: 0.8,  mood: -3,  awe: 1.5, prayer: 1.4, blurb: 'Nobody speaks above a whisper. Prayer floods in.' }
  };
  const WEATHER_LIST = Object.values(WEATHER);

  /* 3. SOIL -------------------------------------------------------------- */
  const SOIL = {
    max: 100,
    drainPerHarvest: 5,       // each harvest takes it out of the ground
    rotationBonus: 0.22,      // sowing a different crop than last time
    yieldAt: q => 0.55 + (q / 100) * 0.75,   // 0.55x at dead soil, 1.30x at rich
    fallowRecovery: 0.10      // per tick while a plot sits empty
  };
  const FERTILISERS = {
    compost: { id: 'compost', name: 'Compost',      glyph: '🟤', soil: 26, cost: { food: 40 },  blurb: 'Spoiled crop and village waste, turned over.' },
    ash:     { id: 'ash',     name: 'Kiln ash',     glyph: '🌫️', soil: 46, cost: { wood: 20 },  blurb: 'Burnt clean. Harsh, but it works fast. A kiln makes it cheaper still.' },
    bonemeal:{ id: 'bonemeal',name: 'Bone meal',    glyph: '🦴', soil: 70, cost: { mats: { bone: 2 } }, blurb: 'Ground fine. The ground remembers it for a long while.' }
  };
  const FERTILISER_LIST = Object.values(FERTILISERS);

  /* 4. AILMENTS ---------------------------------------------------------- */
  const AILMENTS = {
    bloat:   { id: 'bloat',   name: 'Bloat',      glyph: '🫧', blurb: 'It ate too much, too fast, and now it will not move.',
               cause: 'overfeeding', vigor: -0.35, mood: -0.15, work: 0.55, remedy: 'purgative' },
    rotlung: { id: 'rotlung', name: 'Rot-lung',   glyph: '🫁', blurb: 'Wet air got into it. You can hear it breathing from the shrine.',
               cause: 'damp', vigor: -0.5, mood: -0.25, work: 0.4, remedy: 'steam' },
    sunsick: { id: 'sunsick', name: 'Sun-sick',   glyph: '🥵', blurb: 'It has been out in the swelter too long.',
               cause: 'heat', vigor: -0.45, mood: -0.3, work: 0.5, remedy: 'coolwrap' },
    lameness:{ id: 'lameness',name: 'Lameness',   glyph: '🦴', blurb: 'Something in the foreleg went while it was working.',
               cause: 'overwork', vigor: -0.2, mood: -0.2, work: 0.35, remedy: 'splint' },
    despair: { id: 'despair', name: 'Despair',    glyph: '🌧️', blurb: 'You struck it too many times. It has stopped trying.',
               cause: 'cruelty', vigor: -0.15, mood: -0.5, work: 0.45, remedy: 'kindness' }
  };
  const AILMENT_LIST = Object.values(AILMENTS);
  const REMEDIES = {
    purgative: { id: 'purgative', name: 'Purgative mash', glyph: '🥣', cost: { food: 30 } },
    steam:     { id: 'steam',     name: 'Steam tent',     glyph: '♨️', cost: { wood: 30 } },
    coolwrap:  { id: 'coolwrap',  name: 'Cool wrap',      glyph: '🧊', cost: { mats: { fibre: 2 } } },
    splint:    { id: 'splint',    name: 'Splint',         glyph: '🦯', cost: { wood: 18, mats: { fibre: 1 } } },
    kindness:  { id: 'kindness',  name: 'Nothing but time', glyph: '💗', cost: { prayer: 30 } }
  };

  /* 5. VILLAGERS & ROLES ------------------------------------------------- */
  const ROLES = {
    idle:      { id: 'idle',      name: 'Unassigned', glyph: '🧍', blurb: 'Eats, prays, does no particular job.' },
    farmhand:  { id: 'farmhand',  name: 'Farmhand',   glyph: '🌾', blurb: 'Waters a plot now and then without being asked.' },
    mason:     { id: 'mason',     name: 'Mason',      glyph: '🧱', blurb: 'Building and terrace costs drop.' },
    herbalist: { id: 'herbalist', name: 'Herbalist',  glyph: '🌿', blurb: 'The creature falls ill less, and recovers faster.' },
    acolyte:   { id: 'acolyte',   name: 'Acolyte',    glyph: '🕯️', blurb: 'Prayer and faith accrue faster.' },
    scout:     { id: 'scout',     name: 'Scout',      glyph: '🧭', blurb: 'Finds materials, and sometimes marks something unknown.' },
    trader:    { id: 'trader',    name: 'Trader',     glyph: '⚖️', blurb: 'Better prices at market and with caravans.' }
  };
  const ROLE_LIST = Object.values(ROLES);
  const VILLAGER_NAMES = [
    'Bel', 'Corrin', 'Dala', 'Emmer', 'Fenn', 'Gray', 'Halt', 'Isk', 'Jorun', 'Kest',
    'Lune', 'Marrow', 'Nen', 'Ostry', 'Pell', 'Quill', 'Rook', 'Sable', 'Tem', 'Undin',
    'Vess', 'Wren', 'Yarrow', 'Zeb', 'Aud', 'Brill', 'Cass', 'Dorn', 'Elm', 'Fay'
  ];
  const VILLAGER_TRAITS = [
    { id: 'steady',  name: 'Steady',   glyph: '🪨', blurb: 'Never leaves, whatever happens.' },
    { id: 'quick',   name: 'Quick',    glyph: '⚡', blurb: 'Does the job half again as well.' },
    { id: 'devout',  name: 'Devout',   glyph: '🙏', blurb: 'Prays for two.' },
    { id: 'sour',    name: 'Sour',     glyph: '🍋', blurb: 'Spreads unrest. Useful nowhere.' },
    { id: 'hungry',  name: 'Hungry',   glyph: '🍽️', blurb: 'Eats double.' },
    { id: 'clever',  name: 'Clever',   glyph: '💡', blurb: 'Turns up insight now and then.' }
  ];

  /* 6. BUILDINGS --------------------------------------------------------- */
  const BUILDINGS = {
    well:      { id: 'well',      name: 'Well',        glyph: '🪣', ring: 0, wood: 40,  coin: 300,   mats: {},
                 blurb: 'Plots dry out a quarter slower.', tiers: 3, effect: 'water' },
    granary:   { id: 'granary',   name: 'Granary',     glyph: '🏚️', ring: 0, wood: 60,  coin: 500,   mats: {},
                 blurb: 'Food spoils less and the village eats more evenly.', tiers: 3, effect: 'food' },
    workshop:  { id: 'workshop',  name: 'Workshop',    glyph: '⚒️', ring: 1, wood: 140, coin: 2400,  mats: { clay: 3 },
                 blurb: 'Bench work costs less focus and sells for more.', tiers: 3, effect: 'craft' },
    watchtower:{ id: 'watchtower',name: 'Watchtower',  glyph: '🗼', ring: 1, wood: 190, coin: 3200,  mats: { fibre: 3 },
                 blurb: 'You see further. Unknown ground reveals itself over time.', tiers: 3, effect: 'scout' },
    kiln:      { id: 'kiln',      name: 'Kiln',        glyph: '🔥', ring: 1, wood: 160, coin: 2800,  mats: { clay: 4 },
                 blurb: 'Makes kiln ash, and fires bricks cheaply.', tiers: 3, effect: 'kiln' },
    infirmary: { id: 'infirmary', name: 'Beast House', glyph: '🏡', ring: 1, wood: 210, coin: 3600,  mats: { fibre: 4 },
                 blurb: 'The creature sleeps warm. Illness is rarer and shorter.', tiers: 3, effect: 'care' },
    dock:      { id: 'dock',      name: 'Cloud Dock',  glyph: '⛵', ring: 2, wood: 420, coin: 11000, mats: { metal: 2 },
                 blurb: 'Caravans call more often and carry better stock.', tiers: 3, effect: 'trade' },
    arena:     { id: 'arena',     name: 'Trial Ring',  glyph: '🏟️', ring: 2, wood: 520, coin: 15000, mats: { bone: 3 },
                 blurb: 'Somewhere for your beast to be measured against theirs.', tiers: 3, effect: 'arena' }
  };
  const BUILDING_LIST = Object.values(BUILDINGS);

  /* 7. CARAVANS & TRADE -------------------------------------------------- */
  const MERCHANTS = [
    { id: 'ossuary', name: 'The Ossuary Cart', glyph: '🦴', tone: 'grim',
      buys: ['duskberry', 'aetherbloom'], sells: ['bone', 'glass'],
      blurb: 'Sells what it digs up. Does not explain where.' },
    { id: 'greenhand', name: 'Greenhand & Daughters', glyph: '🌿', tone: 'warm',
      buys: ['sunwheat', 'glimmerroot'], sells: ['fibre', 'resin'],
      blurb: 'Four generations of seed factors. They like a full granary.' },
    { id: 'skyforge', name: 'The Skyforge Barge', glyph: '⚙️', tone: 'blunt',
      buys: ['aetherbloom'], sells: ['metal', 'glass'],
      blurb: 'Comes rarely, carries the only skymetal you can buy.' },
    { id: 'pilgrims', name: 'The Pilgrim Train', glyph: '🕯️', tone: 'devout',
      buys: ['glimmerroot', 'duskberry'], sells: ['clay', 'fibre'],
      blurb: 'They are not really here to trade. They came to look at your shrine.' }
  ];
  const CONTRACT_KINDS = [
    { id: 'deliver', name: 'Deliver' },
    { id: 'craft',   name: 'Supply' },
    { id: 'faith',   name: 'Impress' }
  ];

  /* 8. RELICS ------------------------------------------------------------ */
  const RELICS = {
    sunstone:   { id: 'sunstone',   name: 'Sunstone',        glyph: '🟡', rank: 1, effect: 'growth',  power: 0.14, blurb: 'Warm to the touch, always. Crops come on faster.' },
    rainpearl:  { id: 'rainpearl',  name: 'Rain Pearl',      glyph: '🔵', rank: 1, effect: 'thirst',  power: 0.20, blurb: 'The soil around it stays dark.' },
    boneflute:  { id: 'boneflute',  name: 'Bone Flute',      glyph: '🎼', rank: 1, effect: 'bond',    power: 0.9,  blurb: 'The creature comes when it hears this.' },
    graveltooth:{ id: 'graveltooth',name: 'Gravel Tooth',    glyph: '🦷', rank: 2, effect: 'yield',   power: 0.16, blurb: 'Chewed by something enormous, a long time ago.' },
    hushbell:   { id: 'hushbell',   name: 'Hush Bell',       glyph: '🔔', rank: 2, effect: 'prayer',  power: 0.25, blurb: 'It has no clapper and it rings anyway.' },
    stormglass: { id: 'stormglass', name: 'Storm Lens',      glyph: '🔮', rank: 2, effect: 'insight', power: 0.30, blurb: 'Hold it up and the unknown looks nearer.' },
    ironcollar: { id: 'ironcollar', name: 'Iron Collar',     glyph: '⛓️', rank: 2, effect: 'work',    power: 0.20, blurb: 'It works harder wearing this. It also likes you less.' },
    seedark:    { id: 'seedark',    name: 'Seed Ark',        glyph: '🧬', rank: 3, effect: 'herit',   power: 0.25, blurb: 'The line carries further through this.' },
    goldleaf:   { id: 'goldleaf',   name: 'Gold Leaf',       glyph: '🍃', rank: 3, effect: 'coin',    power: 0.25, blurb: 'Everything you sell is looked at more kindly.' },
    kingscrest: { id: 'kingscrest', name: "King's Crest",    glyph: '👑', rank: 3, effect: 'renown',  power: 0.22, blurb: 'Worn by somebody who mattered. Now by you.' },
    quietstone: { id: 'quietstone', name: 'Quiet Stone',     glyph: '🪨', rank: 3, effect: 'unrest',  power: 0.40, blurb: 'People settle near it and stop arguing.' },
    longeye:    { id: 'longeye',    name: 'Long Eye',        glyph: '👁️', rank: 4, effect: 'focus',   power: 0.30, blurb: 'You get more done in a day than you should.' },
    heartwood:  { id: 'heartwood',  name: 'Heartwood Core',  glyph: '🪵', rank: 4, effect: 'life',    power: 0.25, blurb: 'The creature lives noticeably longer.' },
    skyanchor:  { id: 'skyanchor',  name: 'Sky Anchor',      glyph: '⚓', rank: 4, effect: 'all',     power: 0.10, blurb: 'The island stops drifting. Everything steadies.' }
  };
  const RELIC_LIST = Object.values(RELICS);

  /* 9. TECHNIQUES -------------------------------------------------------- */
  const TECHNIQUES = {
    sprint:   { id: 'sprint',   name: 'Sprint',        glyph: '💨', reps: 25, stat: 'cunning', blurb: 'Crosses the island faster. More chores per day.' },
    haul:     { id: 'haul',     name: 'Double Haul',   glyph: '🎒', reps: 30, stat: 'strength', blurb: 'Brings back two loads where it brought one.' },
    dig:      { id: 'dig',      name: 'Deep Dig',      glyph: '🕳️', reps: 28, stat: 'strength', blurb: 'Turns up materials while foraging.' },
    sing:     { id: 'sing',     name: 'Sing',          glyph: '🎵', reps: 22, stat: 'grace',   blurb: 'Villagers stop what they are doing. Faith rises.' },
    graze_x:  { id: 'graze_x',  name: 'Restraint',     glyph: '🚫', reps: 35, stat: 'cunning', blurb: 'It has learned not to eat your field. Mostly.' },
    nightwork:{ id: 'nightwork',name: 'Night Work',    glyph: '🌙', reps: 32, stat: 'strength', blurb: 'It keeps working after dark.' },
    sense:    { id: 'sense',    name: 'Sense',         glyph: '👃', reps: 26, stat: 'cunning', blurb: 'It finds unknown ground for you.' },
    guard:    { id: 'guard',    name: 'Guard',         glyph: '🛡️', reps: 30, stat: 'strength', blurb: 'Rivals think twice about raiding you.' },
    show:     { id: 'show',     name: 'Showmanship',   glyph: '🎪', reps: 34, stat: 'grace',   blurb: 'Performances and trials both go far better.' }
  };
  const TECHNIQUE_LIST = Object.values(TECHNIQUES);
  const TECH_SLOTS_BASE = 2;

  /* 10. EVENTS ----------------------------------------------------------- */
  const EVENTS = [
    { id: 'stranger', title: 'A stranger at the edge', weight: 10, min: 4,
      text: 'Someone has climbed up out of the cloud and is standing at the rim, not coming closer.',
      choices: [
        { label: 'Let them stay', effect: { villagers: 1, food: -30 }, note: 'One more mouth, one more pair of hands.' },
        { label: 'Send them down', effect: { awe: 4, faith: -3 }, note: 'The village watches you do it.' },
        { label: 'Ask what they saw', effect: { insight: 6 }, note: 'They describe islands you have not heard of.' }
      ] },
    { id: 'blight', title: 'Something in the soil', weight: 9, min: 8,
      text: 'Leaves are curling on their stems and the smell is wrong.',
      choices: [
        { label: 'Burn the affected plots', effect: { burnPlots: 2, wood: -20 }, note: 'Brutal, and it works.' },
        { label: 'Ride it out', effect: { soilAll: -18 }, note: 'The ground will be poorer for a while.' },
        { label: 'Pray over it', effect: { prayer: -40, faith: 4 }, note: 'It costs prayer and they love you for it.' }
      ] },
    { id: 'egg', title: 'An egg in the woodland', weight: 7, min: 12,
      text: 'Not one of yours. Warm, though.',
      choices: [
        { label: 'Bring it in', effect: { relicRoll: 1 }, note: 'Whatever was inside is long gone. What is left is worth keeping.' },
        { label: 'Leave it', effect: { faith: 3, mood: 5 }, note: 'The creature seems relieved.' },
        { label: 'Feed it to the beast', effect: { hunger: 40, kind: -8 }, note: 'It does not hesitate.' }
      ] },
    { id: 'pilgrims', title: 'Pilgrims below', weight: 9, min: 10,
      text: 'A knot of people on a lower island, looking up at your shrine and arguing.',
      choices: [
        { label: 'Show them a miracle', effect: { prayer: -50, faith: 8, renownMul: 0.02 }, note: 'Word of it travels a long way.' },
        { label: 'Ignore them', effect: {}, note: 'They drift off eventually.' },
        { label: 'Frighten them off', effect: { awe: 8, faith: -5 }, note: 'They will tell that story too.' }
      ] },
    { id: 'raid', title: 'Something took the granary', weight: 8, min: 14,
      text: 'The door is off its hinges and a third of the food is gone.',
      choices: [
        { label: 'Set the beast to guard', effect: { techReps: 'guard', vigorCost: 20 }, note: 'It sleeps by the door from now on.' },
        { label: 'Rebuild and move on', effect: { wood: -40, food: -60 }, note: 'Nothing else to be done.' },
        { label: 'Blame a rival, loudly', effect: { diplo: -12, renown: 40 }, note: 'It might even be true.' }
      ] },
    { id: 'windfall', title: 'A wreck on the rocks', weight: 8, min: 6,
      text: 'Something came apart in the night and the pieces washed up against your island.',
      choices: [
        { label: 'Strip it for timber', effect: { wood: 120 }, note: 'Good dry wood.' },
        { label: 'Look for survivors', effect: { villagers: 1, faith: 5 }, note: 'One, half-drowned and grateful.' },
        { label: 'Salvage the fittings', effect: { mats: { metal: 2, glass: 2 } }, note: 'Better than timber, if you can use it.' }
      ] },
    { id: 'sickness', title: 'A cough going round', weight: 8, min: 16,
      text: 'It started with one of the children and now half the huts have it.',
      choices: [
        { label: 'Spend prayer on them', effect: { prayer: -60, faith: 8 }, note: 'They recover in days.' },
        { label: 'Quarantine the sick', effect: { unrest: 10, faith: -2 }, note: 'Cold, and effective.' },
        { label: 'Do nothing', effect: { villagers: -1, faith: -8, unrest: 12 }, note: 'One does not get up again.' }
      ] },
    { id: 'challenge', title: 'A rival sends a challenge', weight: 8, min: 20,
      text: 'A folded card, delivered by someone who will not meet your eye. Beast against beast.',
      choices: [
        { label: 'Accept', effect: { arena: 1 }, note: 'The Trial Ring, at once.' },
        { label: 'Decline politely', effect: { diplo: 6, renown: -30 }, note: 'They respect the manners, not the answer.' },
        { label: 'Send the card back torn', effect: { diplo: -15, awe: 6 }, note: 'That is an answer too.' }
      ] },
    { id: 'seedcache', title: 'A cache under a stone', weight: 7, min: 8,
      text: 'Somebody buried seed here and never came back for it.',
      choices: [
        { label: 'Plant all of it', effect: { seedsAll: 6 }, note: 'A windfall for the season.' },
        { label: 'Sell it on', effect: { coinMul: 0.06 }, note: 'Seed is always wanted.' },
        { label: 'Study it', effect: { insight: 10 }, note: 'These are not varieties you know.' }
      ] },
    { id: 'aurora', title: 'The sky opens', weight: 6, min: 18,
      text: 'For most of one night the whole cloud deck lights up from underneath.',
      choices: [
        { label: 'Hold a rite', effect: { prayer: -40, faith: 10, renownMul: 0.03 }, note: 'Everyone will remember where they were.' },
        { label: 'Watch it with the beast', effect: { bond: 10, mood: 20 }, note: 'It does not look away once.' },
        { label: 'Work through it', effect: { insight: 14 }, note: 'You learn more in that one night than in a month.' }
      ] },
    { id: 'oldbeast', title: 'Bones in the new ground', weight: 7, min: 22,
      text: 'The terrace works have turned up a skeleton of something in your creature\'s line, but bigger.',
      choices: [
        { label: 'Reassemble it at the shrine', effect: { grandeurTemp: 1, awe: 6, renown: 120 }, note: 'It looms.' },
        { label: 'Grind it for meal', effect: { mats: { bone: 5 } }, note: 'Practical.' },
        { label: 'Bury it properly', effect: { faith: 8, insight: 8 }, note: 'The village insists, and they are not wrong.' }
      ] },
    { id: 'thief', title: 'Somebody has been at the stores', weight: 7, min: 24,
      text: 'The count is short and it has been short for a while.',
      choices: [
        { label: 'Find them and exile them', effect: { villagers: -1, unrest: -15, awe: 4 }, note: 'The rest work harder.' },
        { label: 'Say nothing, fix the lock', effect: { wood: -20, unrest: 5 }, note: 'They know that you know.' },
        { label: 'Forgive it publicly', effect: { faith: 10, food: -50 }, note: 'A risk, and it lands.' }
      ] },
    { id: 'inspector', title: 'The Register sends an assessor', weight: 6, min: 26,
      text: 'A small person with a very long list wants to walk your island.',
      choices: [
        { label: 'Show them everything', effect: { renownMul: 0.05 }, note: 'Accurate, and it helps.' },
        { label: 'Show them the good parts', effect: { renown: 100, diplo: -6 }, note: 'They notice, but they write it down anyway.' },
        { label: 'Refuse entry', effect: { awe: 10, renownMul: -0.02 }, note: 'That goes in the entry too.' }
      ] },
    { id: 'orphan', title: 'A whelp not of your line', weight: 6, min: 30,
      text: 'It has been living in the woodland for some time and it is not afraid of you.',
      choices: [
        { label: 'Take it in as a mate', effect: { mate: 1 }, note: 'New blood for the line.' },
        { label: 'Drive it off', effect: { kind: -6, awe: 3 }, note: 'Your creature watches it go.' },
        { label: 'Let it stay wild', effect: { faith: 4, insight: 5 }, note: 'It keeps its distance and eats the pests.' }
      ] },
    { id: 'drought', title: 'The springs are down', weight: 7, min: 15,
      text: 'What comes up is a trickle, and it tastes of stone.',
      choices: [
        { label: 'Ration the water', effect: { waterAll: -30, unrest: 8 }, note: 'Everything suffers a little.' },
        { label: 'Buy water from below', effect: { coinMul: -0.10 }, note: 'Expensive and immediate.' },
        { label: 'Send the beast to dig', effect: { techReps: 'dig', vigorCost: 30, waterAll: 40 }, note: 'It finds something.' }
      ] },
    { id: 'gift', title: 'An unmarked gift', weight: 6, min: 12,
      text: 'A crate at the rim with no note and nobody nearby.',
      choices: [
        { label: 'Open it', effect: { relicRoll: 1 }, note: 'Somebody wanted you to have this.' },
        { label: 'Push it off the edge', effect: { awe: 5 }, note: 'You are not curious enough to risk it.' },
        { label: 'Give it to the village', effect: { faith: 9, coinMul: 0.02 }, note: 'They divide it fairly, more or less.' }
      ] }
  ];

  /* 11. TITLES ----------------------------------------------------------- */
  const TITLES = [
    { id: 'none',      name: '—',                  need: g => true,                             blurb: 'No title at all.' },
    { id: 'grower',    name: 'the Grower',         need: g => g.stats.harvests >= 300,          bonus: { yield: 0.06 } },
    { id: 'patient',   name: 'the Patient',        need: g => (g.gens | 0) >= 4,                bonus: { herit: 0.10 } },
    { id: 'openhand',  name: 'the Open-Handed',    need: g => g.village.faith >= 85,            bonus: { prayer: 0.12 } },
    { id: 'dreadful',  name: 'the Dreadful',       need: g => g.village.awe >= 70,              bonus: { awe: 0.15 } },
    { id: 'curious',   name: 'the Curious',        need: g => Object.keys(g.discovered).length >= 10, bonus: { insight: 0.15 } },
    { id: 'builder',   name: 'the Builder',        need: g => (g.ring | 0) >= 2,                bonus: { buildCost: -0.10 } },
    { id: 'crowned',   name: 'the Crowned',        need: g => g.stats.festivalWins >= 3,        bonus: { renown: 0.08 } },
    { id: 'unbroken',  name: 'the Unbroken',       need: g => g.day >= 100,                     bonus: { focus: 0.10 } },
    { id: 'wright',    name: 'the Wright',         need: g => Object.keys(g.recipes).length >= 10, bonus: { craft: 0.15 } },
    { id: 'ancient',   name: 'of the Long Line',   need: g => (g.evo | 0) >= 3,                 bonus: { all: 0.05 } },
    { id: 'ascendant', name: 'Ascendant',          need: g => g.lastStanding === 1,             bonus: { renown: 0.12 } }
  ];

  /* 12. FISH (mini-game) ------------------------------------------------- */
  const FISH = [
    { id: 'mote',     name: 'Cloud Mote',    glyph: '🐟', rarity: 1, coin: 30,   feed: 8,  ring: 0, blurb: 'Barely a fish. Barely anything.' },
    { id: 'skimmer',  name: 'Skimmer',       glyph: '🐠', rarity: 1, coin: 60,   feed: 12, ring: 0, blurb: 'Rides the updraught in shoals.' },
    { id: 'lantern',  name: 'Lanternfish',   glyph: '🎏', rarity: 2, coin: 150,  feed: 18, ring: 0, night: true, blurb: 'Only rises after dark.' },
    { id: 'thorn',    name: 'Thornback',     glyph: '🐡', rarity: 2, coin: 240,  feed: 22, ring: 1, blurb: 'Fights the whole way up.' },
    { id: 'glasseye', name: 'Glass-Eye',     glyph: '🐳', rarity: 3, coin: 520,  feed: 30, ring: 1, mat: 'glass', blurb: 'Its eyes are worth more than the rest of it.' },
    { id: 'drifter',  name: 'Grey Drifter',  glyph: '🦈', rarity: 3, coin: 900,  feed: 40, ring: 2, blurb: 'Big enough to feed the village for a day.' },
    { id: 'ironjaw',  name: 'Ironjaw',       glyph: '🦭', rarity: 4, coin: 1900, feed: 50, ring: 2, mat: 'metal', blurb: 'There is skymetal in its teeth.' },
    { id: 'skywhale', name: 'Sky Calf',      glyph: '🐋', rarity: 5, coin: 5200, feed: 90, ring: 3, blurb: 'You should not have been able to land this.' }
  ];

  /* 13. CHANTS (mini-game) ----------------------------------------------- */
  const CHANTS = [
    { id: 'growth',  name: 'Chant of Greening', glyph: '🌿', len: 4, prayer: 25, ring: 0,
      blurb: 'Every growing plot jumps forward.' },
    { id: 'calm',    name: 'Chant of Stillness',glyph: '🕊️', len: 4, prayer: 30, ring: 0,
      blurb: 'Unrest falls away and the creature settles.' },
    { id: 'plenty',  name: 'Chant of Plenty',   glyph: '🌾', len: 5, prayer: 45, ring: 1,
      blurb: 'The granary fills and faith rises.' },
    { id: 'fear',    name: 'Chant of the Deep', glyph: '💀', len: 5, prayer: 50, ring: 1,
      blurb: 'Awe floods in. They will not sleep well.' },
    { id: 'insight', name: 'Chant of Seeing',   glyph: '👁️', len: 6, prayer: 70, ring: 2,
      blurb: 'The unknown gives a little of itself up.' },
    { id: 'renewal', name: 'Chant of Renewal',  glyph: '♻️', len: 6, prayer: 90, ring: 2,
      blurb: 'Soil across the whole island comes back to life.' }
  ];
  const CHANT_TONES = ['◆', '●', '▲', '■', '★'];

  /* 14. PRESTIGE --------------------------------------------------------- */
  const ASCEND_MIN_RENOWN = 40000;
  const BOONS = [
    { id: 'seedstock',  name: 'Kept Seed',       glyph: '🌾', cost: 1, blurb: 'Begin with 40 of every seed you had unlocked.' },
    { id: 'inheritance',name: 'Inheritance',     glyph: '🪙', cost: 1, blurb: 'Begin with 2,000 coin and 150 wood.' },
    { id: 'memory',     name: 'Ancestral Memory',glyph: '🧠', cost: 2, blurb: 'The new line begins with half the ingraining of the old.' },
    { id: 'earlyweb',   name: 'Old Instincts',   glyph: '🕸️', cost: 2, blurb: 'Keep the first four neurons you had grown.' },
    { id: 'wideeye',    name: 'Wide Eye',        glyph: '👁️', cost: 2, blurb: 'Insight from every source is a third higher, permanently.' },
    { id: 'greenthumb', name: 'Green Thumb',     glyph: '🌱', cost: 3, blurb: 'Yields are a quarter higher, permanently.' },
    { id: 'longline',   name: 'The Longer Line', glyph: '🧬', cost: 3, blurb: 'Start at the evolution tier you reached, minus one.' },
    { id: 'standing',   name: 'Standing Order',  glyph: '📜', cost: 4, blurb: 'Renown accrues 40% faster, permanently.' }
  ];

  /* 15. DIPLOMACY -------------------------------------------------------- */
  const DIPLO_ACTIONS = [
    { id: 'gift',    name: 'Send a gift',    glyph: '🎁', coin: g => 400 + g.day * 30, opinion: 14,
      blurb: 'Crude, effective, and everybody knows what it is.' },
    { id: 'praise',  name: 'Praise them publicly', glyph: '📣', renown: g => 60, opinion: 9,
      blurb: 'Costs you a little standing and buys a lot of goodwill.' },
    { id: 'mock',    name: 'Mock them',      glyph: '😂', opinion: -18, renown: g => -20, awe: 3,
      blurb: 'Satisfying. The Register notices the noise.' },
    { id: 'sabotage',name: 'Send the beast by night', glyph: '🌑', opinion: -30, vigor: 25,
      blurb: 'Steals a slice of their standing, if it is not caught.' }
  ];

  /* 16. OATHS (rolling objectives) --------------------------------------- */
  const OATH_TEMPLATES = [
    { id: 'harvest', name: 'Bring in {n} crops',       kind: 'harvests', base: 30, scale: 4,  renown: 40, insight: 2 },
    { id: 'sell',    name: 'Sell {n} goods',           kind: 'sold',     base: 25, scale: 3,  renown: 35, insight: 2 },
    { id: 'praise',  name: 'Praise the creature {n} times', kind: 'praised', base: 6, scale: 0.5, renown: 45, insight: 3 },
    { id: 'craft',   name: 'Make {n} things at the bench', kind: 'crafted', base: 4, scale: 0.4, renown: 50, insight: 3 },
    { id: 'examine', name: 'Examine {n} unknown things',kind: 'found',    base: 1,  scale: 0.08, renown: 60, insight: 4 },
    { id: 'fish',    name: 'Land {n} fish',            kind: 'fished',   base: 5,  scale: 0.5, renown: 45, insight: 3 },
    { id: 'chores',  name: 'Have the creature do {n} chores', kind: 'chores', base: 20, scale: 2, renown: 55, insight: 3 }
  ];

  SW.content2 = {
    SEASON_LEN, SEASONS, WEATHER, WEATHER_LIST, SOIL, FERTILISERS, FERTILISER_LIST,
    AILMENTS, AILMENT_LIST, REMEDIES, ROLES, ROLE_LIST, VILLAGER_NAMES, VILLAGER_TRAITS,
    BUILDINGS, BUILDING_LIST, MERCHANTS, CONTRACT_KINDS, RELICS, RELIC_LIST,
    TECHNIQUES, TECHNIQUE_LIST, TECH_SLOTS_BASE, EVENTS, TITLES, FISH, CHANTS, CHANT_TONES,
    ASCEND_MIN_RENOWN, BOONS, DIPLO_ACTIONS, OATH_TEMPLATES
  };
})(window.SW = window.SW || {});
