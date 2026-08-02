extends Resource
class_name ArchetypeStateResource

## Per-creature archetype progress and crystallization record.
##
## Owned by ArchetypeComponent. Every creature tracks progress toward *many*
## archetypes simultaneously; at most one per exclusivity group crystallizes.

const SCHEMA_VERSION: int = 1

@export var schema_version: int = SCHEMA_VERSION

## archetype_id (String) -> progress 0..1
@export var progress: Dictionary = {}

## archetype_id (String) -> AetherTypes.ArchetypeStage name (String).
## Stored as names so inserting a stage later cannot corrupt old saves.
@export var stages: Dictionary = {}

## exclusivity_group (String) -> crystallized archetype_id (String)
@export var crystallized: Dictionary = {}

## archetype_id (String) -> in-game tick of crystallization
@export var crystallized_at: Dictionary = {}

## Archetypes that were crystallized and later shattered. These are kept
## forever: "the Guardian who broke" is a better story than "not a Guardian".
@export var shattered: Array[String] = []

## Abilities currently granted by crystallized archetypes.
@export var granted_abilities: Array[String] = []


# --- Progress -----------------------------------------------------------------

func get_progress(archetype_id) -> float:
	return float(progress.get(String(archetype_id), 0.0))


## Records progress and advances the display stage. Returns true if the stage
## changed, so callers can fire a signal without polling.
func set_progress(archetype_id, value: float) -> bool:
	var key := String(archetype_id)
	progress[key] = clampf(value, 0.0, 1.0)
	var old_stage := String(stages.get(key, "DORMANT"))
	var new_stage := _stage_for(progress[key], old_stage)
	stages[key] = new_stage
	return new_stage != old_stage


func _stage_for(p: float, current: String) -> String:
	# CRYSTALLIZED and SHATTERED are terminal — progress no longer downgrades them.
	if current == "CRYSTALLIZED" or current == "SHATTERED":
		return current
	if p >= 0.5:
		return "EMERGENT"
	if p >= 0.15:
		return "STIRRING"
	return "DORMANT"


func stage_of(archetype_id) -> AetherTypes.ArchetypeStage:
	return AetherTypes.key_to_enum(
		AetherTypes.ArchetypeStage, String(stages.get(String(archetype_id), "DORMANT")))


# --- Crystallization ----------------------------------------------------------

func is_crystallized(archetype_id) -> bool:
	return String(stages.get(String(archetype_id), "")) == "CRYSTALLIZED"


func crystallized_in_group(group) -> String:
	return String(crystallized.get(String(group), ""))


func crystallize(archetype_id, group, tick: int, abilities: Array) -> void:
	var key := String(archetype_id)
	progress[key] = 1.0
	stages[key] = "CRYSTALLIZED"
	crystallized[String(group)] = key
	crystallized_at[key] = tick
	for ability in abilities:
		var a := String(ability)
		if not granted_abilities.has(a):
			granted_abilities.append(a)


func shatter(archetype_id, group, abilities: Array) -> void:
	var key := String(archetype_id)
	stages[key] = "SHATTERED"
	if not shattered.has(key):
		shattered.append(key)
	if String(crystallized.get(String(group), "")) == key:
		crystallized.erase(String(group))
	for ability in abilities:
		granted_abilities.erase(String(ability))


## All currently-crystallized archetype ids across every group.
func active_archetypes() -> Array:
	return crystallized.values()


func has_any_archetype() -> bool:
	return not crystallized.is_empty()


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"schema_version": schema_version,
		"progress": progress.duplicate(true),
		"stages": stages.duplicate(true),
		"crystallized": crystallized.duplicate(true),
		"crystallized_at": crystallized_at.duplicate(true),
		"shattered": shattered.duplicate(),
		"granted_abilities": granted_abilities.duplicate(),
	}


static func from_dict(d: Dictionary) -> ArchetypeStateResource:
	var s := ArchetypeStateResource.new()
	s.schema_version = int(d.get("schema_version", 1))
	s.progress = d.get("progress", {}).duplicate(true)
	s.stages = d.get("stages", {}).duplicate(true)
	s.crystallized = d.get("crystallized", {}).duplicate(true)
	s.crystallized_at = d.get("crystallized_at", {}).duplicate(true)
	for x in d.get("shattered", []):
		s.shattered.append(String(x))
	for x in d.get("granted_abilities", []):
		s.granted_abilities.append(String(x))
	return s


func clone() -> ArchetypeStateResource:
	return ArchetypeStateResource.from_dict(to_dict())
