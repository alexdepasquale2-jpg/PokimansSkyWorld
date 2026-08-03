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
