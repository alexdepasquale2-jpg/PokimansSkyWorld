extends Resource
class_name PlanetSummaryResource

## The compressed, persistent state of a planet the player has visited.
##
## PlanetSeedResource says what the planet *is* (regenerable from a seed).
## PlanetSummaryResource says what the player *did to it* and what is still
## happening there — the irreducible delta that cannot be regenerated.
##
## Everything here must stay small. The player will visit hundreds of worlds
## over a campaign and every one of these stays resident for the star map.
## Left-behind creatures are stored as compact dictionaries, not scenes, and
## are only re-inflated into real creatures on landing.

const SCHEMA_VERSION: int = 1

@export var schema_version: int = SCHEMA_VERSION

@export var planet_id: String = ""
@export var seed: int = 0
@export var display_name: String = ""

## Tick of first landing and of the most recent departure. The gap between
## `last_departure_tick` and "now" is what the catch-up simulation integrates
## over when the player returns.
@export var first_visit_tick: int = 0
@export var last_departure_tick: int = 0
@export var total_ticks_present: int = 0
@export var visit_count: int = 0

## Set true once the player has actually landed (as opposed to merely scanned).
@export var visited: bool = false

## Creatures and colonists left behind, in cold storage.
## Each entry is the full serialized creature dict (identity + genome +
## epigenetics + archetype + minimal vitals). Re-inflated on landing.
@export var resident_creatures: Array = []

## Structures the player built, as a compact tile list:
##   { "cell": [x, y], "structure_id": String, "state": Dictionary }
@export var structures: Array = []

## Terrain the player permanently altered (mined, cleared, terraformed).
## Sparse overlay applied on top of regenerated terrain — key "x,y" -> tile id.
@export var terrain_overrides: Dictionary = {}

## Resource nodes drained: node_key -> fraction remaining 0..1. Anything absent
## is still full, so a lightly-used world costs almost nothing to store.
@export var resource_depletion: Dictionary = {}

## Ruins/anomalies already looted or resolved, so they do not respawn.
@export var cleared_sites: Array[String] = []

## What the player has learned about this world. Drives fog-of-knowledge in the
## star map and gates "you already know this planet is lethal" warnings.
@export var discovered_biomes: Array[String] = []
@export var discovered_resources: Array[String] = []
@export var known_hazards: Array[String] = []
@export var scan_level: int = 0                   ## 0 unscanned .. 3 fully surveyed

## Ongoing processes that keep running while the player is away, integrated on
## return rather than simulated live: { "kind": String, "params": Dictionary }.
## Examples: a feral population growing, a fire spreading, crops maturing.
@export var pending_processes: Array = []

## Story-layer memory attached to this world specifically, so returning feels
## like returning: { "tick": int, "text": String, "uid": String }.
@export var notable_events: Array = []

## Cached headline for the star map, e.g. "3 residents · frozen · Vess line".
@export var summary_line: String = ""


func resident_count() -> int:
	return resident_creatures.size()


func days_since_departure(current_tick: int, ticks_per_day: float) -> float:
	if ticks_per_day <= 0.0:
		return 0.0
	return maxf(0.0, float(current_tick - last_departure_tick) / ticks_per_day)


func add_resident(creature_dict: Dictionary) -> void:
	resident_creatures.append(creature_dict)


func take_residents() -> Array:
	var out := resident_creatures.duplicate(true)
	resident_creatures.clear()
	return out


func note_event(tick: int, text: String, uid: String = "") -> void:
	notable_events.append({"tick": tick, "text": text, "uid": uid})
	# Hard cap: a world the player keeps returning to must not grow unbounded.
	if notable_events.size() > 60:
		notable_events = notable_events.slice(notable_events.size() - 60)


func mark_discovered(biome_id: String) -> void:
	if not discovered_biomes.has(biome_id):
		discovered_biomes.append(biome_id)


func to_dict() -> Dictionary:
	return {
		"schema_version": schema_version,
		"planet_id": planet_id,
		"seed": AetherTypes.i64_to_json(seed),  ## 64-bit; see AetherTypes.i64_to_json
		"display_name": display_name,
		"first_visit_tick": first_visit_tick,
		"last_departure_tick": last_departure_tick,
		"total_ticks_present": total_ticks_present,
		"visit_count": visit_count,
		"visited": visited,
		"resident_creatures": resident_creatures.duplicate(true),
		"structures": structures.duplicate(true),
		"terrain_overrides": terrain_overrides.duplicate(true),
		"resource_depletion": resource_depletion.duplicate(true),
		"cleared_sites": cleared_sites.duplicate(),
		"discovered_biomes": discovered_biomes.duplicate(),
		"discovered_resources": discovered_resources.duplicate(),
		"known_hazards": known_hazards.duplicate(),
		"scan_level": scan_level,
		"pending_processes": pending_processes.duplicate(true),
		"notable_events": notable_events.duplicate(true),
		"summary_line": summary_line,
	}


static func from_dict(d: Dictionary) -> PlanetSummaryResource:
	var s := PlanetSummaryResource.new()
	s.schema_version = int(d.get("schema_version", 1))
	s.planet_id = String(d.get("planet_id", ""))
	s.seed = AetherTypes.i64_from_json(d.get("seed", 0))
	s.display_name = String(d.get("display_name", ""))
	s.first_visit_tick = int(d.get("first_visit_tick", 0))
	s.last_departure_tick = int(d.get("last_departure_tick", 0))
	s.total_ticks_present = int(d.get("total_ticks_present", 0))
	s.visit_count = int(d.get("visit_count", 0))
	s.visited = bool(d.get("visited", false))
	s.resident_creatures = d.get("resident_creatures", []).duplicate(true)
	s.structures = d.get("structures", []).duplicate(true)
	s.terrain_overrides = d.get("terrain_overrides", {}).duplicate(true)
	s.resource_depletion = d.get("resource_depletion", {}).duplicate(true)
	s.pending_processes = d.get("pending_processes", []).duplicate(true)
	s.notable_events = d.get("notable_events", []).duplicate(true)
	s.scan_level = int(d.get("scan_level", 0))
	s.summary_line = String(d.get("summary_line", ""))
	for x in d.get("cleared_sites", []):
		s.cleared_sites.append(String(x))
	for x in d.get("discovered_biomes", []):
		s.discovered_biomes.append(String(x))
	for x in d.get("discovered_resources", []):
		s.discovered_resources.append(String(x))
	for x in d.get("known_hazards", []):
		s.known_hazards.append(String(x))
	return s
