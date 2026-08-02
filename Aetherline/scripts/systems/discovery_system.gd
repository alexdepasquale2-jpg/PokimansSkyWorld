extends RefCounted
class_name DiscoverySystem

## The Aetherdex — the catalog that fills.
##
## This is the loop's connective tissue. Every creature, resource and site you
## scan becomes a permanent entry with YOUR name on it, pays salvage, and
## nudges a completion percentage that never resets. It is the reason to walk
## toward the thing on the ridge instead of past it.
##
## Species identity is derived from the GENOME, not from a species table: two
## animals count as the same species when their defining alleles match. That
## means a mutated line eventually reads as something new — discovery and
## genetics are the same system seen from different ends.

## Loci that define a "species" for catalog purposes. Deliberately the visible,
## structural ones: an animal that looks and moves differently IS different, but
## a different temperament is just a different individual.
const DEFINING_LOCI := ["morph_size", "limb_count", "limb_extremity",
	"integ_pelage", "comb_weapon", "meta_diet"]

const SALVAGE_CREATURE := 8.0
const SALVAGE_RESOURCE := 2.0
const SALVAGE_SITE := 12.0
const SALVAGE_PLANET := 20.0

## species_key -> entry dictionary
var species: Dictionary = {}
## resource_id -> { "first_planet": String, "scans": int }
var resources: Dictionary = {}
## site key -> { "kind": String, "planet": String }
var sites: Dictionary = {}
## planet_id -> { "name": String, "species_found": int, "fully_surveyed": bool }
var planets: Dictionary = {}


## A stable fingerprint for "what kind of animal is this".
static func species_key(genome: GenomeResource) -> String:
	var parts: Array[String] = []
	for locus_id in DEFINING_LOCI:
		var pair := genome.pair_at(locus_id)
		if pair.is_empty():
			continue
		# Sorted so the two strands' order never makes an identical animal
		# read as two different species.
		var alleles := [String(pair[0]), String(pair[1])]
		alleles.sort()
		parts.append("%s=%s" % [locus_id, "/".join(alleles)])
	return "|".join(parts)


## A readable name generated from what the animal actually IS, so the catalog
## reads like a field guide rather than a hash dump.
static func describe_species(genome: GenomeResource) -> String:
	var traits := PhenotypeResolver.express(genome)
	var size := float(traits.get("size", 1.0))
	var size_word := "Greater" if size > 1.4 else ("Lesser" if size < 0.75 else "Common")

	var coat := "Shaggy" if float(traits.get("insulation", 0.0)) > 0.8 \
		else ("Coated" if float(traits.get("insulation", 0.0)) > 0.3 else "Bare")
	var diet := "Predator" if float(traits.get("diet_meat", 0.5)) > 0.7 \
		else ("Grazer" if float(traits.get("diet_plant", 0.5)) > 0.7 else "Forager")
	var limbs := int(round(float(traits.get("limbs", 4.0))))
	var limb_word := {2: "Biped", 4: "Quadruped", 6: "Hexapod"}.get(limbs, "Anomaly")
	return "%s %s %s %s" % [size_word, coat, limb_word, diet]


# --- Scanning ------------------------------------------------------------------------

## Returns { "new": bool, "name": String, "salvage": float, "entry": Dictionary }.
func scan_creature(creature: Creature, planet: PlanetSeedResource, ship: ShipSystem) -> Dictionary:
	var key := species_key(creature.genetics.genome)
	var brand_new := not species.has(key)

	if brand_new:
		species[key] = {
			"key": key,
			"name": describe_species(creature.genetics.genome),
			"discovered_on": planet.display_name,
			"discovered_tick": SimulationBudget.current_tick,
			"sightings": 0,
			"traits": {},
			"tamed": false,
		}
	var entry: Dictionary = species[key]
	entry["sightings"] = int(entry["sightings"]) + 1

	# A better bio-sensor records more about what it sees — the same animal
	# yields a richer entry later, which is a real reason to re-scan.
	var depth := ship.reveal_depth()
	var traits: Dictionary = entry["traits"]
	var resolved := creature.stats.phenotype()
	for key_name in ["size", "mass", "attack_power", "armor", "speed"]:
		traits[key_name] = float(resolved.get(key_name, 0.0))
	if depth >= 2:
		traits["hidden_carriers"] = PhenotypeResolver.hidden_carriers(
			creature.genetics.genome).size()
	if depth >= 3:
		var best := ""
		for archetype_id in creature.archetype.state.progress:
			if creature.archetype.state.get_progress(archetype_id) > 0.3:
				var d: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
				best = d.display_name if d != null else String(archetype_id)
		traits["becoming"] = best

	_note_planet_species(planet)
	return {
		"new": brand_new,
		"name": String(entry["name"]),
		"salvage": SALVAGE_CREATURE if brand_new else 1.0,
		"entry": entry,
	}


func scan_resource(resource_id: String, planet: PlanetSeedResource) -> Dictionary:
	var brand_new := not resources.has(resource_id)
	if brand_new:
		resources[resource_id] = {"first_planet": planet.display_name, "scans": 0}
	resources[resource_id]["scans"] = int(resources[resource_id]["scans"]) + 1
	return {"new": brand_new, "name": resource_id,
		"salvage": SALVAGE_RESOURCE if brand_new else 0.5}


func scan_site(site_key: String, kind: String, planet: PlanetSeedResource) -> Dictionary:
	var brand_new := not sites.has(site_key)
	if brand_new:
		sites[site_key] = {"kind": kind, "planet": planet.display_name}
	return {"new": brand_new, "name": kind,
		"salvage": SALVAGE_SITE if brand_new else 1.0}


func register_planet(planet: PlanetSeedResource) -> bool:
	if planets.has(planet.planet_id):
		return false
	planets[planet.planet_id] = {
		"name": planet.display_name, "species_found": 0, "fully_surveyed": false}
	return true


func _note_planet_species(planet: PlanetSeedResource) -> void:
	if not planets.has(planet.planet_id):
		register_planet(planet)
	var entry: Dictionary = planets[planet.planet_id]
	entry["species_found"] = int(entry["species_found"]) + 1
	if int(entry["species_found"]) >= planet.fauna_species_count:
		entry["fully_surveyed"] = true


func mark_tamed(genome: GenomeResource) -> void:
	var key := species_key(genome)
	if species.has(key):
		species[key]["tamed"] = true


# --- Progress -------------------------------------------------------------------------

func totals() -> Dictionary:
	var tamed := 0
	for key in species:
		if bool(species[key].get("tamed", false)):
			tamed += 1
	return {
		"species": species.size(),
		"tamed": tamed,
		"resources": resources.size(),
		"sites": sites.size(),
		"planets": planets.size(),
	}


func to_dict() -> Dictionary:
	return {"species": species.duplicate(true), "resources": resources.duplicate(true),
		"sites": sites.duplicate(true), "planets": planets.duplicate(true)}


func from_dict(d: Dictionary) -> void:
	species = d.get("species", {}).duplicate(true)
	resources = d.get("resources", {}).duplicate(true)
	sites = d.get("sites", {}).duplicate(true)
	planets = d.get("planets", {}).duplicate(true)
