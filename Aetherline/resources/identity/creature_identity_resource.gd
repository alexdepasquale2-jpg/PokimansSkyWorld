extends Resource
class_name CreatureIdentityResource

## Who a creature *is*, as distinct from what it can do.
##
## This is the narrative anchor. It is the smallest slice of a creature that
## must survive forever — long after the body has been unloaded, archived, or
## died, the identity persists in lineage records and story memory. Keep it
## cheap and never let gameplay state leak in here.

const SCHEMA_VERSION: int = 1

@export var schema_version: int = SCHEMA_VERSION

## Globally unique, permanent. Assigned once at conception and never reused.
@export var uid: StringName = &""

@export var given_name: String = ""

## Earned titles, appended by the StoryDirector: "the Unbroken", "Ashwalker".
## The display name is given_name + the most recent epithet.
@export var epithets: Array[String] = []

## Bloodline this creature belongs to (LineageRecordResource.lineage_id).
@export var lineage_id: StringName = &""

## Which clan's shared culture this creature learns from and contributes to.
##
## Empty means "fall through to lineage_id", so every bloodline founds its own
## culture and Phase 4 needs no new content authored. Stage 3 sets it explicitly
## once clans merge and split — declaring the field now means that costs no
## schema migration then, which is why SCHEMA_VERSION does not move for it
## (from_dict already defaults every missing key).
@export var culture_id: StringName = &""

## Species/schema key. Must match the genome's species_id.
@export var species_id: StringName = &"aether_base"

## True for colonist humans, false for creatures. Both use the same component
## stack — humans simply run a different schema and a richer social model.
@export var is_human: bool = false

## Where and when this creature came into existence.
@export var birth_planet_id: String = ""
@export var birth_planet_name: String = ""
@export var birth_tick: int = 0

## Parent uids: [gamete_a_parent, gamete_b_parent]. Empty for founders and
## wild-caught creatures, which is itself narratively meaningful.
@export var parent_uids: Array[String] = []

## Meioses since the lineage founder. Mirrors GenomeResource.generation but
## survives independently in archived records.
@export var generation: int = 0

## How this creature entered the player's care.
## One of: "founder", "born", "captured", "recruited", "gifted", "hatched".
@export var origin_kind: String = "founder"

## Set when the creature dies. -1 while alive. Dead creatures stay in lineage
## records; the universe remembers.
@export var death_tick: int = -1
@export var death_cause: String = ""
@export var death_planet_id: String = ""

## Portrait/appearance seed, so visuals are stable across save/load even
## before the genetics-driven VisualController is fully built.
@export var appearance_seed: int = 0


func is_alive() -> bool:
	return death_tick < 0


func display_name() -> String:
	if epithets.is_empty():
		return given_name
	return "%s %s" % [given_name, epithets[epithets.size() - 1]]


func full_title() -> String:
	if epithets.is_empty():
		return given_name
	return "%s, %s" % [given_name, ", ".join(epithets)]


func add_epithet(epithet: String) -> void:
	if not epithets.has(epithet):
		epithets.append(epithet)


## Deterministic uid generation. Uses the conception tick plus a counter rather
## than pure randomness so that a replayed simulation produces stable ids.
static func make_uid(tick: int, counter: int, prefix: String = "cr") -> StringName:
	return StringName("%s_%08x_%04x" % [prefix, tick, counter & 0xFFFF])


func to_dict() -> Dictionary:
	return {
		"schema_version": schema_version,
		"uid": String(uid),
		"given_name": given_name,
		"epithets": epithets.duplicate(),
		"lineage_id": String(lineage_id),
		"culture_id": String(culture_id),
		"species_id": String(species_id),
		"is_human": is_human,
		"birth_planet_id": birth_planet_id,
		"birth_planet_name": birth_planet_name,
		"birth_tick": birth_tick,
		"parent_uids": parent_uids.duplicate(),
		"generation": generation,
		"origin_kind": origin_kind,
		"death_tick": death_tick,
		"death_cause": death_cause,
		"death_planet_id": death_planet_id,
		"appearance_seed": AetherTypes.i64_to_json(appearance_seed),
	}


static func from_dict(d: Dictionary) -> CreatureIdentityResource:
	var i := CreatureIdentityResource.new()
	i.schema_version = int(d.get("schema_version", 1))
	i.uid = StringName(d.get("uid", ""))
	i.given_name = String(d.get("given_name", ""))
	i.lineage_id = StringName(d.get("lineage_id", ""))
	i.culture_id = StringName(d.get("culture_id", ""))
	i.species_id = StringName(d.get("species_id", "aether_base"))
	i.is_human = bool(d.get("is_human", false))
	i.birth_planet_id = String(d.get("birth_planet_id", ""))
	i.birth_planet_name = String(d.get("birth_planet_name", ""))
	i.birth_tick = int(d.get("birth_tick", 0))
	i.generation = int(d.get("generation", 0))
	i.origin_kind = String(d.get("origin_kind", "founder"))
	i.death_tick = int(d.get("death_tick", -1))
	i.death_cause = String(d.get("death_cause", ""))
	i.death_planet_id = String(d.get("death_planet_id", ""))
	i.appearance_seed = AetherTypes.i64_from_json(d.get("appearance_seed", 0))
	for e in d.get("epithets", []):
		i.epithets.append(String(e))
	for p in d.get("parent_uids", []):
		i.parent_uids.append(String(p))
	return i


func clone() -> CreatureIdentityResource:
	return CreatureIdentityResource.from_dict(to_dict())
