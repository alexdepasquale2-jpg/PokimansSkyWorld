extends Resource
class_name PlanetSeedResource

## The complete, deterministic definition of a planet — everything the
## generator needs to rebuild the world byte-identically from one 64-bit seed.
##
## CONTRACT: a PlanetSeedResource is the *only* thing a save needs to store for
## an unvisited planet. Terrain, biomes, resources, hazards and native fauna are
## all regenerated from `seed`, never serialized. Anything the player has
## *changed* lives in PlanetSummaryResource instead.
##
## The derived fields below are cached results of the deterministic pass, kept
## on the resource so UI (star maps, jump menus) can show a planet without
## running the full generator. Phase 3 fills them in; Phase 0 defines the shape.

const SCHEMA_VERSION: int = 1

@export var schema_version: int = SCHEMA_VERSION

## The one true input. Everything else is derivable from this.
@export var seed: int = 0

## Stable string id used as a dictionary key everywhere else in the codebase.
@export var planet_id: String = ""

@export var display_name: String = ""

## Whether the deterministic derivation pass has run and filled the fields
## below. Guards against UI reading garbage from a bare seed.
@export var derived: bool = false


# --- Stellar / orbital --------------------------------------------------------

## Star spectral class: "O","B","A","F","G","K","M", or "X" for exotics
## (neutron, black hole, binary). Drives light, radiation and temperature.
@export var star_class: String = "G"
@export var star_luminosity: float = 1.0          ## Relative to Sol.
@export var orbital_radius_au: float = 1.0
@export var orbital_period_days: float = 365.0
@export var orbital_eccentricity: float = 0.0     ## Drives seasonal extremity.
@export var axial_tilt_deg: float = 23.4          ## Drives seasonal contrast.
@export var rotation_period_hours: float = 24.0   ## Drives day/night pressure.
@export var moon_count: int = 1


# --- Physical -----------------------------------------------------------------

@export var radius_km: float = 6371.0
@export var surface_gravity_g: float = 1.0        ## Epigenetic pressure on frame/strength.
@export var atmosphere_density: float = 1.0       ## 0 = vacuum.
@export var atmosphere_composition: Dictionary = {}  ## { "o2": 0.21, "n2": 0.78, ... }
@export var hydrosphere_fraction: float = 0.7     ## Surface water coverage 0..1.
@export var magnetosphere_strength: float = 1.0   ## Shields from stellar radiation.
@export var tectonic_activity: float = 0.5        ## Quakes, volcanism, mountain relief.


# --- Climate ------------------------------------------------------------------

@export var mean_temperature_c: float = 14.0
@export var temperature_variance: float = 20.0    ## Pole-to-equator spread.
@export var precipitation_base: float = 1.0
@export var wind_severity: float = 0.5


# --- Surface content ----------------------------------------------------------

## biome_id -> relative weight in Voronoi seeding. Empty until derived.
@export var biome_weights: Dictionary = {}

## resource_id -> abundance multiplier.
@export var resource_abundance: Dictionary = {}

## hazard_id -> intensity 0..1 (radiation, toxic bloom, storms, predators).
@export var hazard_profile: Dictionary = {}

## Density of ruins and anomalies per chunk, 0..1.
@export var ruin_density: float = 0.05
@export var anomaly_density: float = 0.02

## Native fauna: how many distinct species to seed, and how far their genomes
## may drift from the base schema. Wild genomes are what keep the player's
## breeding pool from stagnating, so this is a first-class knob.
@export var fauna_species_count: int = 6
@export var fauna_divergence: float = 0.3

## Ambient pressures applied to every creature living here, consumed by the
## epigenetics system: { mark_definition_id -> pressure 0..1 per day }.
## This is the mechanism by which a world writes itself into a bloodline.
@export var epigenetic_pressures: Dictionary = {}

## Multiplier on mutation rate for anything conceived on this world.
@export var mutation_rate_modifier: float = 1.0

## Coarse survivability rating 0..1, for the jump UI. Derived, not authored.
@export var habitability: float = 0.5

## Star-map position. Purely cosmetic/navigational.
@export var galactic_position: Vector2 = Vector2.ZERO


# --- Deterministic helpers ----------------------------------------------------

## A generator-stage-specific RNG. Every stage of the pipeline (climate, biome,
## hazards, fauna) must pull from its own named stream so that changing one
## stage's algorithm cannot shift the output of the others. This is what keeps
## a planet stable across game updates.
func rng_for(stage: String) -> RandomNumberGenerator:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed ^ hash(stage)
	return rng


## Canonical planet id from a seed. Kept short and human-readable so debug
## logs and save files stay inspectable.
static func id_from_seed(s: int) -> String:
	return "pl_%016x" % (s & 0x7FFFFFFFFFFFFFFF)


static func make(s: int) -> PlanetSeedResource:
	var p := PlanetSeedResource.new()
	p.seed = s
	p.planet_id = id_from_seed(s)
	return p


func to_dict() -> Dictionary:
	# Derived fields are serialized for UI speed, but they are reproducible —
	# if a load ever finds them missing, Phase 3's generator can rebuild them.
	return {
		"schema_version": schema_version,
		# Decimal string, not a number — see AetherTypes.i64_to_json. A seed
		# mangled by JSON's double conversion regenerates a different planet.
		"seed": AetherTypes.i64_to_json(seed),
		"planet_id": planet_id,
		"display_name": display_name,
		"derived": derived,
		"star_class": star_class,
		"star_luminosity": star_luminosity,
		"orbital_radius_au": orbital_radius_au,
		"orbital_period_days": orbital_period_days,
		"orbital_eccentricity": orbital_eccentricity,
		"axial_tilt_deg": axial_tilt_deg,
		"rotation_period_hours": rotation_period_hours,
		"moon_count": moon_count,
		"radius_km": radius_km,
		"surface_gravity_g": surface_gravity_g,
		"atmosphere_density": atmosphere_density,
		"atmosphere_composition": atmosphere_composition.duplicate(true),
		"hydrosphere_fraction": hydrosphere_fraction,
		"magnetosphere_strength": magnetosphere_strength,
		"tectonic_activity": tectonic_activity,
		"mean_temperature_c": mean_temperature_c,
		"temperature_variance": temperature_variance,
		"precipitation_base": precipitation_base,
		"wind_severity": wind_severity,
		"biome_weights": biome_weights.duplicate(true),
		"resource_abundance": resource_abundance.duplicate(true),
		"hazard_profile": hazard_profile.duplicate(true),
		"ruin_density": ruin_density,
		"anomaly_density": anomaly_density,
		"fauna_species_count": fauna_species_count,
		"fauna_divergence": fauna_divergence,
		"epigenetic_pressures": epigenetic_pressures.duplicate(true),
		"mutation_rate_modifier": mutation_rate_modifier,
		"habitability": habitability,
		"galactic_position": [galactic_position.x, galactic_position.y],
	}


static func from_dict(d: Dictionary) -> PlanetSeedResource:
	var p := PlanetSeedResource.new()
	p.schema_version = int(d.get("schema_version", 1))
	p.seed = AetherTypes.i64_from_json(d.get("seed", 0))
	p.planet_id = String(d.get("planet_id", id_from_seed(p.seed)))
	p.display_name = String(d.get("display_name", ""))
	p.derived = bool(d.get("derived", false))
	p.star_class = String(d.get("star_class", "G"))
	p.star_luminosity = float(d.get("star_luminosity", 1.0))
	p.orbital_radius_au = float(d.get("orbital_radius_au", 1.0))
	p.orbital_period_days = float(d.get("orbital_period_days", 365.0))
	p.orbital_eccentricity = float(d.get("orbital_eccentricity", 0.0))
	p.axial_tilt_deg = float(d.get("axial_tilt_deg", 23.4))
	p.rotation_period_hours = float(d.get("rotation_period_hours", 24.0))
	p.moon_count = int(d.get("moon_count", 1))
	p.radius_km = float(d.get("radius_km", 6371.0))
	p.surface_gravity_g = float(d.get("surface_gravity_g", 1.0))
	p.atmosphere_density = float(d.get("atmosphere_density", 1.0))
	p.atmosphere_composition = d.get("atmosphere_composition", {}).duplicate(true)
	p.hydrosphere_fraction = float(d.get("hydrosphere_fraction", 0.7))
	p.magnetosphere_strength = float(d.get("magnetosphere_strength", 1.0))
	p.tectonic_activity = float(d.get("tectonic_activity", 0.5))
	p.mean_temperature_c = float(d.get("mean_temperature_c", 14.0))
	p.temperature_variance = float(d.get("temperature_variance", 20.0))
	p.precipitation_base = float(d.get("precipitation_base", 1.0))
	p.wind_severity = float(d.get("wind_severity", 0.5))
	p.biome_weights = d.get("biome_weights", {}).duplicate(true)
	p.resource_abundance = d.get("resource_abundance", {}).duplicate(true)
	p.hazard_profile = d.get("hazard_profile", {}).duplicate(true)
	p.ruin_density = float(d.get("ruin_density", 0.05))
	p.anomaly_density = float(d.get("anomaly_density", 0.02))
	p.fauna_species_count = int(d.get("fauna_species_count", 6))
	p.fauna_divergence = float(d.get("fauna_divergence", 0.3))
	p.epigenetic_pressures = d.get("epigenetic_pressures", {}).duplicate(true)
	p.mutation_rate_modifier = float(d.get("mutation_rate_modifier", 1.0))
	p.habitability = float(d.get("habitability", 0.5))
	var gp: Array = d.get("galactic_position", [0.0, 0.0])
	p.galactic_position = Vector2(float(gp[0]), float(gp[1]))
	return p
