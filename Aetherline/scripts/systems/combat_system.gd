extends RefCounted
class_name CombatSystem

## Stateless combat resolution. Reads only the resolved phenotype (Stats),
## so a creature fights as what its genes+life+archetype made it, never as raw
## genome. All randomness goes through the caller's RNG for reproducibility.

## Single attack. Returns {hit, damage, killed}.
static func resolve_attack(attacker: Creature, defender: Creature,
		rng: RandomNumberGenerator) -> Dictionary:
	if defender.stats.hp <= 0.0:
		return {"hit": false, "damage": 0.0, "killed": false}

	var a := attacker.stats.derived()
	var d := defender.stats.derived()
	var pierce := attacker.stats.trait_value(&"armor_pierce")
	var venom := attacker.stats.trait_value(&"venom")
	var evasion := defender.stats.trait_value(&"evasion")
	var focus := attacker.stats.trait_value(&"perception")

	var hit_chance := clampf(0.85 - evasion * 0.5 + focus * 0.05, 0.15, 0.97)
	if rng.randf() > hit_chance:
		return {"hit": false, "damage": 0.0, "killed": false}

	var effective_defense := maxf(0.0, float(d["defense"]) - pierce * 8.0)
	var raw := maxf(1.0, float(a["attack_power"]) - effective_defense * 0.5)
	var damage: float = raw * (1.0 + venom * 0.4) * rng.randf_range(0.85, 1.15)

	defender.stats.hp = maxf(0.0, defender.stats.hp - damage)

	# A blow that would kill only kills the fragile. Everything else collapses
	# and can be recovered — see StatsComponent.resolve_mortal_blow.
	var killed := false
	var downed := false
	if defender.stats.hp <= 0.0:
		killed = defender.stats.resolve_mortal_blow()
		downed = not killed
	return {"hit": true, "damage": damage, "killed": killed, "downed": downed}


## Whichever creature is faster (attack_speed trait) strikes first; if that
## kills the other, no retaliation. Logs experience and fires bus signals so
## the archetype/story layers see combat the same way anything else does.
static func fight_round(a: Creature, b: Creature, rng: RandomNumberGenerator) -> Array:
	var order := [a, b] if a.stats.trait_value(&"attack_speed") \
		>= b.stats.trait_value(&"attack_speed") else [b, a]
	var log: Array = []
	for i in 2:
		var attacker: Creature = order[i]
		var defender: Creature = order[1 - i]
		if attacker.stats.hp <= 0.0 or defender.stats.hp <= 0.0:
			break
		var pre := defender.stats.hp_fraction()
		var result := resolve_attack(attacker, defender, rng)
		if not result["hit"]:
			log.append(result)
			continue

		attacker.experience.log_event("combat_hit", 1.0)
		defender.experience.log_event("damage_taken", float(result["damage"]))
		EventBus.creature_damaged.emit(defender.identity.uid, float(result["damage"]),
			attacker.identity.uid)

		var post := defender.stats.hp_fraction()
		if pre >= 0.15 and post < 0.15 and post > 0.0:
			defender.experience.log_event("near_death_survived", 1.0)

		if result["killed"]:
			attacker.experience.log_event("kill", 1.0)
			attacker.experience.log_event("combat_win", 1.0)
			defender.experience.log_event("combat_loss", 1.0)
			EventBus.creature_died.emit(defender.identity.uid, "combat", SimulationBudget.current_tick)
			EventBus.combat_ended.emit([String(attacker.identity.uid)], [String(defender.identity.uid)])
		log.append(result)
	return log


## Attack `primary_target`, but let a Guardian-biased ally intercept. This is
## the mechanism that feeds protect_ally/damage_absorbed_for_ally — combat is
## where the Guardian archetype actually earns itself.
static func attack_with_protection(attacker: Creature, primary_target: Creature,
		allies: Array, rng: RandomNumberGenerator) -> Dictionary:
	var actual := primary_target
	for entry in allies:
		var ally: Creature = entry
		if ally == primary_target or ally.stats.hp <= 0.0:
			continue
		var bias := 1.0
		if ally.archetype != null:
			bias = float(ally.archetype.ai_bias().get("protect", 1.0))
		if bias > 1.5 and rng.randf() < 0.6:
			actual = ally
			ally.experience.log_event("protect_ally", 1.0)
			EventBus.creature_protected_ally.emit(ally.identity.uid, primary_target.identity.uid)
			if ally.relationships != null and primary_target.relationships != null:
				ally.relationships.adjust(primary_target.identity.uid, 0.05, 0.03)
				primary_target.relationships.adjust(ally.identity.uid, 0.08, 0.05)
			break

	var result := resolve_attack(attacker, actual, rng)
	if bool(result["hit"]):
		attacker.experience.log_event("combat_hit", 1.0)
		actual.experience.log_event("damage_taken", float(result["damage"]))
		if actual != primary_target:
			actual.experience.log_event("damage_absorbed_for_ally", float(result["damage"]))
		if bool(result["killed"]):
			attacker.experience.log_event("kill", 1.0)
			attacker.experience.log_event("combat_win", 1.0)
			actual.experience.log_event("combat_loss", 1.0)
			EventBus.creature_died.emit(actual.identity.uid, "combat", SimulationBudget.current_tick)
			if actual != primary_target:
				# The protector died doing its job — the sharpest possible
				# Guardian shatter trigger, and the sharpest possible tragedy.
				var lineage := StoryDirector.get_lineage(actual.identity.lineage_id)
				if lineage != null:
					lineage.add_event(SimulationBudget.current_tick, PlanetManager.active_planet_id,
						String(actual.identity.uid), "death",
						"%s died shielding %s." % [actual.display_name(), primary_target.display_name()], 1.0)
	return {"target": actual, "result": result}
