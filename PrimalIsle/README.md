# Primal Isle

A 2D, one-thumb dinosaur survival game for phones, in which every life is a
roguelike run and the shop is funded by an incremental game you play in the
same app.

Hatch at 6% of your adult size. Eat, drink, grow. Everything bigger than you is
on the same island and most of it is hungry. Death takes the whole run — the
growth and every mutation on it.

No build step, no dependencies, no network, no money. Open `index.html` and
play.

```
PrimalIsle/
  index.html          the page
  style.css           phone-first skin
  js/
    core.js           RNG, seeded noise, formatting, save/load
    content.js        species, biomes, food, needs, calls, combat constants
    store.js          every price, in Dinollars
    mutations.js      the roguelike pool and the draft
    idle.js           the Fossil Exchange — generators, upgrades, prestige
    world.js          island generation, biomes, water, food nodes, day/night
    shop.js           the account: what you own and what it does to a run
    dino.js           one animal — needs, growth, stats, movement
    combat.js         bites, bleeding, carcasses
    ai.js             the other thirty-four players
    state.js          game state, new game, save migration
    sim.js            the tick
    render.js         canvas scene, drawn procedurally
    ui.js             HUD, joystick, sheets, the shop, the draft
    main.js           bootstrap and the game loop
  tools/
    simtest.js        headless balance harness
    build.mjs         inline everything into one file
  dist/
    primal-isle.html          single-file build, openable from disk
    primal-isle.fragment.html the same, without the document wrapper
```

## Running it

Open `index.html` directly, or serve the folder:

```sh
python3 -m http.server 8000     # then http://localhost:8000/PrimalIsle/
```

`dist/primal-isle.html` is the same game inlined into one file. Rebuild with:

```sh
node tools/build.mjs
node tools/build.mjs --fragment   # for hosts that supply their own <html> shell
```

Progress saves to `localStorage` every ten seconds. The menu (☰) exports and
imports a save as text.

## Controls

Portrait, both thumbs, nothing important within 44px of an edge.

| | |
|---|---|
| drag the lower-left | move — the stick appears wherever you put your thumb |
| **Bite** | attack whatever is in front of you |
| **Sprint** | hold; burns stamina |
| **Eat / Drink** | hold; does whatever is under you |
| **Call** | broadcast, distress, or group |
| **Items** | the shop |
| tap the minimap | the full map |

At a desk: `WASD` to move, `space` to bite, `shift` to sprint, `E` to
eat or drink, `Q` to call, `M` for the map, `B` for the Exchange.

---

# The three games

## 1. The isle

Top-down survival on a 2,600-unit island generated from a seed — coastline,
highland spine, one river, three lakes, and the marsh that collects around
them. Nothing is a sprite; the island is baked once into a small bitmap and
everything on top of it is drawn procedurally, so a hatchling and an elder of
the same species are recognisably the same animal at different ages.

**Growth is the whole score.** It is health, damage, speed, reach and whether
the thing that just found you is a problem. You grow only while both hunger and
thirst are above 35, which makes the loop: find food, find water, do not get
eaten, repeat. A hatchling is not a small adult — stats scale as
`0.28 + 0.72 × growth^1.15`, so at 6% you are barely an animal.

**Food gets worse as you get bigger.** Every plant and critter has a quality
figure, and nutrition is `quality ÷ (0.25 + 0.75 × growth)`. A grown herbivore
living on ferns is losing ground and has to walk to the highland ironleaf. That
pressure is deliberate, and it is exactly the pressure the Growth Serum in the
shop exists to relieve.

**Water is not optional.** Thirst drains roughly twice as fast as hunger.
Fresh water is the river, the lakes and the marsh; the sea will go down and
then take more than it gave.

**Wounds.** Bites bleed (five stacks, each ticking damage) and sometimes break
a leg. Bleeding is what kills the ones that got away.

**Night.** A full day is seven minutes. Vision at night is species-dependent
and the darkness on screen *is* your vision radius — the hole in the dark is
exactly how far this animal can see, which is the clearest possible statement of
what night vision is worth.

**Calls.** Broadcast, distress, and a group call. Every one of them does
something useful and tells the map where you are. A distress call is a dinner
bell for anything that fancies its chances.

**The other thirty-four.** There is no server; the lobby is simulated locally
and runs through exactly the same functions as you — same needs, same growth
curve, same combat, same mutations. They hunt each other, form packs, flee,
scavenge, drown, and comment on it in the feed. About a third of them have the
shop working for them and grow 35% faster. It is never a level playing field,
which is the point.

Two mercies, both deliberate: nothing bothers hunting anything under 18% growth
unless it is genuinely starving, and you are hard to notice for ten seconds
after hatching.

## 2. The run

Every life is a roguelike run. At **12%, 22%, 35%, 52%, 70% and 88%** growth the
isle offers three mutations and you keep one. The other two are gone, and all of
it dies with the animal.

Twenty-eight mutations across four rarities, and every one of them is a real
mechanical change rather than a percentage on a card:

- **Ambush Predator** — the first bite on something that has not been in a fight
  yet lands twice as hard.
- **Hollow Bones** — +22% speed for −15% health.
- **Undying** — one killing blow a life leaves you at 1 health instead.
- **Symbiotic Algae** — daylight slowly feeds and waters you.
- **Iron Stomach** — rotten meat is as good as fresh, and the sea stops making
  you sick.
- **Low Slung** — far harder to notice, which changes what the whole lobby does
  about you.

They stack and they interact: Hooked Claws plus Feeding Frenzy is a bleed-and-
drink build; Low Slung plus Nocturnal Eyes is a different game after dark. The
last two milestones tilt the draw toward Rare and Apex, so finishing a run is
worth doing for its own sake.

**The world stops during a draft.** Choosing a build is a real decision and it
should not be made with something walking up behind you — and on a phone, a menu
is not a moment of spare attention. The same rule covers every sheet in the
game: opening the shop pauses the isle. It never pauses the Exchange.

**The lobby mutates too.** A rival at 75% growth is carrying three of these,
which is why an adult is frightening rather than merely large.

## 3. The Fossil Exchange

An incremental game, and the only source of Dinollars — the currency the shop
takes. **There is no payment screen anywhere in this game and no way to add one.**

Tap to dig. Eight generators from the Bone Digger to the Cloning Vats, each on
the 1.15× cost curve every incremental game converges on, each doubling at 10,
25, 50, 100 and 200 owned. Global upgrades on top. When the Exchange has earned
two million lifetime Dinollars, an **Extinction Event** resets it for fossil
points worth +5% each, forever.

It runs while you are out on the isle, and for up to eight hours with the tab
shut.

### The two halves feed each other

```
the Exchange earns Dinollars    →   the shop turns Dinollars into survival
a run banks specimens           →   specimens multiply the Exchange
```

**Specimens** are the join: one per 10% of peak growth reached on a run, banked
whether you live or die, each worth +4% on the Exchange forever. It is the only
thing a death cannot take, and it is why dying is a setback rather than a wasted
twenty minutes.

The shop keeps the free-to-play *shape* — consumables, a crate with a pity
counter, a season pass with a free track and a paid one, a day membership,
timed deals that fire the moment the game hurts you — because that shape is
genuinely good at making a shop feel alive. What it does differently is print
the numbers:

- crate odds **and the expected value of a pull** against its price;
- the exact multipliers on the membership, including the one it applies to the
  Exchange that pays for it;
- what a bone is worth against a Dinollar, spelled out in the Bones tab;
- a **ledger** of every Dinollar spent, by category;
- and, on each deal, the moment it was waiting for. Three of the four wait for
  a moment the game has just taken something from you. That timing is the
  oldest trick in the business and it works just as well when the price is
  play money, which is precisely why it is worth seeing labelled.

**Banked mutations** are the bridge back: Dinollars buy up to two permanent
slots that are already filled when the next hatchling opens its eyes. Only
mutations a run has actually shown you, and never the Rare or Apex ones — those
have to be earned every time.

---

## Balance harness

`tools/simtest.js` loads the real game modules and runs a scripted animal under
four different relationships with the Exchange, on the same island, with the
same brain and the same random stream. The only variable is the Exchange.

```sh
node tools/simtest.js 20 7      # minutes, seed
```

Twenty minutes, seed 7:

```
profile      peak  adult at adult for  deaths revived  kills  drafts    D$/s   spent  adv  rank
survivor      21%         —     0m00s       3       0      0       4       0       0    0   #33
digger        21%         —     0m00s       3       0      0       4     321       0    1   #33
outfitter    100%    15m20s     4m23s       3       0      0      14     451    4.1k   10   #20
tycoon       100%     0m31s    19m29s       1       1      0       6   19.2k    5.3k   42    #1

growth-seconds   survivor 150 · digger 1.00× · outfitter 2.63× · tycoon 7.81×
```

The **digger** is the control: it works the Exchange hard and spends nothing on
the isle, and it lands on 1.00× — identical to the survivor, to the last
growth-second. Running an idle game in the background does nothing whatsoever
for a run. Every bit of the outfitter's 2.63× and the tycoon's 7.81× is
spending, and the harness is built so that the two cannot be confused.

The scripted player is deliberately mediocre — it drafts greedily by rarity,
never uses cover on purpose, and only fights when the matchup already looks won
— so these numbers understate what a deliberate player does.

Two honest caveats. The tycoon starts on a day of banked Exchange income
credited up front rather than waited out, so its 31-second adulthood is what a
long-running Exchange buys, not what a first session looks like. And run-to-run
variance is high: a single early Tyrant Prime encounter moves the survivor's
peak by a factor of two between seeds.

## Design notes

**One update loop, shared by everything.** The player's dinosaur and the
thirty-four others run through the same `dino.js` and `combat.js`. It is the
only way the shop's advantages and the lobby's mutations are honestly reflected
in what happens to you, and it lets the harness play both sides.

**Stats compose in one order**, everywhere: species base × growth scale ×
(1 + mutation modifiers). Mutations are a flat bag of additive modifiers
recomputed only when the list changes, so adding one is adding a row in
`mutations.js`.

**The world is regenerated, not saved.** The seed goes in the save and
`world.build()` puts the same coastline back. Only what changed during play —
who is alive, how much of each fern is left, the account, the Exchange — is
persisted.

**The HUD only touches the DOM when something changed.** Rewriting a panel ten
times a second detaches the node under the player's thumb mid-tap; every HUD
panel holds its last markup and skips the write.

**Timers that must not stop.** Pausing the world for a sheet froze the respawn
countdown the first time it was built. Respawn and deal timers now tick outside
the pause, along with the Exchange.
