extends RefCounted
class_name CombatSelfTest

## Combat validation for the culture-capable main creature stack.
## Slimmed from phase3on: damage formula, fight rounds (down/kill), Guardian
## protection. Omits Work/Capture/Mount/Director/Terrain (later tasks).

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	_rng.seed = 554433

	_test_damage_formula(parent)
	_test_fight_round(parent)
	_test_protection(parent)
	_test_combat_component(parent)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


func _spawn_with(parent: Node, overrides: Dictionary) -> Creature:
	var c := CreatureFactory.spawn_random(parent, _rng, {})
	for locus_id in overrides:
		var pair: Array = overrides[locus_id]
		c.genetics.genome.set_pair(locus_id, pair[0], pair[1])
		c.genetics.mark_dirty()
	c.stats.mark_dirty()
	c.stats.initialize_vitals()
	return c


# --- Damage formula -------------------------------------------------------------

func _test_damage_formula(parent: Node) -> void:
	var brute := _spawn_with(parent, {"comb_power": ["power_massive", "power_massive"]})
	var target := _spawn_with(parent, {"def_plating": ["plate_none", "plate_none"],
		"def_evasion": ["evade_stolid", "evade_stolid"]})
	var armored := _spawn_with(parent, {"def_plating": ["plate_heavy", "plate_heavy"],
		"def_evasion": ["evade_stolid", "evade_stolid"]})

	# Averaged over many swings: a single attack is a coin flip on hit chance
	# and damage variance, and asserting on one is a flaky test.
	var bare_total := 0.0
	var armor_total := 0.0
	for i in 40:
		target.stats.hp = target.stats.max_hp()
		armored.stats.hp = armored.stats.max_hp()
		bare_total += float(CombatSystem.resolve_attack(brute, target, _rng)["damage"])
		armor_total += float(CombatSystem.resolve_attack(brute, armored, _rng)["damage"])
	_check("combat: armor reduces damage taken", bare_total > armor_total)

	var evasive := _spawn_with(parent, {"def_evasion": ["evade_darting", "evade_darting"]})
	var stolid := _spawn_with(parent, {"def_evasion": ["evade_stolid", "evade_stolid"]})
	var evasive_hits := 0
	var stolid_hits := 0
	for i in 60:
		evasive.stats.hp = evasive.stats.max_hp()
		stolid.stats.hp = stolid.stats.max_hp()
		if bool(CombatSystem.resolve_attack(brute, evasive, _rng)["hit"]):
			evasive_hits += 1
		if bool(CombatSystem.resolve_attack(brute, stolid, _rng)["hit"]):
			stolid_hits += 1
	_check("combat: evasion measurably reduces hit rate", evasive_hits < stolid_hits)

	var venomous := _spawn_with(parent, {"comb_venom": ["venom_potent", "venom_potent"]})
	var plain := _spawn_with(parent, {"comb_venom": ["venom_absent", "venom_absent"]})
	var venom_total := 0.0
	var plain_total := 0.0
	for i in 40:
		target.stats.hp = target.stats.max_hp()
		var r1 := CombatSystem.resolve_attack(venomous, target, _rng)
		if r1["hit"]:
			venom_total += float(r1["damage"])
		target.stats.hp = target.stats.max_hp()
		var r2 := CombatSystem.resolve_attack(plain, target, _rng)
		if r2["hit"]:
			plain_total += float(r2["damage"])
	_check("combat: venom adds damage", venom_total > plain_total)

	for c in [brute, target, armored, evasive, stolid, venomous, plain]:
		c.free()


# --- Fight round ------------------------------------------------------------------

func _test_fight_round(parent: Node) -> void:
	# A healthy adult must be DOWNED, not killed. Creature persistence is the
	# point: a nine-generation animal must not be lost to one bad exchange.
	var a := _spawn_with(parent, {"comb_power": ["power_massive", "power_massive"]})
	var b := _spawn_with(parent, {"vital_stamina": ["stam_slow", "stam_slow"]})
	b.stats.age_days = b.stats.stat("max_age_days") * 0.4  # prime of life
	b.stats.hp = 1.0

	var rounds := 0
	while not b.stats.downed and rounds < 40:
		CombatSystem.fight_round(a, b, _rng)
		rounds += 1
	_check("combat: a healthy adult is downed, not killed", b.stats.downed)
	_check("combat: a downed creature is left barely alive", b.stats.hp > 0.0)
	b.stats.revive()
	_check("combat: reviving brings it back", not b.stats.downed and b.stats.hp > 1.0)

	# The elderly and the newborn ARE mortal — that is where death still means
	# something rather than being noise.
	var elder := _spawn_with(parent, {})
	elder.stats.age_days = elder.stats.stat("max_age_days") * 1.2
	elder.stats.hp = 1.0
	var died: Array = []
	var listener := func(uid, _cause, _tick): died.append(uid)
	EventBus.creature_died.connect(listener)
	rounds = 0
	while elder.stats.hp > 0.0 and rounds < 40:
		CombatSystem.fight_round(a, elder, _rng)
		rounds += 1
	EventBus.creature_died.disconnect(listener)

	_check("combat: the elderly can actually be killed", not died.is_empty())
	_check("combat: the killer logs a kill", a.experience.count("kill") >= 1.0)
	_check("combat: the loser logs a loss", elder.experience.count("combat_loss") >= 1.0)

	a.free()
	b.free()
	elder.free()


# --- Protection (Guardian payoff) -------------------------------------------------

func _test_protection(parent: Node) -> void:
	var guardian := CreatureFactory.spawn_random(parent, _rng, {"name": "Shieldbearer"})
	guardian.stats.age(60.0)
	for i in 30:
		guardian.experience.log_event("protect_ally")
		guardian.experience.log_event("damage_absorbed_for_ally", 6.0)
	guardian.archetype.evaluate()
	_check("protection: test guardian actually crystallized",
		guardian.archetype.state.is_crystallized(&"arch_guardian"))

	var ward := CreatureFactory.spawn_random(parent, _rng, {"name": "Ward"})
	var attacker := CreatureFactory.spawn_random(parent, _rng, {"name": "Attacker"})

	var intercepted := 0
	for i in 30:
		var before := guardian.experience.count("protect_ally")
		var outcome := CombatSystem.attack_with_protection(attacker, ward, [guardian], _rng)
		if outcome["target"] == guardian and guardian.experience.count("protect_ally") > before:
			intercepted += 1
	_check("protection: a crystallized Guardian intercepts attacks meant for an ally",
		intercepted > 0)

	for c in [guardian, ward, attacker]:
		c.free()


# --- Combat component wiring ------------------------------------------------------

func _test_combat_component(parent: Node) -> void:
	var c := CreatureFactory.spawn_random(parent, _rng, {})
	_check("combat component: present on creature", c.combat != null)
	_check("combat component: starts ready to attack", c.combat.ready_to_attack())
	c.combat.reset_cooldown()
	_check("combat component: cooldown after reset", not c.combat.ready_to_attack())
	_check("combat component: attack_range positive", c.combat.attack_range() > 0.0)
	_check("combat component: aggro_range exceeds attack",
		c.combat.aggro_range() > c.combat.attack_range())
	c.free()


# --- Harness ------------------------------------------------------------------

func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
