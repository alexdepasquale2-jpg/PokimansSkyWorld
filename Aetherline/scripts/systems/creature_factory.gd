extends RefCounted
class_name CreatureFactory

## The single place creatures come into existence.
##
## Everything that makes a creature — founders, wild fauna, offspring, and
## anything re-inflated from cold storage — goes through here, so that uid
## assignment, lineage registration and the spawn/load ordering contract exist
## in exactly one place. Getting that ordering wrong silently produces
## creatures that are registered under the wrong uid, which is the kind of bug
## that only surfaces three saves later.

const CREATURE_SCENE := preload("res://scenes/creatures/creature.tscn")

## Monotonic counter feeding deterministic uid generation within a session.
static var _uid_counter: int = 0

## Syllable pools for name generation. Small on purpose: names should feel like
## they come from one culture, and repetition across a long campaign is how
## players end up saying "another Vess".
const _NAME_HEAD := ["Vess", "Torr", "Sable", "Kel", "Marn", "Isk", "Dorn", "Rha",
	"Cael", "Bryn", "Ost", "Vane", "Lyr", "Grath", "Ennu", "Sorrel"]
const _NAME_TAIL := ["", "", "", "a", "en", "is", "ok", "ra", "ul", "eth", "im"]


# --- Spawning -----------------------------------------------------------------

## A brand-new creature with a random genome. Used for founders and for
## planetary fauna seeding.
##
## `opts` accepts: name, species_id, is_human, lineage_id, lineage_name,
## origin_kind, divergence, planet_id, planet_name, position, generation.
static func spawn_random(parent: Node, rng: RandomNumberGenerator,
		opts: Dictionary = {}) -> Creature:
	var creature: Creature = CREATURE_SCENE.instantiate()

	# Identity must exist BEFORE the node enters the tree: _ready registers the
	# creature with SimulationBudget using identity.uid, and a creature
	# registered under a placeholder uid never gets found again.
	creature.identity = _make_identity(rng, opts)
	creature.home_planet_id = String(opts.get("planet_id", PlanetManager.active_planet_id))
	creature.position = opts.get("position", Vector2.ZERO)

	parent.add_child(creature)

	creature.genetics.randomize_genome(
		rng,
		StringName(opts.get("species_id", "aether_base")),
		float(opts.get("divergence", 0.0)))
	# Generation lives on both the genome (survives into breeding maths) and the
	# identity (survives into archived lineage records). They must never drift.
	creature.genetics.genome.generation = creature.identity.generation
	creature.stats.initialize_vitals()
	# Wild-caught and gifted stock are grown animals, not newborns. This
	# matters mechanically, not just narratively: infants count as fragile and
	# can actually be killed, so spawning fauna at age zero would make every
	# animal on a world one bad hit from death.
	if opts.has("age_days"):
		creature.stats.age_days = float(opts["age_days"])
	elif String(opts.get("origin_kind", "founder")) != "born":
		creature.stats.age_days = creature.stats.stat("max_age_days") \
			* rng.randf_range(0.15, 0.55)
	creature.visual.refresh()

	_register_lineage(creature, opts)
	return creature


## A creature with an identity but NO genome — the caller supplies one.
## This is the conception path: BreedingSystem builds the genome from two
## gametes and installs it, so randomizing one here would be wasted work and,
## worse, would briefly publish a creature whose genes are not its parents'.
##
## Does NOT record a birth on the lineage; the breeding system does that once
## the child is known to be viable.
static func spawn_blank(parent: Node, opts: Dictionary, rng: RandomNumberGenerator) -> Creature:
	var creature: Creature = CREATURE_SCENE.instantiate()
	creature.identity = _make_identity(rng, opts)
	creature.home_planet_id = String(opts.get("planet_id", PlanetManager.active_planet_id))
	creature.position = opts.get("position", Vector2.ZERO)
	parent.add_child(creature)
	return creature


## Re-inflate a creature from a serialized snapshot — from a save, from a
## PlanetSummaryResource on landing, or from a jump manifest.
static func spawn_from_dict(parent: Node, data: Dictionary) -> Creature:
	var creature: Creature = CREATURE_SCENE.instantiate()

	# Same ordering rule as above: pre-seed the identity so registration uses
	# the real uid, then let apply_dict restore everything authoritatively.
	creature.identity = CreatureIdentityResource.from_dict(data.get("identity", {}))
	creature.home_planet_id = String(data.get("home_planet_id", ""))

	parent.add_child(creature)
	creature.apply_dict(data)
	return creature


static func serialize(creature: Creature) -> Dictionary:
	return creature.to_dict()


# --- Identity -----------------------------------------------------------------

static func _make_identity(rng: RandomNumberGenerator, opts: Dictionary) -> CreatureIdentityResource:
	var identity := CreatureIdentityResource.new()
	_uid_counter += 1
	identity.uid = CreatureIdentityResource.make_uid(
		SimulationBudget.current_tick, _uid_counter,
		"hu" if bool(opts.get("is_human", false)) else "cr")

	identity.given_name = String(opts.get("name", "")) if opts.has("name") \
		else generate_name(rng)
	identity.species_id = StringName(opts.get("species_id", "aether_base"))
	identity.is_human = bool(opts.get("is_human", false))
	identity.generation = int(opts.get("generation", 0))
	identity.origin_kind = String(opts.get("origin_kind", "founder"))
	identity.birth_tick = SimulationBudget.current_tick
	identity.birth_planet_id = String(opts.get("planet_id", PlanetManager.active_planet_id))
	identity.birth_planet_name = String(opts.get("planet_name", ""))
	identity.appearance_seed = rng.randi()

	# A founder without an explicit lineage founds its own.
	identity.lineage_id = StringName(opts.get("lineage_id",
		"lin_" + String(identity.uid).substr(3)))
	return identity


static func generate_name(rng: RandomNumberGenerator) -> String:
	return _NAME_HEAD[rng.randi() % _NAME_HEAD.size()] \
		+ _NAME_TAIL[rng.randi() % _NAME_TAIL.size()]


static func _register_lineage(creature: Creature, opts: Dictionary) -> void:
	var identity := creature.identity
	var lineage := StoryDirector.ensure_lineage(
		identity.lineage_id,
		String(opts.get("lineage_name", "Line of %s" % identity.given_name)))

	if lineage.founder_uid.is_empty():
		lineage.founder_uid = String(identity.uid)
		lineage.founder_name = identity.given_name
		lineage.species_id = identity.species_id
		lineage.founding_planet_id = identity.birth_planet_id
		lineage.founding_planet_name = identity.birth_planet_name

	lineage.record_birth(String(identity.uid), identity.generation)
	if not identity.birth_planet_id.is_empty():
		lineage.note_planet(identity.birth_planet_id)


# --- Session bookkeeping ------------------------------------------------------

## Reset the uid counter. Called when loading a save so that a fresh session
## does not start minting uids that collide with the loaded campaign's.
static func reset_counter(value: int = 0) -> void:
	_uid_counter = value
