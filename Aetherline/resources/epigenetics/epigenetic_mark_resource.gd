extends Resource
class_name EpigeneticMarkResource

## A single epigenetic mark: something life did to this creature that changed
## how its genes are *expressed*, without changing the genes themselves.
##
## The distinction is the whole point of the system. The genome is what the
## creature could be; the epigenetic profile is what its history made of it.
## A mark never edits a GenomeResource — it is applied on top during phenotype
## resolution, and it can fade.

## Instance-unique id. Distinct from `definition_id` because a creature can
## carry several marks of the same kind from different episodes.
@export var uid: StringName = &""

## Catalog key of the mark type, e.g. &"epi_cold_hardening".
@export var definition_id: StringName = &""

@export var display_name: String = ""
@export_multiline var description: String = ""

## What the mark acts on. Exactly one of these is used:
##  - target_trait: adjusts a resolved phenotype trait (the common case)
##  - target_locus: silences/enhances one specific gene's contribution
@export var target_trait: StringName = &""
@export var target_locus: StringName = &""

@export var effect: AetherTypes.EpiEffect = AetherTypes.EpiEffect.ADD

## Full-strength effect size. Interpretation depends on `effect`:
## ADD = offset, MULTIPLY = (1 + magnitude), SILENCE/ENHANCE = blend weight
## toward/away from the trait baseline, UNLOCK = ignored (presence is enough).
@export var magnitude: float = 0.0

## Current intensity, 0..1. Scales `magnitude`. Rises with repeated exposure,
## falls with decay. This is the dial the player can actually feel moving.
@export_range(0.0, 1.0, 0.001) var strength: float = 0.0

## Resistance to decay, 0..1. 1.0 means effectively permanent. Trauma and
## research-induced marks sit high; casual dietary marks sit low.
@export_range(0.0, 1.0, 0.001) var stability: float = 0.5

## Probability (0..1) that this mark passes to offspring at conception.
## Rises with `exposure_count` — the system's core promise is that *sustained*
## conditions eventually start writing themselves into the bloodline.
@export_range(0.0, 1.0, 0.001) var heritability_chance: float = 0.0

@export var source: AetherTypes.EpiSource = AetherTypes.EpiSource.ENVIRONMENT

## How many distinct reinforcement episodes this mark has survived. Drives
## both strength growth and heritability growth.
@export var exposure_count: int = 0

## How many generations this mark has already been passed down. Marks that
## have travelled several generations are narratively precious — the story
## layer treats them as lineage traits, not accidents.
@export var inherited_depth: int = 0

## Provenance, for the story layer: "acquired in the ash wastes of Kel-9".
@export var origin_planet_id: String = ""
@export var origin_tick: int = 0

## Free-form tags for archetype and story queries, e.g. [&"trauma", &"cold"].
@export var tags: Array[StringName] = []


## Effect size actually applied right now.
func effective_magnitude() -> float:
	return magnitude * strength


func is_expired() -> bool:
	return strength <= 0.001


## Another exposure episode. Strength climbs toward 1.0 with diminishing
## returns, and heritability creeps up — but only ever asymptotically toward
## `ceiling`, so nothing becomes fully heritable by accident. Research is what
## raises the ceiling later.
func reinforce(amount: float, heritability_gain: float = 0.01, ceiling: float = 0.6) -> void:
	exposure_count += 1
	strength = clampf(strength + amount * (1.0 - strength), 0.0, 1.0)
	if heritability_chance < ceiling:
		heritability_chance = minf(heritability_chance + heritability_gain, ceiling)


## Passive fade. `delta_days` lets the caller batch-decay dormant creatures on
## another planet without ticking them every frame.
func decay(delta_days: float, base_rate: float = 0.02) -> void:
	var rate := base_rate * (1.0 - stability)
	strength = maxf(strength - rate * delta_days, 0.0)


func has_tag(tag: StringName) -> bool:
	return tags.has(tag)


func to_dict() -> Dictionary:
	return {
		"uid": String(uid),
		"definition_id": String(definition_id),
		"display_name": display_name,
		"description": description,
		"target_trait": String(target_trait),
		"target_locus": String(target_locus),
		"effect": AetherTypes.enum_to_key(AetherTypes.EpiEffect, effect),
		"magnitude": magnitude,
		"strength": strength,
		"stability": stability,
		"heritability_chance": heritability_chance,
		"source": AetherTypes.enum_to_key(AetherTypes.EpiSource, source),
		"exposure_count": exposure_count,
		"inherited_depth": inherited_depth,
		"origin_planet_id": origin_planet_id,
		"origin_tick": origin_tick,
		"tags": tags.map(func(t): return String(t)),
	}


static func from_dict(d: Dictionary) -> EpigeneticMarkResource:
	var m := EpigeneticMarkResource.new()
	m.uid = StringName(d.get("uid", ""))
	# Catalog files key entries by "id" (GenomeDB's convention for every
	# catalog); per-creature saves carry the explicit "definition_id". Accept
	# both so one from_dict serves templates and instances alike.
	m.definition_id = StringName(d.get("definition_id", d.get("id", "")))
	m.display_name = String(d.get("display_name", ""))
	m.description = String(d.get("description", ""))
	m.target_trait = StringName(d.get("target_trait", ""))
	m.target_locus = StringName(d.get("target_locus", ""))
	m.effect = AetherTypes.key_to_enum(
		AetherTypes.EpiEffect, String(d.get("effect", "ADD")))
	m.magnitude = float(d.get("magnitude", 0.0))
	m.strength = float(d.get("strength", 0.0))
	m.stability = float(d.get("stability", 0.5))
	m.heritability_chance = float(d.get("heritability_chance", 0.0))
	m.source = AetherTypes.key_to_enum(
		AetherTypes.EpiSource, String(d.get("source", "ENVIRONMENT")))
	m.exposure_count = int(d.get("exposure_count", 0))
	m.inherited_depth = int(d.get("inherited_depth", 0))
	m.origin_planet_id = String(d.get("origin_planet_id", ""))
	m.origin_tick = int(d.get("origin_tick", 0))
	for t in d.get("tags", []):
		m.tags.append(StringName(t))
	return m


func clone() -> EpigeneticMarkResource:
	return EpigeneticMarkResource.from_dict(to_dict())
