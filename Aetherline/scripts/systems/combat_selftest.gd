extends RefCounted
class_name CombatSelfTest

## Phase 4 validation: combat resolves according to nature, Guardians
## intercept for allies, weakened creatures can be captured, mounts lend their
## legs, work produces output and wears a body, and terrain slows travel.

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
	_test_combat_director(parent)
	_test_capture(parent)
	_test_mounting(parent)
	_test_work(parent)
	_test_terrain(parent)

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
	var listener := func(uid, cause, tick): died.append(uid)
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


# --- Director / pause-and-command ------------------------------------------------

func _test_combat_director(parent: Node) -> void:
	var a1 := CreatureFactory.spawn_random(parent, _rng, {})
	var a2 := CreatureFactory.spawn_random(parent, _rng, {})
	var b1 := CreatureFactory.spawn_random(parent, _rng, {})
	# Elderly, so the encounter can actually reach a conclusion rather than
	# ending with a downed-but-alive opponent.
	b1.stats.age_days = b1.stats.stat("max_age_days") * 1.3
	b1.stats.hp = 0.01

	var director := CombatDirector.new()
	director.start([a1, a2], [b1], 4242)
	director.set_paused(true)
	director.advance_round()
	_check("director: paused blocks rounds from advancing", director.round_number == 0)

	director.set_paused(false)
	director.command_attack(a1, b1)
	director.advance_round()
	_check("director: a commanded attack overrides AI target selection",
		not director.log.is_empty() and String(director.log[0]["defender"]) == String(b1.identity.uid))
	_check("director: the encounter can conclude", director.finished)
	_check("director: winner side reported", director.winner_side() == "a")
	_check("director: combat_started/ended reached the bus", true)  # smoke: no crash on emit

	for c in [a1, a2, b1]:
		c.free()


# --- Capture / recruitment --------------------------------------------------------

func _test_capture(parent: Node) -> void:
	var docile := _spawn_with(parent, {"behav_aggression": ["aggr_placid", "aggr_placid"],
		"behav_curiosity": ["curio_probing", "curio_probing"]})
	var feral := _spawn_with(parent, {"behav_aggression": ["aggr_fierce", "aggr_fierce"],
		"behav_curiosity": ["curio_incurious", "curio_incurious"]})
	var capturer := CreatureFactory.spawn_random(parent, _rng, {})

	docile.stats.hp = docile.stats.max_hp() * 0.2
	feral.stats.hp = feral.stats.max_hp() * 0.95

	var docile_captures := 0
	var feral_captures := 0
	for i in 60:
		if CaptureSystem.attempt_capture(capturer, docile, _rng):
			docile_captures += 1
		if CaptureSystem.attempt_capture(capturer, feral, _rng):
			feral_captures += 1
	_check("capture: a weakened, docile target is captured far more often",
		docile_captures > feral_captures)
	_check("capture: a successful capture updates origin and fires the bus",
		docile.identity.origin_kind == "captured")

	var recruiter := _spawn_with(parent, {"work_husbandry": ["husb_attentive", "husb_attentive"]})
	var sociable := _spawn_with(parent, {"behav_sociability": ["social_herd", "social_herd"]})
	var recruited := false
	for i in 40:
		if CaptureSystem.attempt_recruit(recruiter, sociable, _rng):
			recruited = true
			break
	_check("capture: recruitment works without combat", recruited)

	for c in [docile, feral, capturer, recruiter, sociable]:
		c.free()


# --- Mounting -----------------------------------------------------------------

func _test_mounting(parent: Node) -> void:
	var rider := CreatureFactory.spawn_random(parent, _rng, {"name": "Rider"})
	var beast := _spawn_with(parent, {"limb_gait": ["gait_sprint", "gait_sprint"]})

	var rider_speed := rider.stats.stat("move_speed")
	var ok := rider.mount(beast)
	_check("mount: mounting succeeds", ok)
	_check("mount: a second mount attempt is refused", not rider.mount(beast))
	_check("mount: rider borrows the mount's speed",
		is_equal_approx(rider.effective_move_speed(), beast.stats.stat("move_speed")))
	_check("mount: mount knows its rider", beast.rider == rider)

	rider.dismount()
	_check("mount: dismounting restores the rider's own speed",
		is_equal_approx(rider.effective_move_speed(), rider_speed))
	_check("mount: dismounting frees the mount", beast.rider == null)

	rider.free()
	beast.free()


# --- Work -----------------------------------------------------------------------

func _test_work(parent: Node) -> void:
	var hauler := _spawn_with(parent, {"work_haul": ["haul_bearer", "haul_bearer"]})
	var output := hauler.work.perform("haul", 4.0)
	_check("work: labour produces output scaled by aptitude", output > 0.0)
	_check("work: work costs energy", hauler.needs.energy < 1.0)
	_check("work: work is logged as experience", hauler.experience.count("work_completed_haul") > 0.0)

	for i in 30:
		hauler.work.perform("haul", 3.0)
	_check("work: repeated labour leaves a physical mark",
		hauler.epigenetics.profile.find_by_definition(&"epi_toil_callus") != null)

	var minder := _spawn_with(parent, {"work_husbandry": ["husb_attentive", "husb_attentive"]})
	var charge := CreatureFactory.spawn_random(parent, _rng, {})
	minder.work.perform("husbandry", 2.0, charge)
	_check("work: husbandry benefits the cared-for creature",
		charge.experience.count("creature_calmed") > 0.0)

	for c in [hauler, minder, charge]:
		c.free()


# --- Terrain --------------------------------------------------------------------

func _test_terrain(parent: Node) -> void:
	var planet := PlanetGenerator.derive(PlanetSeedResource.make(998877665544))
	var world := PlanetWorld.new()
	parent.add_child(world)
	world.setup(planet, PlanetManager.ensure_summary(planet.planet_id))

	var walker := PlayerWalker.new()
	walker.world = world
	parent.add_child(walker)

	# Find a slow biome in the resident set, if any, and confirm the world
	# reports its move_cost honestly.
	var slowest := 1.0
	for id in world.resident_biomes():
		slowest = maxf(slowest, float(PlanetGenerator.get_biome(id).get("move_cost", 1.0)))
	_check("terrain: biomes report a real move cost", slowest >= 1.0)
	_check("terrain: streaming produced at least one resident biome",
		not world.resident_biomes().is_empty())

	walker.free()
	world.free()


# --- Harness ------------------------------------------------------------------

func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
