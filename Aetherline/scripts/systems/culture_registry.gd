extends RefCounted
class_name CultureRegistry

## Every culture in the campaign, keyed by clan.
##
## WHY THIS IS A STATIC CLASS AND NOT A SEVENTH AUTOLOAD.
##
## README assumption #3 fixes the autoload list at six, and that assumption is
## worth keeping rather than routing around — but the reason it holds is specific:
## autoloads here are PROCESSES, not PLACES. Every one of the six either ticks
## (SimulationBudget), listens to the bus (StoryDirector), must exist before any
## scene does (GenomeDB), or owns a filesystem lifecycle (SaveSystem).
##
## A culture registry is none of those. It never ticks — the AI pulls from it. It
## never listens — rewards are pushed to it by the router that earned them. It has
## no load-order requirement beyond GenomeDB. Making it an autoload would buy one
## line in project.godot and cost a stated architectural assumption.
##
## The idiom already exists here, too: CreatureFactory._uid_counter,
## BreedingSystem.research_mutation_modifier and
## EpigeneticsComponent.research_heritability_bonus are all static campaign-wide
## state, and the second is documented as static precisely because it is "a
## campaign-wide condition, not a property of any one creature". So is a culture.
##
## Not inside GenomeDB either: that registry's whole contract is AUTHORED,
## IMMUTABLE content. Culture weights are mutated on every reward and are
## per-campaign. The drives and reward values culture reads do live in GenomeDB —
## that is the correct reading of assumption #3, not a violation of it.
##
## THE ONE HAZARD, named so it is not rediscovered: SaveSystem only calls
## providers registered before the load runs, and a static class has no _ready to
## register from. `install()` is therefore idempotent and is called from
## bootstrap, from the lab, and defensively from `ensure()`.

## Cultures beyond which the least-used are folded together. A campaign that
## visits hundreds of worlds must not accumulate hundreds of 19 KB brains.
const MAX_CULTURES: int = 64

## culture_id -> CultureResource
static var _cultures: Dictionary = {}
static var _installed: bool = false
## Seed every culture derives its own stream from.
static var _world_seed: int = 0


## Register the save provider. Idempotent; safe to call from anywhere that might
## be the first thing to touch the registry.
static func install(world_seed: int = 0) -> void:
	if world_seed != 0:
		_world_seed = world_seed
	if _installed:
		return
	_installed = true
	SaveSystem.register_provider("cultures",
		func(): return save_section(),
		func(section): load_section(section))


## Fetch or mint a culture. Minting is deterministic from the world seed, so a
## replayed campaign produces the same clan personalities.
static func ensure(id: String, name_hint: String = "") -> CultureResource:
	install()
	if id.is_empty():
		id = "culture_default"
	var existing: CultureResource = _cultures.get(id)
	if existing != null:
		existing.ensure_nets()
		# A clan is usually minted implicitly, the first time one of its members
		# is asked what it belongs to, and at that moment nobody has a name for
		# it. When a name does turn up later, take it — otherwise the placeholder
		# is permanent and the raw id is what a player ends up reading.
		if not name_hint.is_empty() and existing.display_name == existing.culture_id:
			existing.display_name = name_hint
		return existing
	var culture := CultureResource.create(id, _world_seed, name_hint)
	_cultures[id] = culture
	_prune()
	return culture


## The culture a creature belongs to.
##
## `identity.culture_id` empty means "fall through to the lineage", so in Stage 1
## every bloodline founds its own culture and there is no new content to author.
## Stage 3 starts setting it explicitly when clans merge and split, and needs no
## schema change to do it.
static func culture_for(creature: Node) -> CultureResource:
	if creature == null or creature.identity == null:
		return ensure("culture_default")
	var id := String(creature.identity.culture_id)
	if id.is_empty():
		id = String(creature.identity.lineage_id)
	return ensure(id)


static func has(id: String) -> bool:
	return _cultures.has(id)


static func get_culture(id: String) -> CultureResource:
	return _cultures.get(id)


static func all() -> Array:
	return _cultures.values()


static func ids() -> Array:
	return _cultures.keys()


static func count() -> int:
	return _cultures.size()


## A child was born. Tracks the clan's high-water generation, which is what makes
## a generation advance something the clan does by living rather than something a
## system schedules.
static func note_birth(culture_id: String, child_generation: int) -> void:
	var culture := ensure(String(culture_id))
	culture.note_birth(child_generation)
	if culture.generation_advance_due():
		culture.advance_generation()
		# The same boundary decides both inheritances. The network keeps a
		# fraction of what it drifted toward; the tree keeps only what the clan
		# is numerous enough to carry. One is automatic and one is brutal, and
		# they turn over together because they are the same generation.
		NeuronalTree.for_clan(culture.culture_id).advance_generation(
			float(culture.member_count))


## Split a culture in two, giving the child everything the parent knows today.
##
## THE MOMENT A PEOPLE BECOMES TWO PEOPLES. Up to here a culture could only ever
## be one shared brain per clan id, which meant a colony left behind on another
## world for nine years came back thinking exactly what the crew that flew away
## thought — the two halves stayed in telepathic contact across interstellar
## distance. `drift` existed to make separated clans diverge and had nothing to
## separate.
##
## The child starts as an exact copy and then goes its own way: its RNG is seeded
## from the child id, not the parent's, so the drift it accumulates is its own
## and is reproducible from the campaign seed.
##
## Returns the child. Idempotent — forking onto an id that already exists hands
## back the existing culture rather than overwriting a people who already have a
## history.
static func fork(parent_id: String, child_id: String, reason: String = "split") -> CultureResource:
	install()
	var parent: CultureResource = _cultures.get(parent_id)
	if parent == null or child_id.is_empty() or child_id == parent_id:
		return ensure(child_id if not child_id.is_empty() else parent_id)
	if _cultures.has(child_id):
		return _cultures[child_id]

	parent.ensure_nets()
	var child := CultureResource.create(child_id, _world_seed,
		parent.display_name + " (apart)")
	child.live.copy_from(parent.live)
	child.locked.copy_from(parent.locked)
	# Inherited history, not inherited membership: who is in the new clan is
	# decided by whoever actually went with it.
	child.generation = parent.generation
	child.high_water_generation = parent.high_water_generation
	child.learning_rate = parent.learning_rate
	child.inheritance_fraction = parent.inheritance_fraction
	child.drift = parent.drift
	child.reward_baseline = parent.reward_baseline
	child.reward_variance = parent.reward_variance
	child.member_count = 0

	_cultures[child_id] = child
	# What the lineage understands goes with them; what it was mid-way through
	# working out does not.
	NeuronalTree.fork(parent_id, child_id)
	EventBus.culture_forked.emit(parent_id, child_id, reason)
	_prune()
	return child


## Blend `from_id`'s culture into `into_id`, weighted by how many people each
## side brings. Two clans that meet again after a long separation do not simply
## pick one accent — the larger group dominates, but not completely.
##
## The absorbed culture is left in the registry as a record rather than deleted:
## a creature still carrying its id must not find itself with no brain at all.
static func merge(into_id: String, from_id: String) -> bool:
	var into: CultureResource = _cultures.get(into_id)
	var from: CultureResource = _cultures.get(from_id)
	if into == null or from == null or into == from:
		return false
	into.ensure_nets()
	from.ensure_nets()
	if not into.live.same_shape_as(from.live):
		push_warning("CultureRegistry.merge: '%s' and '%s' have different brains; kept apart."
			% [into_id, from_id])
		return false

	var mine := maxf(1.0, float(into.member_count))
	var theirs := maxf(1.0, float(from.member_count))
	var share := theirs / (mine + theirs)
	CultureResource.blend_nets(into.live, from.live, share)
	CultureResource.blend_nets(into.locked, from.locked, share)
	into.member_count += from.member_count
	into.generation = maxi(into.generation, from.generation)
	into.high_water_generation = maxi(into.high_water_generation, from.high_water_generation)
	EventBus.culture_forked.emit(from_id, into_id, "merge")
	return true


## Drop the least-recently-active cultures once the cap is exceeded. Kept simple:
## a culture with no living members and no learning is a record, not a brain.
static func _prune() -> void:
	if _cultures.size() <= MAX_CULTURES:
		return
	var ranked: Array = _cultures.values()
	ranked.sort_custom(func(a, b):
		return (a as CultureResource).live.applies < (b as CultureResource).live.applies)
	var excess: int = _cultures.size() - MAX_CULTURES
	for i in excess:
		var victim: CultureResource = ranked[i]
		if victim.member_count > 0:
			continue
		_cultures.erase(victim.culture_id)


## Wipe the registry. Tests only — a campaign never does this.
static func reset(world_seed: int = 0) -> void:
	_cultures.clear()
	_world_seed = world_seed


static func set_world_seed(world_seed: int) -> void:
	_world_seed = world_seed


# --- Persistence --------------------------------------------------------------

static func save_section() -> Dictionary:
	var out: Dictionary = {}
	for id in _cultures:
		out[id] = (_cultures[id] as CultureResource).to_dict()
	return {"world_seed": AetherTypes.i64_to_json(_world_seed), "cultures": out}


static func load_section(section: Dictionary) -> void:
	_world_seed = AetherTypes.i64_from_json(section.get("world_seed", "0"))
	var stored: Dictionary = section.get("cultures", {})
	_cultures.clear()
	for id in stored:
		var culture := CultureResource.from_dict(stored[id])
		culture.ensure_nets()
		_cultures[String(id)] = culture


static func debug_summary() -> String:
	var applies: int = 0
	var generations: int = 0
	for c in _cultures.values():
		applies += (c as CultureResource).live.applies
		generations = maxi(generations, (c as CultureResource).generation)
	return "CultureRegistry: %d culture(s), %d total updates, deepest generation %d" % [
		_cultures.size(), applies, generations]
