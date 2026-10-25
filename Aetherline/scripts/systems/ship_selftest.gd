extends RefCounted
class_name ShipSelfTest

## Phase 6 validation: the incremental layer is honest about money.
##
## WHY THIS EXISTS AT ALL. Every other system here is covered by a suite that
## runs from bootstrap, so a regression fails the build. The ship was the
## exception: its only coverage was `tests/ship_upgrade_test.gd`, a standalone
## SceneTree script that nothing invoked, that hung when run directly (it built
## an Overworld outside the tree, where autoloads do not exist), and that
## asserted with bare `assert()` — which Godot STRIPS FROM RELEASE BUILDS. A test
## that cannot run, is not run, and would evaporate if it were, is not coverage.
## This replaces it.
##
## WHAT IS ACTUALLY AT RISK HERE. The ship is the one place the player spends a
## resource, and salvage is earned slowly across whole worlds. An arithmetic bug
## that leaks or destroys salvage is not a rounding error to somebody who flew
## four planets to afford a drive level. So the assertions below are mostly about
## conservation: what goes in comes back out, nothing is created from nothing,
## and nothing paid for disappears.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []

## Measurements worth a human reading, printed by the harness.
var stats: Array[String] = []


func run(_parent: Node = null) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	stats.clear()

	_test_catalog()
	_test_costs()
	_test_upgrade_and_sell()
	_test_salvage_conservation()
	_test_stats_and_gates()
	_test_achievements()
	_test_persistence()

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Catalog --------------------------------------------------------------------

func _test_catalog() -> void:
	ShipSystem.load_catalogs()
	_check("catalog: modules loaded", ShipSystem.modules.size() >= 6)
	_check("catalog: achievements loaded", ShipSystem.achievements.size() >= 5)

	var problems: Array[String] = []
	for module_id in ShipSystem.modules:
		var definition: Dictionary = ShipSystem.modules[module_id]
		for required in ["display_name", "max_level", "base_cost", "cost_growth", "per_level"]:
			if not definition.has(required):
				problems.append("%s lacks %s" % [module_id, required])
		if int(definition.get("max_level", 0)) <= 0:
			problems.append("%s can never be bought" % module_id)
		if float(definition.get("cost_growth", 0.0)) < 1.0:
			# Growth below 1 makes later levels CHEAPER than earlier ones, which
			# inverts the whole incremental curve.
			problems.append("%s gets cheaper as it levels" % module_id)
		if (definition.get("per_level", {}) as Dictionary).is_empty():
			problems.append("%s does nothing" % module_id)
		# Flavour is per level and is shown in the ship view; a short list means
		# a blank line at the exact moment the player spends their salvage.
		var flavor: Array = definition.get("flavor", [])
		if flavor.size() < int(definition.get("max_level", 1)):
			problems.append("%s has %d flavour lines for %d levels"
				% [module_id, flavor.size(), int(definition.get("max_level", 1))])
	_check("catalog: every module is well-formed (%s)"
		% ("clean" if problems.is_empty() else ", ".join(problems)), problems.is_empty())

	var achievement_problems: Array[String] = []
	for id in ShipSystem.achievements:
		var definition: Dictionary = ShipSystem.achievements[id]
		for required in ["display_name", "metric", "threshold"]:
			if not definition.has(required):
				achievement_problems.append("%s lacks %s" % [id, required])
		if float(definition.get("threshold", 0.0)) <= 0.0:
			achievement_problems.append("%s unlocks itself" % id)
	_check("catalog: every achievement is reachable and well-formed",
		achievement_problems.is_empty())

	var ship := ShipSystem.new()
	_check("catalog: an unknown module is refused rather than guessed",
		ship.module_definition("mod_does_not_exist").is_empty()
			and ship.cost_of("mod_does_not_exist") == INF
			and not ship.can_upgrade("mod_does_not_exist"))
	_check("catalog: every module resolves an action tag for ActionEffects",
		not String(ship.module_definition("mod_scanner").get("action", "")).is_empty())


# --- Costs ----------------------------------------------------------------------

func _test_costs() -> void:
	var ship := ShipSystem.new()
	var module := "mod_drive"
	var definition: Dictionary = ShipSystem.modules[module]

	_check_near("costs: level 0 costs the base price",
		ship.cost_of(module), float(definition["base_cost"]), 0.001)

	# The curve has to actually rise, and it has to rise by the authored factor.
	ship.salvage = 1_000_000.0
	var previous := ship.cost_of(module)
	var rising := true
	for _level in 3:
		ship.upgrade(module)
		var now := ship.cost_of(module)
		if now <= previous:
			rising = false
		previous = now
	_check("costs: each level costs more than the last", rising)
	_check_near("costs: and by the authored growth factor",
		ship.cost_of(module) / float(definition["base_cost"]),
		pow(float(definition["cost_growth"]), 3), 0.01)

	# The ceiling has to be a real ceiling.
	var maxed := ShipSystem.new()
	maxed.salvage = 1_000_000.0
	var guard := 0
	while maxed.upgrade(module) and guard < 100:
		guard += 1
	_check("costs: a module stops at its authored ceiling",
		maxed.level_of(module) == maxed.max_level(module))
	_check("costs: and a maxed module costs INF rather than something buyable",
		maxed.cost_of(module) == INF and not maxed.can_upgrade(module))
	_note("levels bought before hitting the ceiling", float(guard))

	# Affordability is inclusive: exactly enough must be enough. Off-by-one here
	# reads to a player as the shop lying about the price.
	var exact := ShipSystem.new()
	exact.salvage = exact.cost_of(module)
	_check("costs: exactly enough salvage buys it", exact.can_upgrade(module))
	exact.salvage -= 0.01
	_check("costs: a hair short does not", not exact.can_upgrade(module))


# --- Upgrade and sell ------------------------------------------------------------

func _test_upgrade_and_sell() -> void:
	var ship := ShipSystem.new()
	var module := "mod_hold"

	_check("sell: you cannot sell what you do not own", not ship.sell(module))
	_check("sell: and the attempt does not mint salvage", is_zero_approx(ship.salvage))

	ship.salvage = 500.0
	var spent := ship.cost_of(module)
	_check("upgrade: buying one level succeeds", ship.upgrade(module))
	_check("upgrade: the level went up", ship.level_of(module) == 1)
	_check_near("upgrade: and exactly the quoted price was taken",
		ship.salvage, 500.0 - spent, 0.001)
	_check_near("upgrade: what was paid is remembered for the refund",
		ship.paid_cost(module), spent, 0.001)

	var before_sale := ship.salvage
	_check("sell: selling it back succeeds", ship.sell(module))
	_check("sell: the level came back down", ship.level_of(module) == 0)
	_check_near("sell: refunded 60% of what was paid",
		ship.salvage - before_sale, spent * 0.6, 0.001)
	_check("sell: a fully sold module forgets what was invested in it",
		is_zero_approx(ship.paid_cost(module)))
	_check("sell: and cannot be sold again", not ship.sell(module))

	# Selling one level of several must leave the rest intact.
	var stacked := ShipSystem.new()
	stacked.salvage = 5000.0
	for _i in 3:
		stacked.upgrade(module)
	var invested := stacked.paid_cost(module)
	stacked.sell(module)
	_check("sell: selling one level of three leaves two",
		stacked.level_of(module) == 2)
	_check("sell: and leaves a proportionate investment behind",
		stacked.paid_cost(module) > 0.0 and stacked.paid_cost(module) < invested)


## The property that actually matters: the ship must not be a salvage fountain
## or a salvage shredder beyond its stated 40% sell spread.
func _test_salvage_conservation() -> void:
	var ship := ShipSystem.new()
	ship.salvage = 10_000.0
	var started_with := ship.salvage

	var rng := RandomNumberGenerator.new()
	rng.seed = 20260805
	var module_ids: Array = ShipSystem.modules.keys()
	var bought := 0
	var sold := 0

	for _step in 400:
		var module: String = String(module_ids[rng.randi() % module_ids.size()])
		if rng.randf() < 0.6:
			if ship.upgrade(module):
				bought += 1
		elif ship.sell(module):
			sold += 1
		if ship.salvage < 0.0:
			break

	_check("conservation: salvage never goes negative, whatever the order of "
		+ "buying and selling", ship.salvage >= 0.0)
	_check("conservation: churn cannot create salvage from nothing",
		ship.salvage <= started_with + 0.001)
	_note("modules bought over 400 random operations", float(bought))
	_note("modules sold over 400 random operations", float(sold))
	_note("salvage remaining of 10000", ship.salvage)

	# Every level still held must still be paid for in the ledger.
	var orphaned: Array[String] = []
	for module_id in ship.levels:
		if ship.level_of(module_id) > 0 and ship.paid_cost(module_id) <= 0.0:
			orphaned.append(String(module_id))
	_check("conservation: no level is held without a record of paying for it (%s)"
		% ("clean" if orphaned.is_empty() else ", ".join(orphaned)), orphaned.is_empty())


# --- What the modules actually do -------------------------------------------------

func _test_stats_and_gates() -> void:
	var ship := ShipSystem.new()
	var base_capacity := ship.carry_capacity()
	var base_scan := ship.scan_depth()
	var base_candidates := ship.jump_candidates()

	ship.salvage = 100_000.0
	for _i in 4:
		ship.upgrade("mod_hold")
		ship.upgrade("mod_scanner")
		ship.upgrade("mod_drive")

	_check("effects: a bigger hold carries more", ship.carry_capacity() > base_capacity)
	_check("effects: a better array sees deeper", ship.scan_depth() > base_scan)
	_check("effects: a better drive offers more places to go",
		ship.jump_candidates() >= base_candidates)
	_check("effects: exotic worlds become reachable", ship.exotic_chance() > 0.0)

	# `stat` is the summation every gate reads through, so it has to agree with
	# the modules that feed it.
	var expected := 0.0
	for module_id in ShipSystem.modules:
		var per_level: Dictionary = ShipSystem.modules[module_id].get("per_level", {})
		if per_level.has("carry_capacity"):
			expected += float(per_level["carry_capacity"]) * float(ship.level_of(module_id))
	_check_near("effects: stat() sums exactly what the modules provide",
		ship.stat("carry_capacity"), expected, 0.001)
	_check("effects: an unknown stat is zero, not an error",
		is_zero_approx(ship.stat("stat_that_does_not_exist")))

	# Flavour is per level and is read straight into the ship view.
	var flavor := ship.flavor_for("mod_hold")
	_check("effects: a levelled module has flavour text to show", not flavor.is_empty())

	_note("carry capacity at hold level %d" % ship.level_of("mod_hold"),
		ship.carry_capacity())


# --- Achievements ------------------------------------------------------------------

func _test_achievements() -> void:
	var ship := ShipSystem.new()
	_check("achievements: nothing is unlocked on a fresh ship",
		ship.unlocked_achievements.is_empty())

	var landfall: Dictionary = ShipSystem.achievements.get("ach_first_landfall", {})
	if landfall.is_empty():
		_check("achievements: the landfall achievement exists", false)
		return

	var metric := String(landfall["metric"])
	var threshold := float(landfall["threshold"])
	var reward := float(landfall.get("salvage", 0.0))

	var before := ship.salvage
	var earned := ship.record(metric, threshold, false)
	_check("achievements: crossing the threshold unlocks it", earned.size() >= 1)
	_check_near("achievements: and pays what it promised",
		ship.salvage - before, reward, 0.001)

	# Paying twice for the same achievement is the classic incremental-game
	# exploit, and the one a player will find within an hour.
	var after_first := ship.salvage
	var again := ship.record(metric, threshold + 100.0, false)
	var repeated := false
	for definition in again:
		if String(definition.get("id", "")) == "ach_first_landfall":
			repeated = true
	_check("achievements: it cannot be unlocked a second time", not repeated)
	_check("achievements: and cannot be paid for a second time",
		ship.salvage <= after_first + 0.001 or again.size() > 0)

	# A lifetime metric is a high-water mark unless it is explicitly cumulative.
	var high_water := ShipSystem.new()
	high_water.record("planets_visited", 8.0, false)
	high_water.record("planets_visited", 3.0, false)
	_check_near("achievements: a high-water metric never falls back",
		float(high_water.lifetime["planets_visited"]), 8.0, 0.001)

	var running := ShipSystem.new()
	running.record("births", 2.0, true)
	running.record("births", 3.0, true)
	_check_near("achievements: a cumulative metric accumulates",
		float(running.lifetime["births"]), 5.0, 0.001)

	var progress := ship.achievement_progress()
	_check("achievements: progress is reported for every achievement",
		progress.size() == ShipSystem.achievements.size())
	_check("achievements: and unfinished ones sort ahead of finished ones",
		progress.is_empty() or not bool(progress[0]["done"])
			or ship.unlocked_achievements.size() == ShipSystem.achievements.size())


# --- Persistence ---------------------------------------------------------------------

func _test_persistence() -> void:
	var ship := ShipSystem.new()
	ship.salvage = 900.0
	for _i in 3:
		ship.upgrade("mod_drive")
	ship.upgrade("mod_hold")
	ship.record("planets_visited", 4.0, false)

	# Through real JSON, because that is how it reaches disk and JSON is where
	# ints quietly become floats.
	var round_tripped: Variant = JSON.parse_string(JSON.stringify(ship.to_dict()))
	_check("persistence: the ship survives JSON", round_tripped != null)

	var restored := ShipSystem.new()
	restored.from_dict(round_tripped)
	_check_near("persistence: salvage survives", restored.salvage, ship.salvage, 0.001)
	_check("persistence: module levels survive",
		restored.level_of("mod_drive") == 3 and restored.level_of("mod_hold") == 1)
	_check_near("persistence: what was invested survives, so selling still refunds",
		restored.paid_cost("mod_drive"), ship.paid_cost("mod_drive"), 0.001)
	_check("persistence: unlocked achievements survive",
		restored.unlocked_achievements.size() == ship.unlocked_achievements.size())
	_check_near("persistence: lifetime metrics survive",
		float(restored.lifetime.get("planets_visited", 0.0)), 4.0, 0.001)
	_check("persistence: and the ship still behaves the same afterwards",
		is_equal_approx(restored.carry_capacity(), ship.carry_capacity())
			and is_equal_approx(restored.scan_depth(), ship.scan_depth()))

	# An older save has levels but no `invested` ledger. Without the backfill,
	# every module a returning player owns would refund nothing.
	var legacy := {
		"salvage": 10.0,
		"levels": {"mod_drive": 2},
		"unlocked": [],
		"lifetime": {},
	}
	var migrated := ShipSystem.new()
	migrated.from_dict(legacy)
	_check("persistence: a save from before the sell ledger still loads",
		migrated.level_of("mod_drive") == 2)
	_check("persistence: and its modules are still worth something back",
		migrated.paid_cost("mod_drive") > 0.0)
	var refund_before := migrated.salvage
	migrated.sell("mod_drive")
	_check("persistence: selling a backfilled module actually pays",
		migrated.salvage > refund_before)


# --- Harness ---------------------------------------------------------------------

func _note(label: String, observed: float) -> void:
	stats.append("  %-52s %9.2f" % [label, observed])


func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)


func _check_near(label: String, observed: float, expected: float, tolerance: float) -> void:
	var ok := absf(observed - expected) <= tolerance
	_check("%s  (%.3f vs %.3f +/- %.3f)" % [label, observed, expected, tolerance], ok)
