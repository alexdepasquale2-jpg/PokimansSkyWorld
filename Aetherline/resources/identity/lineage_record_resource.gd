extends Resource
class_name LineageRecordResource

## The permanent record of a bloodline.
##
## Lineages are the game's memory. Individual creatures are unloaded, archived,
## and die; the lineage record persists across every planet the player ever
## visits and is what the endgame-less progression is actually measured in.
##
## MEMORY DISCIPLINE: this grows monotonically over a long campaign, so it
## stores *summaries and pointers*, never live creature objects. Notable events
## are capped; older ones are folded into aggregate counters.

const SCHEMA_VERSION: int = 1
const MAX_NOTABLE_EVENTS: int = 200

@export var schema_version: int = SCHEMA_VERSION

@export var lineage_id: StringName = &""

## Bloodline name — usually derived from the founder ("Line of Vess").
@export var display_name: String = ""

@export var species_id: StringName = &"aether_base"

## Founder identity.
@export var founder_uid: String = ""
@export var founder_name: String = ""
@export var founding_planet_id: String = ""
@export var founding_planet_name: String = ""
@export var founding_tick: int = 0

## Every uid ever born into this line, in birth order. Strings only — the
## bodies live elsewhere (or nowhere).
@export var member_uids: Array[String] = []

## Subset currently alive. Kept separately so "is this line extinct?" is O(1).
@export var living_uids: Array[String] = []

## Deepest generation reached.
@export var max_generation: int = 0

## Aggregate counters — these absorb history once individual events are
## pruned, so the record never lies even after compaction.
## e.g. { "births": 41, "deaths": 33, "archetypes_crystallized": 6 }
@export var totals: Dictionary = {}

## Capped list of notable moments. Each entry:
##   { "tick": int, "planet_id": String, "uid": String, "kind": String,
##     "text": String, "weight": float }
@export var notable_events: Array = []

## Alleles that define this bloodline's character — computed periodically as
## the alleles most over-represented relative to the founding population.
## { allele_id: String -> frequency: float }
@export var signature_alleles: Dictionary = {}

## Archetypes this line has produced, with counts: { archetype_id -> int }.
@export var archetype_history: Dictionary = {}

## Epigenetic marks that have travelled 2+ generations in this line —
## the line's "inherited habits". { definition_id -> deepest inherited_depth }
@export var entrenched_marks: Dictionary = {}

## Planets this bloodline has lived on, in order of first arrival.
@export var planets_inhabited: Array[String] = []

## Player-facing legacy score. Recomputed by the progression system (Phase 6);
## cached here so lineage UI does not have to recompute for every row.
@export var legacy_score: float = 0.0


func is_extinct() -> bool:
	return living_uids.is_empty() and not member_uids.is_empty()


## uid -> { name, generation, parents: [uid], born, died, cause }
##
## WHO DESCENDS FROM WHOM. The game is named for bloodlines and did not keep one:
## `member_uids` is a flat list and `max_generation` is a number, so a lineage
## knew how many people it had and how deep it ran and nothing whatsoever about
## its shape. Meanwhile every creature has carried `identity.parent_uids` since
## Phase 1 and `BreedingSystem` has filled it in on every conception — the
## parentage existed on the individuals and was thrown away the moment it
## reached the record that exists to remember them.
##
## Kept as a flat map rather than nested children, because a lineage is a graph
## (two parents, and a founder pair recurs) and nesting would force a choice of
## which parent owns a child. Drawing walks it either direction.
@export var descent: Dictionary = {}

## Beyond this the oldest generations are pruned when the record is compacted.
## A campaign that ran for hours should not carry a thousand ancestors into
## every save, and the shape of a bloodline is legible from its recent depth.
const MAX_DESCENT: int = 400


## `parent_names` is not redundant with `parents`. Offspring join the GESTATING
## parent's line, because the cytoplasmic chromosome does, so the siring parent
## is frequently a member of some other bloodline entirely and has no node in
## this record. Without their name the tree draws every child with one parent and
## the screen quietly asserts a kind of parthenogenesis the simulation does not
## do. The link is drawn where both are here; the name is said either way.
func record_birth(uid: String, generation: int, name: String = "",
		parents: Array = [], tick: int = -1, parent_names: Array = []) -> void:
	if not member_uids.has(uid):
		member_uids.append(uid)
	if not living_uids.has(uid):
		living_uids.append(uid)
	max_generation = maxi(max_generation, generation)
	bump("births")

	var known: Array[String] = []
	for parent in parents:
		known.append(String(parent))
	var named: Array[String] = []
	for parent_name in parent_names:
		named.append(String(parent_name))
	descent[uid] = {
		"name": name,
		"generation": generation,
		"parents": known,
		"parent_names": named,
		"born": tick,
		"died": -1,
		"cause": "",
	}
	if descent.size() > MAX_DESCENT:
		_prune_descent()


func record_death(uid: String, cause: String = "", tick: int = -1) -> void:
	living_uids.erase(uid)
	bump("deaths")
	if descent.has(uid):
		var entry: Dictionary = descent[uid]
		entry["died"] = tick
		entry["cause"] = cause


## Whether anyone still alive descends from this one. Used by pruning, and it is
## the question a player asks about an ancestor: did their line go anywhere.
func has_living_descendants(uid: String) -> bool:
	var frontier: Array[String] = [uid]
	var seen := {uid: true}
	while not frontier.is_empty():
		var current: String = frontier.pop_back()
		for other in descent:
			var entry: Dictionary = descent[other]
			if not (entry["parents"] as Array).has(current):
				continue
			if seen.has(other):
				continue
			seen[other] = true
			if int(entry["died"]) < 0:
				return true
			frontier.append(String(other))
	return false


## Drop the shallowest generations first, keeping anyone still alive and anyone
## an surviving line runs through. A bloodline's shape is in its recent depth;
## its earliest founders are named on the record itself and do not need a node.
func _prune_descent() -> void:
	var by_generation: Array = descent.keys()
	by_generation.sort_custom(func(a, b):
		return int(descent[a]["generation"]) < int(descent[b]["generation"]))
	var over := descent.size() - MAX_DESCENT
	for uid in by_generation:
		if over <= 0:
			break
		if living_uids.has(uid) or String(uid) == founder_uid:
			continue
		if has_living_descendants(String(uid)):
			continue
		descent.erase(uid)
		over -= 1


func bump(key: String, amount: float = 1.0) -> void:
	totals[key] = float(totals.get(key, 0.0)) + amount


func total(key: String) -> float:
	return float(totals.get(key, 0.0))


## Append a notable moment. When the cap is hit, the lowest-weight events are
## dropped first — so a line's defining moments survive compaction and its
## routine ones do not.
func add_event(tick: int, planet_id: String, uid: String, kind: String,
		text: String, weight: float = 1.0) -> void:
	notable_events.append({
		"tick": tick, "planet_id": planet_id, "uid": uid,
		"kind": kind, "text": text, "weight": weight,
	})
	bump("events_recorded")
	if notable_events.size() > MAX_NOTABLE_EVENTS:
		notable_events.sort_custom(func(a, b): return float(a["weight"]) > float(b["weight"]))
		notable_events = notable_events.slice(0, MAX_NOTABLE_EVENTS)
		notable_events.sort_custom(func(a, b): return int(a["tick"]) < int(b["tick"]))


func note_archetype(archetype_id: String) -> void:
	archetype_history[archetype_id] = int(archetype_history.get(archetype_id, 0)) + 1


func note_planet(planet_id: String) -> void:
	if not planets_inhabited.has(planet_id):
		planets_inhabited.append(planet_id)


func note_entrenched_mark(definition_id: String, depth: int) -> void:
	entrenched_marks[definition_id] = maxi(int(entrenched_marks.get(definition_id, 0)), depth)


func to_dict() -> Dictionary:
	return {
		"schema_version": schema_version,
		"lineage_id": String(lineage_id),
		"display_name": display_name,
		"species_id": String(species_id),
		"founder_uid": founder_uid,
		"founder_name": founder_name,
		"founding_planet_id": founding_planet_id,
		"founding_planet_name": founding_planet_name,
		"founding_tick": founding_tick,
		"member_uids": member_uids.duplicate(),
		"descent": descent.duplicate(true),
		"living_uids": living_uids.duplicate(),
		"max_generation": max_generation,
		"totals": totals.duplicate(true),
		"notable_events": notable_events.duplicate(true),
		"signature_alleles": signature_alleles.duplicate(true),
		"archetype_history": archetype_history.duplicate(true),
		"entrenched_marks": entrenched_marks.duplicate(true),
		"planets_inhabited": planets_inhabited.duplicate(),
		"legacy_score": legacy_score,
	}


static func from_dict(d: Dictionary) -> LineageRecordResource:
	var r := LineageRecordResource.new()
	r.schema_version = int(d.get("schema_version", 1))
	r.lineage_id = StringName(d.get("lineage_id", ""))
	r.display_name = String(d.get("display_name", ""))
	r.species_id = StringName(d.get("species_id", "aether_base"))
	r.founder_uid = String(d.get("founder_uid", ""))
	r.founder_name = String(d.get("founder_name", ""))
	r.founding_planet_id = String(d.get("founding_planet_id", ""))
	r.founding_planet_name = String(d.get("founding_planet_name", ""))
	r.founding_tick = int(d.get("founding_tick", 0))
	r.max_generation = int(d.get("max_generation", 0))
	r.totals = d.get("totals", {}).duplicate(true)
	r.notable_events = d.get("notable_events", []).duplicate(true)
	r.signature_alleles = d.get("signature_alleles", {}).duplicate(true)
	r.archetype_history = d.get("archetype_history", {}).duplicate(true)
	r.entrenched_marks = d.get("entrenched_marks", {}).duplicate(true)
	r.legacy_score = float(d.get("legacy_score", 0.0))
	for x in d.get("member_uids", []):
		r.member_uids.append(String(x))
	for x in d.get("living_uids", []):
		r.living_uids.append(String(x))
	for x in d.get("planets_inhabited", []):
		r.planets_inhabited.append(String(x))
	return r
