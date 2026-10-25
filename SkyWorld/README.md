# Skyward Reach

An HTML5 game about raising a creature that learns from praise and punishment,
farming a floating island, and grinding your way up a public leaderboard of
minor gods.

Four influences, deliberately: the pet-with-needs and item economy of Neopets,
the reinforcement-taught creature and faith/terror village of Black & White 2,
the long compounding grind of a farming/idle game where the whole point is that
other people can see your number, and — running underneath all of it — the
spine of *Ancestors: The Humankind Odyssey*: reinforce a behaviour, lock it in
at a generation leap, spend what novelty teaches you, and push the frontier
outward into ground you know nothing about.

No build step, no dependencies, no network. Open `index.html` and play.

```
SkyWorld/
  index.html          the page
  style.css           interface skin
  js/
    core.js           RNG, math, formatting, save/load
    content.js        every tunable table — crops, ranks, acts, feats, rivals
    state.js          game state shape, new game, save migration
    farm.js           plots, crops, market
    creature.js       the creature's brain: desires, learning, alignment, looks
    lineage.js        ages, ingraining, generation leaps, evolutions
    discovery.js      the frontier — features, Insight, terraces, neural web
    minigames.js      the Listening and the Bench
    content2.js       tables for the second layer of systems
    boost.js          one aggregator for every multiplier in the game
    world.js          seasons, weather, soil, villagers, buildings, events, oaths
    beast.js          illness, techniques, bloodlines, the Trial Ring
    relics.js         relics, slots, fusion, titles
    trade.js          caravans, contracts, diplomacy
    minigames2.js     cloud fishing and chanting
    prestige.js       ascension
    sim.js            world tick — village, economy, rivals, festivals, feats
    render.js         canvas scene, drawn procedurally
    ui.js             DOM panels, tabs, modals, input
    main.js           bootstrap and game loop
  tools/
    simtest.js        headless balance harness
    build.mjs         inline everything into one file
  dist/
    skyward-reach.html   single-file build, openable from disk
```

## Running it

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000     # then http://localhost:8000/SkyWorld/
```

`dist/skyward-reach.html` is the same game inlined into one file. Rebuild with:

```sh
node tools/build.mjs
```

Progress saves to `localStorage` every twelve seconds and on exit. The menu
(☰) exports and imports a save as text.

## The design

### Teaching, not commanding

You never issue an order. Every few seconds the creature picks an act by
softmax over learned weights, filtered by what is physically possible and
pushed around by its needs. Then it does the act in front of you, and you get a
nine-second window to **praise** (P) or **strike** (S).

Praise multiplies that act's weight. Striking divides it, and also costs bond,
mood, and a little of the creature's kindness — hitting an animal makes it
meaner whatever you were trying to teach. Learning rate scales with the
lineage's wits and with bond, so a creature that likes you learns faster, and a
frightened one (mood under 25) barely learns at all.

Needs override training. A starving creature will eat the ripe field it was
taught to harvest. That is the lesson, not a bug.

The **Leash of Learning** is the second teaching channel: with it on, every
chore you do with your own hands nudges the matching weight upward. Slower than
praise, free, and it works while you are busy farming.

### Why you want a trained creature

Your own actions cost **Focus**, which regenerates slowly and caps at 24. A
full plot cycle by hand is four Focus plus watering. Three plots are
comfortable. Sixteen are not. The creature is the only way the farm ever runs
itself, and it only runs itself as well as you taught it.

### What the creature looks like

Everything visible is derived from how you raised it: hide colour and back
ridge from kindness (blossoms one way, spikes the other), body mass from how
well fed it has been, posture from diligence, eyes from mood, and an aura from
bond. Nothing is a sprite, so a saint and a monster of the same lineage are
recognisably different animals.

### Faith and Awe

Villagers eat from the granary and pray in proportion to how they feel about
you. Feeding them and building the shrine raises **Faith**. Storms and a
terrorising creature raise **Awe**. Both make prayer and both count toward
renown, but they genuinely compete: awe suppresses the faith your village
settles at, and past about 45 it keeps unrest topped up until people start
leaving — and villagers are the multiplier on everything. Fear is faster and
extracts prayer just as efficiently; love compounds and keeps the village.
Holding 60 of each at once is a feat for a reason.

### The line

The Ancestors idea, applied to the creature you were already teaching.

Learning is cheap and it dies with the animal. Praising a chore the creature
*already knows well* also **ingrains** it, a separate meter per behaviour, and
only ingrained behaviour survives a **generation leap**. So the loop is: teach
it, drill it, then breed before it dies. A whelp of a well-drilled parent
starts already knowing the trade; one whose parent you let die of old age
inherits a fraction of it.

Age matters in both directions. Whelps learn at 1.5× and are physically
useless; elders are the reverse. A creature lives about 66 days, and you get a
warning when it starts going grey.

Every few leaps the line itself changes shape — Broad-backed, Bright-eyed,
Long-limbed, Crested, Skyborn — and those bonuses are permanent and cumulative.
This is the long-run multiplier on everything else: in headless testing a
player who trains and breeds is 1.2× ahead of one who only farms by hand at day
60, 2.7× at day 120, and 5.3× at day 200.

### The frontier

The island is not fully known to you. Unknown things sit out past the farm as
`?` marks; walking over and examining one is the main source of **Insight**,
several of them permanently change the island (a spring slows evaporation,
black loam speeds growth, a monolith keeps the village permanently uneasy), and
some hand over materials.

Doing anything for the first time also pays Insight — a crop you have never
harvested, a miracle you have never worked, a rank you have never held. Novelty
is what rewires you, and without it the economy could not bootstrap.

Insight buys the **neural web**: twelve permanent upgrades to *you* rather than
the creature, including the two mini-games. It also pays for **terraces**.

### The island grows

Four terraces. Raising one physically enlarges the landmass — the camera pulls
back, the farm grid extends from sixteen plots toward thirty-six, the villager
cap rises, and a fresh band of unknown ground appears inside the new rim. The
late shrine tiers need the ground to exist before there is anywhere to put
them, so the two tracks interlock.

### The mini-games

**The Listening** (neural web). Stop working and sweep the island; whatever
answers glows for a couple of seconds and you click it before it fades. Pays
coin, wood, Insight and materials, and it is the only source of storm glass and
skymetal. On a cooldown, and it costs Focus, so it competes with farming.

**The Bench** (neural web). Put two materials together and find out. There is
no recipe list — sixteen of the twenty-one pairings make something, five make
nothing, and discovering either is worth Insight the first time. Buyable
materials are priced so that buy-and-craft is only a thin margin; the money is
in the two materials you cannot buy, which is what keeps the Listening worth
playing.

## The second layer

Twenty further systems, each with three or more moving parts, all feeding the
same loop rather than sitting beside it.

1. **Seasons.** Four of twelve days each — Greening, High Sun, Falling, The
   Still — changing growth rate, evaporation, market prices and faith. The
   Still is a near-standstill you plan around by building and breeding.
2. **Weather.** Eight kinds rolled daily with season-weighted odds, each with
   real effects (a downpour waters everything free, a gale rots ripe crops,
   mist makes the Listening pay more, an auroral night lifts insight and
   faith). Tomorrow's weather is forecast, so it is a planning input.
3. **Soil.** Per-plot richness that every harvest depletes and empty ground
   recovers. Yield runs from 0.55× on dead ground to 1.30× on rich. Sowing a
   different crop than last time is worth another +22%.
4. **Fertiliser.** Three kinds at different costs — compost from food, kiln ash
   from wood (cheaper with a kiln), bone meal from materials.
5. **Named villagers.** Everyone has a name, a mood that tracks faith and
   unrest, and sometimes a trait (steady, quick, devout, sour, hungry, clever)
   that changes what they are worth.
6. **Roles.** Assign each villager: farmhands water plots unprompted, masons
   cut building costs, herbalists keep the creature well, acolytes raise prayer
   and faith, scouts turn up materials, traders improve every price.
7. **Buildings.** Eight structures at three tiers each, gated on terraces —
   well, granary, workshop, watchtower, kiln, beast house, cloud dock, trial
   ring. They render on the island and get taller as they improve.
8. **Illness.** Five ailments with causes you can see coming — overfeeding,
   damp, heat, overwork, cruelty — each with its own remedy and a work penalty
   while it lasts.
9. **Techniques.** Nine abilities the creature works out by repetition rather
   than instruction (sprint, double haul, deep dig, sing, restraint, night
   work, sense, guard, showmanship), with limited slots and partial
   inheritance down the line.
10. **Bloodlines.** Wild mates turn up as offers; crossing lineages gives
    hybrid vigour and a visible second line, staying pure narrows the stock,
    and a pedigree records the whole thing.
11. **The Trial Ring.** Best-of-three against rival beasts, scored on the whole
    line — stats, size, bond, ingrained behaviour, techniques and generations —
    so breeding is never a penalty. One trial a day.
12. **Caravans.** Four merchants with rotating stock, standing that improves
    prices, and the only place to buy skymetal and storm glass.
13. **Contracts.** Each caravan wants a quantity of a crop by the time it
    leaves; filling it pays coin, renown and standing, failing costs standing.
14. **Relics.** Fourteen artefacts across four ranks with limited settings,
    won from festivals, the ring, rare fish and the hardest crafts. Two of a
    rank fuse into one of the next, consuming both.
15. **Titles.** Twelve earned by what you actually did, each with a passive
    bonus, and you pick which one to wear.
16. **Events.** Sixteen situations with three real choices each and no obvious
    right answer, gated by day so they arrive as the island can carry them.
17. **Oaths.** Three rolling objectives every three days, scaled to your day
    count, paying renown and insight.
18. **Diplomacy.** Gifts, public praise, mockery and sending the creature out
    at night. Allies quietly add standing daily; enemies chip at it; opinions
    drift back to indifference.
19. **Cloud fishing.** A three-stage timing game — eight species by terrace and
    time of day, with rare ones carrying materials and relics.
20. **Chanting.** Call-and-response with the shrine: six chants, sung back tone
    by tone, landing at the accuracy you managed.

And **ascension** on top: retire the island past 40,000 renown for points spent
on eight permanent boons, then begin again on fresh ground.

### The loop

The wider the game got, the easier it became to lose the thread, so:

- **A next-action list** sits on the scene — a live, ranked, five-item list of
  what is actually waiting on you, each entry a shortcut to the thing itself.
- **Batch work.** Harvest or water every plot at once for the same focus per
  plot, without the clicking.
- **Attention dots** mark any tab with something waiting behind it.
- **One aggregator.** Every multiplier in the game resolves through
  `boost.js`, so nine systems compose instead of nine places disagreeing.
- **Mini-games run on wall-clock time**, not simulation time, so a sweeping
  marker sweeps instead of teleporting between four positions, and they keep
  working while the world is paused.

### The Register

Eleven rival godlings climb their own curves. Nothing rubber-bands — they are
not chasing you, which is the only reason passing one means anything. They
comment on the standings as it changes.

Renown comes mostly from one compounding source:

```
renown/tick = (1 + shrine_grandeur * 0.05) * villagers * (faith + awe)/100 * 0.09
              * (evolution renown bonus) * (1.3 if Devotion neuron)
```

Shrine tier multiplies devotion; devotion needs a village worth having, which
needs terraces to house them; and a deep line multiplies the whole thing. Neither
half alone gets you up the ladder. Feats and festival placings are the spikes
on top.

Rival daily growth accelerates for roughly seventy days and then hits a
ceiling — an established god is not getting any more established. A fully built
island out-earns the fastest of them, so first place is a destination rather
than a treadmill. In headless testing an unremarkable strategy reaches first
place around day 195; playing well is considerably faster.

### Festivals

Every fifth day, rotating between the Harvest Fair (your best crate), the Beast
Trial (what you made of the creature) and the Grand Rite (shrine, faith, awe).
Rivals are scored against a par curve for that category, not against their
renown, so a runaway leader cannot sweep every event. The Register tab shows
your score and the expected par before you enter, which makes hoarding stock
ahead of a Harvest Fair a real decision.

## Balance harness

`tools/simtest.js` loads the real game modules and runs a scripted player, so
pacing changes can be checked in a second instead of an hour:

```sh
node tools/simtest.js 80 trainer   # days, strategy
node tools/simtest.js 40 hand      # farms by hand, never trains the creature
node tools/simtest.js 40 idle      # touches nothing
```

It prints a five-day sample table (renown, standing, mastery, festival
competitiveness, generation, terrace, Insight) and a final summary. The scripted
player examines features, grows neurons, works the bench, approximates a
mediocre player at the Listening, and breeds when the creature is grown and
well bonded.

Rough pacing it produces, for an unremarkable strategy: tenth on the Register
around day 60, ninth to twelfth by day 140, and fourth to seventh by day 220,
still climbing at day 300. The three strategies still separate cleanly at day
60 — idle finishes last on a few hundred renown, hand-farming reaches ~14,000,
training and breeding ~20,000, and the gap widens sharply after that as the
line's evolutions compound.

Two honest caveats. Run-to-run variance is high in the late game — it hinges on
when the fifth shrine tier lands and which relics turn up — so the numbers above
move by a factor of two between seeds. And the scripted player is deliberately
mediocre at the mini-games and picks event choices at random, so it understates
what a deliberate player achieves. The late game would benefit from real
playtesting rather than more harness tuning.

## Controls

| | |
|---|---|
| click a plot | do the obvious thing — till, sow, water, harvest |
| click the woodland | gather wood |
| click the creature | praise it, if it is waiting to be judged |
| `space` | pause |
| `1` `2` `3` | speed 1× / 2× / 4× |
| click a `?` | walk over and examine it |
| `C` | cast a line |
| `6`–`0` | sing the five tones |
| `space` | strike, while fishing |
| `P` / `S` | praise / strike |
| `L` | the Listening |
| `B` | generation leap |
| `F` | the Register |
| `?` | how it works |

One tick is one real second at 1×; a day is sixty ticks. Closing the tab or
switching away credits up to four hours of catch-up when you return, simulated
tick by tick with the same rules — so a creature you trained to water and
harvest keeps doing it, and one you did not, does not.
