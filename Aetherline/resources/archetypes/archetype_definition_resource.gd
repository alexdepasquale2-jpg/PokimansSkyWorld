extends Resource
class_name ArchetypeDefinitionResource

## Catalog definition of an archetype — an emergent identity a creature can
## grow into by living a particular kind of life (Guardian, Wanderer, Apex,
## Broken, Oracle, Progenitor...).
##
## Archetypes are NOT classes the player picks. They crystallize out of the
## experience log. The definition here is purely "what pattern of life makes
## this identity", plus "what it means once it lands".

## Stable key, e.g. &"arch_guardian".
@export var id: StringName = &""

@export var display_name: String = ""
@export_multiline var description: String = ""

## Shown when the archetype crystallizes. Supports {name}, {planet}, {lineage}
## placeholders filled by the StoryDirector.
@export_multiline var crystallization_text: String = ""

## Conditions read from the creature's experience log. Each entry is:
##   {
##     "metric":    "protect_ally",     # ExperienceLog counter key
##     "comparator": ">=",              # ">=", "<=", ">", "<", "=="
##     "threshold":  25.0,
##     "weight":     1.0,               # share of total progress
##     "required":   true,              # if true, cannot crystallize without it
##   }
## Progress is the weighted fraction of conditions met (partial credit for
## partially-met numeric conditions), so the UI can honestly show "63% Guardian"
## instead of a binary surprise.
@export var conditions: Array = []

## Additional gates checked outside the experience log, e.g.
##   { "min_age_days": 60, "min_generation": 2, "requires_tag": "predator" }
@export var prerequisites: Dictionary = {}

## Ability ids granted on crystallization. Resolved by the ability system later.
@export var granted_abilities: Array[StringName] = []

## Permanent phenotype modifiers applied on crystallization:
##   { trait_key -> { "add": float, "mul": float } }
@export var trait_modifiers: Dictionary = {}

## Utility-AI weight multipliers: { behavior_key -> float }. This is how a
## crystallized archetype "strongly biases AI" without hardcoding behaviour —
## a Guardian simply values protecting far more than it values anything else.
@export var ai_bias: Dictionary = {}

## Only one archetype per exclusivity group may be crystallized at a time.
## Most archetypes share the group &"core", making crystallization a real,
## irreversible choice of identity. Leave empty for non-exclusive archetypes.
@export var exclusivity_group: StringName = &"core"

## Archetypes that can never co-exist with this one, regardless of group.
@export var conflicts_with: Array[StringName] = []

## Story-layer tags, e.g. [&"protector", &"tragic", &"legendary"].
@export var narrative_tags: Array[StringName] = []

## Conditions that can SHATTER this archetype once crystallized (same shape as
## `conditions`). A Guardian that fails catastrophically enough stops being one
## — and that is one of the best stories the game can tell.
@export var shatter_conditions: Array = []

## Rarity hint for UI and for the story layer's sense of occasion.
@export_range(0.0, 1.0, 0.01) var rarity: float = 0.5


## Weighted progress toward crystallization, 0..1, given a flat metric
## dictionary from the creature's ExperienceComponent.
##
## Evaluation lives in ConditionEval, shared with the story layer — an
## archetype and the event announcing it must never disagree about whether the
## thing happened.
func evaluate_progress(metrics: Dictionary) -> float:
	return ConditionEval.progress(conditions, metrics)


## True only if every `required` condition is fully satisfied.
func required_conditions_met(metrics: Dictionary) -> bool:
	return ConditionEval.required_met(conditions, metrics)


func shatter_progress(metrics: Dictionary) -> float:
	return ConditionEval.progress(shatter_conditions, metrics)


## What still stands between this creature and the archetype, for the readout.
func remaining_requirements(metrics: Dictionary) -> Array:
	return ConditionEval.unmet(conditions, metrics)


func to_dict() -> Dictionary:
	return {
		"id": String(id),
		"display_name": display_name,
		"description": description,
		"crystallization_text": crystallization_text,
		"conditions": conditions.duplicate(true),
		"prerequisites": prerequisites.duplicate(true),
		"granted_abilities": granted_abilities.map(func(a): return String(a)),
		"trait_modifiers": trait_modifiers.duplicate(true),
		"ai_bias": ai_bias.duplicate(true),
		"exclusivity_group": String(exclusivity_group),
		"conflicts_with": conflicts_with.map(func(a): return String(a)),
		"narrative_tags": narrative_tags.map(func(a): return String(a)),
		"shatter_conditions": shatter_conditions.duplicate(true),
		"rarity": rarity,
	}


static func from_dict(d: Dictionary) -> ArchetypeDefinitionResource:
	var a := ArchetypeDefinitionResource.new()
	a.id = StringName(d.get("id", ""))
	a.display_name = String(d.get("display_name", ""))
	a.description = String(d.get("description", ""))
	a.crystallization_text = String(d.get("crystallization_text", ""))
	a.conditions = d.get("conditions", []).duplicate(true)
	a.prerequisites = d.get("prerequisites", {}).duplicate(true)
	a.trait_modifiers = d.get("trait_modifiers", {}).duplicate(true)
	a.ai_bias = d.get("ai_bias", {}).duplicate(true)
	a.exclusivity_group = StringName(d.get("exclusivity_group", "core"))
	a.shatter_conditions = d.get("shatter_conditions", []).duplicate(true)
	a.rarity = float(d.get("rarity", 0.5))
	for x in d.get("granted_abilities", []):
		a.granted_abilities.append(StringName(x))
	for x in d.get("conflicts_with", []):
		a.conflicts_with.append(StringName(x))
	for x in d.get("narrative_tags", []):
		a.narrative_tags.append(StringName(x))
	return a
