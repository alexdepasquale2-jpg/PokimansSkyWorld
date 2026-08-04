extends RefCounted
class_name Perception

## Composes the fixed-width vector a creature's senses hand to the shared
## cultural network.
##
## ONE FILE OWNS THE LAYOUT. There is exactly one place a slot can be added and
## exactly one place the lab, the tests and the save-migration read their names
## from. A perception layout that drifts out of sync with the weights trained
## against it is unrecoverable and undetectable, so it does not get to live in
## two places.
##
## THE LAYOUT IS APPEND-ONLY AND VERSIONED, on exactly the same reasoning as the
## AetherTypes enums and the genome schema: new slots go on the end, LAYOUT_VERSION
## bumps, and CultureNet.grow_inputs widens the first weight matrix while keeping
## everything already learned.
##
## WHAT MAY NOT GO IN HERE. Nothing the animal could not itself perceive — no
## SimLOD, no uid, no raw tick count, no camera distance. If the network can see
## the simulation it will learn the simulation, and "when I am off-screen, do X"
## is the tell-tale of a game that cheats. LOD gates *participation*
## (see CultureTicker), never perception. A self-test asserts no engine-only key
## appears in SLOT_NAMES.

const LAYOUT_VERSION: int = 1
const SLOT_COUNT: int = 32

## Every slot, in order. The index into this array IS the input index.
const SLOT_NAMES: Array[String] = [
	"hunger", "energy", "health", "mood",
	"hp_fraction", "age_fraction", "hunger_critical", "energy_critical",
	"aggression", "boldness", "curiosity", "sociability",
	"loyalty", "stress_resilience", "agility", "mass",
	"acuity", "forage_aptitude",
	"recent_trauma", "recent_combat_loss", "recent_combat_win", "lifetime_hardship",
	"archetype_progress", "archetype_crystallized",
	"day_phase_sin", "day_phase_cos", "thermal_comfort",
	"predator_pressure", "food_proximity", "ally_density", "terrain_hazard",
	"bias",
]

## Slots that carry no signal until Stage 2 gives the world entities to sense.
## Forced to exactly 0.0 by the composer, and zero-initialised in the network —
## see CultureNet.initialize for why that pairing is what makes activating them
## later a bit-exact no-op rather than an injection of noise into a trained clan.
const DEAD_SLOTS: Array[int] = [27, 28, 29, 30]

## The subset a NEAR-band creature refreshes. Coarse perception is not a
## different vector — it is the same vector with fewer slots re-read, so the
## network never sees a layout it was not trained on.
const COARSE_SLOTS: Array[int] = [0, 1, 2, 3, 4, 5, 6, 7, 22, 23, 24, 25, 31]

## Divisor on the (value - baseline) deviation before tanh. Phenotype traits are
## unbounded deltas from a species norm, so feeding them raw would let one
## outlier animal saturate a whole layer.
const TRAIT_SCALE: float = 1.0

## Reference magnitude for log-compressing experience counters.
const COUNTER_REF: float = 40.0

## Window, in ticks, for the "recent" experience slots. One in-game week.
## Written out rather than derived from SimulationBudget.TICKS_PER_DAY because a
## const initialiser is evaluated at parse time, before any autoload exists.
const RECENT_WINDOW: int = 1200 * 7


## Slot index by name. Linear over 32 entries and called only by tooling.
static func slot_index(slot_name: String) -> int:
	return SLOT_NAMES.find(slot_name)


static func is_dead(index: int) -> bool:
	return DEAD_SLOTS.has(index)


## An empty vector with the constant bias slot already set. The starting point
## for every composition, and what an unsensed creature legitimately looks like.
static func blank() -> PackedFloat32Array:
	var v := PackedFloat32Array()
	v.resize(SLOT_COUNT)
	v[31] = 1.0
	return v


## Full Tier-1 perception.
##
## Reads the RESOLVED phenotype via StatsComponent, never the raw genome — the
## invariant ai_controller.gd has carried since Phase 0: a creature bred placid
## and traumatised into aggression must perceive the world as the traumatised
## animal it is.
static func compose(creature: Node) -> PackedFloat32Array:
	var v := blank()
	if creature == null:
		return v

	var needs: NeedsComponent = creature.needs
	if needs != null:
		v[0] = clampf(needs.hunger, 0.0, 1.0)
		v[1] = clampf(needs.energy, 0.0, 1.0)
		v[2] = clampf(needs.health, 0.0, 1.0)
		v[3] = clampf(needs.mood, 0.0, 1.0)
		v[6] = 1.0 if needs.hunger <= NeedsComponent.CRITICAL_THRESHOLD else 0.0
		v[7] = 1.0 if needs.energy <= NeedsComponent.CRITICAL_THRESHOLD else 0.0

	var stats: StatsComponent = creature.stats
	var traits: Dictionary = {}
	if stats != null:
		traits = stats.phenotype()
		v[4] = stats.hp_fraction()
		var max_age: float = maxf(1.0, stats.stat("max_age_days"))
		v[5] = clampf(stats.age_days / max_age, 0.0, 1.0)

		v[8] = _trait(traits, "aggression")
		v[9] = _trait(traits, "boldness")
		v[10] = _trait(traits, "curiosity")
		v[11] = _trait(traits, "sociability")
		v[12] = _trait(traits, "loyalty")
		v[13] = _trait(traits, "stress_resilience")
		v[14] = _trait(traits, "agility")
		v[15] = _trait(traits, "mass")
		v[16] = (_trait(traits, "sight") + _trait(traits, "scent")
			+ _trait(traits, "hearing")) / 3.0
		v[17] = _trait(traits, "forage")

	var experience: ExperienceComponent = creature.experience
	if experience != null:
		v[18] = _compress(experience.recent_total("trauma_events", RECENT_WINDOW))
		v[19] = _compress(experience.recent_total("combat_loss", RECENT_WINDOW))
		v[20] = _compress(experience.recent_total("combat_win", RECENT_WINDOW))
		# Heavy-tailed lifetime counters. StoryDirector already documents why
		# these cannot be compared raw: distance_travelled reaches five figures
		# while protect_ally is proud of thirty.
		v[21] = _compress(experience.count("days_starving")
			+ experience.count("hazards_endured"))

	var archetype: ArchetypeComponent = creature.archetype
	if archetype != null and archetype.state != null:
		var best: float = 0.0
		for archetype_id in archetype.state.progress:
			if not archetype.state.is_crystallized(archetype_id):
				best = maxf(best, archetype.state.get_progress(archetype_id))
		v[22] = clampf(best, 0.0, 1.0)
		v[23] = 1.0 if not archetype.state.active_archetypes().is_empty() else 0.0

	# Time of day as sin/cos rather than a 0..1 ramp, so midnight is adjacent to
	# 23:59 instead of a cliff the network has to memorise its way around.
	var phase: float = fposmod(float(SimulationBudget.current_tick),
		SimulationBudget.TICKS_PER_DAY) / SimulationBudget.TICKS_PER_DAY
	v[24] = sin(TAU * phase)
	v[25] = cos(TAU * phase)

	v[26] = _thermal_comfort(stats)

	# Slots 27-30 stay exactly zero here. Stage 2 fills them via
	# apply_world_senses when an Overworld (or other world host) has entities
	# to sense. Culture self-tests call compose alone and must keep bit-exact
	# zeros so dead-column weight activation remains a no-op until then.
	return v


## Write Odyssey Stage-2 spatial slots from a host-supplied senses dictionary.
## Absent keys leave the slot at the Stage-1 default (zero contribution from a
## far / empty reading). Indices resolve by name so layout reorders stay safe.
static func apply_world_senses(v: PackedFloat32Array, senses: Dictionary) -> void:
	if v.size() != SLOT_COUNT or senses.is_empty():
		return
	var i_pred := slot_index("predator_pressure")
	var i_food := slot_index("food_proximity")
	var i_ally := slot_index("ally_density")
	var i_haz := slot_index("terrain_hazard")
	# Near = high pressure / proximity (inverse distance, clamped 0..1).
	v[i_pred] = clampf(1.0 - float(senses.get("predator_dist", 9999.0)) / 600.0, 0.0, 1.0)
	v[i_food] = clampf(1.0 - float(senses.get("food_dist", 9999.0)) / 500.0, 0.0, 1.0)
	v[i_ally] = clampf(float(senses.get("ally_count", 0)) / 8.0, 0.0, 1.0)
	v[i_haz] = clampf(float(senses.get("hazard", 0.0)), 0.0, 1.0)


## Tier-2 perception: refresh only the cheap slots and carry the rest forward
## from the creature's last full sensing.
static func compose_coarse(creature: Node, previous: PackedFloat32Array) -> PackedFloat32Array:
	var v: PackedFloat32Array = previous.duplicate() if previous.size() == SLOT_COUNT else blank()
	if creature == null:
		return v

	var needs: NeedsComponent = creature.needs
	if needs != null:
		v[0] = clampf(needs.hunger, 0.0, 1.0)
		v[1] = clampf(needs.energy, 0.0, 1.0)
		v[2] = clampf(needs.health, 0.0, 1.0)
		v[3] = clampf(needs.mood, 0.0, 1.0)
		v[6] = 1.0 if needs.hunger <= NeedsComponent.CRITICAL_THRESHOLD else 0.0
		v[7] = 1.0 if needs.energy <= NeedsComponent.CRITICAL_THRESHOLD else 0.0

	var stats: StatsComponent = creature.stats
	if stats != null:
		v[4] = stats.hp_fraction()
		v[5] = clampf(stats.age_days / maxf(1.0, stats.stat("max_age_days")), 0.0, 1.0)

	var phase: float = fposmod(float(SimulationBudget.current_tick),
		SimulationBudget.TICKS_PER_DAY) / SimulationBudget.TICKS_PER_DAY
	v[24] = sin(TAU * phase)
	v[25] = cos(TAU * phase)
	v[31] = 1.0
	return v


## How far outside its comfortable temperature band this creature currently is,
## mapped to 1.0 (comfortable) .. 0.0 (badly outside).
##
## Semi-live by design: PlanetSeedResource.derived is false until Phase 3, so
## every world currently reports the same default and this slot carries no
## variance yet. It stays a live slot rather than a dead one because it will
## start varying with no code change here — dead-slot discipline is reserved for
## slots that are *forced* to zero.
static func _thermal_comfort(stats: StatsComponent) -> float:
	if stats == null:
		return 1.0
	var seed_resource: PlanetSeedResource = PlanetManager.active_planet()
	if seed_resource == null:
		return 1.0
	var temperature: float = seed_resource.mean_temperature_c
	var floor_c: float = stats.stat("cold_floor_c")
	var ceiling_c: float = stats.stat("heat_ceiling_c")
	if temperature >= floor_c and temperature <= ceiling_c:
		return 1.0
	var excess: float = (floor_c - temperature) if temperature < floor_c else (temperature - ceiling_c)
	return clampf(1.0 - excess / 40.0, 0.0, 1.0)


## Phenotype trait as a deviation from the species baseline, squashed.
##
## The network sees HOW UNUSUAL THIS ANIMAL IS rather than raw trait units, which
## means a balance patch that shifts every creature's baseline does not
## invalidate what the clan learned — the same reasoning behind assumption #11's
## refusal to serialize derived stats.
static func _trait(traits: Dictionary, key: String) -> float:
	var value: float = float(traits.get(key, 0.0))
	var baseline: float = GenomeDB.trait_baseline(key)
	return tanh((value - baseline) / TRAIT_SCALE)


## Log compression for unbounded counters.
static func _compress(value: float) -> float:
	if value <= 0.0:
		return 0.0
	return clampf(log(1.0 + value) / log(1.0 + COUNTER_REF), 0.0, 1.0)


## Human-readable slot dump for the lab and the creature readout.
static func describe(v: PackedFloat32Array) -> Array[String]:
	var lines: Array[String] = []
	if v.size() != SLOT_COUNT:
		lines.append("  (no perception composed yet)")
		return lines
	for i in SLOT_COUNT:
		var marker: String = "  (stage 2)" if is_dead(i) else ""
		lines.append("  %2d %-22s %+6.3f%s" % [i, SLOT_NAMES[i], v[i], marker])
	return lines


## Compact one-line form, for the creature debug readout where the full 32-slot
## table would drown everything else.
static func summarize(v: PackedFloat32Array) -> String:
	if v.size() != SLOT_COUNT:
		return "(unsensed)"
	return "hunger %.2f  energy %.2f  health %.2f  hp %.2f  age %.2f  arch %.2f" % [
		v[0], v[1], v[2], v[4], v[5], v[22]]
