# Skyward Reach

An HTML5 game about raising a creature that learns from praise and punishment,
farming a floating island, and grinding your way up a public leaderboard of
minor gods.

Three influences, deliberately: the pet-with-needs and item economy of Neopets,
the reinforcement-taught creature and faith/terror village of Black & White 2,
and the long compounding grind of a farming/idle game where the whole point is
that other people can see your number.

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
terrorising creature raise **Awe**. Both make prayer and renown; awe decays and
breeds unrest, faith compounds. There is a feat for maxing either and a better
one for holding both.

### The Register

Eleven rival godlings climb their own curves. Nothing rubber-bands — they are
not chasing you, which is the only reason passing one means anything. They
comment on the standings as it changes.

Renown comes mostly from one compounding source:

```
renown/tick = (1 + shrine_grandeur * 0.05) * villagers * (faith + awe)/100 * 0.09
```

Shrine tier multiplies devotion; devotion needs a village worth having. Neither
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
competitiveness) and a final summary. At 40 days the three strategies separate
cleanly — idle finishes last with a few hundred renown, hand-farming reaches
low thousands, and training the creature roughly doubles that and wins
festivals.

## Controls

| | |
|---|---|
| click a plot | do the obvious thing — till, sow, water, harvest |
| click the woodland | gather wood |
| click the creature | praise it, if it is waiting to be judged |
| `P` / `S` | praise / strike |
| `space` | pause |
| `1` `2` `3` | speed 1× / 2× / 4× |
| `F` | the Register |
| `?` | how it works |

One tick is one real second at 1×; a day is sixty ticks. Closing the tab or
switching away credits up to four hours of catch-up when you return, simulated
tick by tick with the same rules — so a creature you trained to water and
harvest keeps doing it, and one you did not, does not.
