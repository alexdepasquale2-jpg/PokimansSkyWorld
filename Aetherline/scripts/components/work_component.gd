extends CreatureComponent
class_name WorkComponent

## Non-combat labour: haul, craft, tend, forage. Ties into experience logging
## (so a working animal can still crystallize Progenitor/Shepherd/etc.) and
## into epigenetics (repeated work leaves a real mark on the body).

const ROLE_TRAIT := {"haul": "haul", "craft": "craft",
	"husbandry": "husbandry", "forage": "forage"}
const ROLE_MARK := {"haul": "epi_toil_callus", "craft": "epi_practised_hands"}
const ROLE_EXPERIENCE := {"haul": "work_completed_haul", "craft": "work_completed_craft",
	"husbandry": "creature_tended", "forage": "forage_success"}

@export var assigned_role: String = ""

## Fraction of a work session's energy cost that still applies while mounted or
## otherwise exempt. Left as a hook for Phase 5 job assignment to use directly.
@export var energy_cost_per_hour: float = 0.03


## One work session. `target` is the cared-for creature for husbandry, unused
## otherwise. Returns the output produced.
func perform(role: String, hours: float, target: Creature = null) -> float:
	if creature == null or hours <= 0.0:
		return 0.0
	var trait_key: String = ROLE_TRAIT.get(role, "")
	var output: float = creature.stats.trait_value(trait_key) * hours if not trait_key.is_empty() else 0.0

	creature.needs.energy = clampf(creature.needs.energy - energy_cost_per_hour * hours, 0.0, 1.0)
	creature.experience.log_event(String(ROLE_EXPERIENCE.get(role, "work_completed")), output)
	creature.stats.mark_dirty()
	EventBus.work_completed.emit(creature.identity.uid, role, output)

	if ROLE_MARK.has(role):
		# Repeated labour, not one session, is what should leave a mark —
		# reinforce() already handles the "takes time to show" curve.
		creature.epigenetics.apply_mark(String(ROLE_MARK[role]), 0.05 * hours)

	if role == "husbandry" and target != null and is_instance_valid(target):
		target.experience.log_event("creature_calmed", 1.0)
		target.epigenetics.apply_mark("epi_herd_bond", 0.06 * hours)
		target.needs.mood = clampf(target.needs.mood + 0.03 * hours, 0.0, 1.0)
		if creature.relationships != null and target.relationships != null:
			creature.relationships.adjust(target.identity.uid, 0.02 * hours, 0.01 * hours)
			target.relationships.adjust(creature.identity.uid, 0.02 * hours, 0.01 * hours)

	return output


func describe() -> Array[String]:
	return ["  role: %s" % (assigned_role if not assigned_role.is_empty() else "(unassigned)")]


func to_dict() -> Dictionary:
	return {"assigned_role": assigned_role}


func from_dict(d: Dictionary) -> void:
	assigned_role = String(d.get("assigned_role", ""))
