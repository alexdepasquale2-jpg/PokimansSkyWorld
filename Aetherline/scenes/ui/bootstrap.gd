extends Control
## Bootstrap — the Phase 0 debug harness.
##
## Boots the project, reports every autoload, runs both self-test suites, and
## prints a full readout of a real creature that has been spawned, mutated,
## marked by its environment, saved and reloaded. This is the "inspect the data
## in the debugger" surface the Phase 0 deliverable asks for; the Phase 1 debug
## panel grows out of it.

## `-- --verbose-tests` lists every assertion, not just failures.
var _verbose_tests: bool = OS.get_cmdline_user_args().has("--verbose-tests")

@onready var _label: RichTextLabel = $Margin/Panel/Margin/Scroll/Log
@onready var _creature_root: Node2D = $CreatureRoot

var _lines: Array[String] = []
var _ticker: CultureTicker = null


func _ready() -> void:
	_head("AETHERLINE — Phase 0")
	_out("Godot %s" % Engine.get_version_info()["string"])

	# CultureRegistry is a static class with no _ready of its own, and SaveSystem
	# only calls providers that registered before a load runs. Installing it here
	# is what makes the culture section loadable at all — see the hazard note in
	# culture_registry.gd.
	CultureRegistry.install(20260803)
	_ticker = CultureTicker.new()
	_ticker.enabled = false  # The suites drive decisions explicitly.
	add_child(_ticker)

	_section("Autoloads")
	_out(GenomeDB.debug_summary())
	_out(PlanetManager.debug_summary())
	_out(StoryDirector.debug_summary())
	_out(SaveSystem.debug_summary())
	_out(SimulationBudget.debug_summary())

	if not GenomeDB.load_problems.is_empty():
		_section("Catalog notes")
		for p in GenomeDB.load_problems:
			_out("· " + p)

	_section("Every script compiles")
	_report(_compile_everything())

	_section("Core data model self-test")
	_report(DataModelSelfTest.new().run())

	_section("Creature self-test  (spawn · mutate · mark · save · reload)")
	var creature_tests := CreatureSelfTest.new()
	_report(creature_tests.run(_creature_root))

	_section("Breeding self-test  (Mendelian ratios · linkage · epigenetic crossing)")
	var breeding_tests := BreedingSelfTest.new()
	_report(breeding_tests.run(_creature_root))
	_out("")
	_out("  measured:")
	for line in breeding_tests.stats:
		_out(line)

	_section("Archetype + story self-test  (experience · crystallization · narration)")
	var archetype_tests := ArchetypeSelfTest.new()
	_report(archetype_tests.run(_creature_root))
	if not archetype_tests.chronicle.is_empty():
		_out("")
		_out("  [i]what the story layer actually said:[/i]")
		for line in archetype_tests.chronicle:
			_out(line)

	_section("Culture self-test  (shared network · transmission · inheritance)")
	var culture_tests := CultureSelfTest.new()
	_report(culture_tests.run(_creature_root))
	if not culture_tests.stats.is_empty():
		_out("")
		_out("  measured:")
		for line in culture_tests.stats:
			_out(line)

	_section("Combat self-test")
	_report(CombatSelfTest.new().run(_creature_root))

	_section("Catching self-test  (party · ship · discovery · catch · session)")
	_report(CatchingSelfTest.new().run(_creature_root))

	_section("Colony self-test  (building · research · relationships · work)")
	_report(ColonySelfTest.new().run(_creature_root))

	_section("Progression self-test  (economy · legacy · upgrades · A/V hooks)")
	_report(ProgressionSelfTest.new().run(_creature_root))

	_section("Understandings panel  (progression UI smoke test)")
	var neuron_session := GameSession.new()
	_creature_root.add_child(neuron_session)
	var neuron_panel := NeuronPanel.new()
	_creature_root.add_child(neuron_panel)
	var neuron_problems := neuron_panel.run_smoke_test(neuron_session)
	_out("%d passed, %d failed%s" % [
		1 if neuron_problems.is_empty() else 0, neuron_problems.size(),
		"" if neuron_problems.is_empty() else "   <<< ATTENTION"])
	for problem in neuron_problems:
		_out("  FAIL · " + problem)
	neuron_panel.queue_free()
	neuron_session.queue_free()

	_section("HUD  (the screen a player looks at for the whole game)")
	var hud := HudRoot.new()
	_creature_root.add_child(hud)
	var hud_problems := hud.run_smoke_test()
	_out("%d passed, %d failed%s" % [
		1 if hud_problems.is_empty() else 0, hud_problems.size(),
		"" if hud_problems.is_empty() else "   <<< ATTENTION"])
	for problem in hud_problems:
		_out("  FAIL · " + problem)
	hud.free()

	_section("Ending screen  (the two ways a run finishes)")
	var ending := EndingScreen.new()
	_creature_root.add_child(ending)
	var ending_problems := ending.run_smoke_test()
	_out("%d passed, %d failed%s" % [
		1 if ending_problems.is_empty() else 0, ending_problems.size(),
		"" if ending_problems.is_empty() else "   <<< ATTENTION"])
	for problem in ending_problems:
		_out("  FAIL · " + problem)
	ending.queue_free()

	_section("Stakes self-test  (death · decline · extinction · triumph)")
	var stakes_tests := StakesSelfTest.new()
	_report(stakes_tests.run(_creature_root))
	if not stakes_tests.stats.is_empty():
		_out("")
		_out("  measured:")
		for line in stakes_tests.stats:
			_out(line)

	_section("Neuronal self-test  (discover · reinforce · lock or lose · leap)")
	var neuron_tests := NeuronalSelfTest.new()
	_report(neuron_tests.run(_creature_root))
	if not neuron_tests.stats.is_empty():
		_out("")
		_out("  measured:")
		for line in neuron_tests.stats:
			_out(line)

	_section("Pacing  (three in-game years of a competent campaign)")
	var pacing_tests := PacingSelfTest.new()
	_report(pacing_tests.run(_creature_root))
	for line in pacing_tests.stats:
		_out(line)

	_section("Lore voice self-test  (can the game explain itself?)")
	var voice_tests := LoreVoiceSelfTest.new()
	_report(voice_tests.run(_creature_root))
	if not voice_tests.stats.is_empty():
		_out("")
		_out("  what a player actually reads:")
		for line in voice_tests.stats:
			_out(line)

	_section("Ship self-test  (modules · salvage conservation · achievements)")
	var ship_tests := ShipSelfTest.new()
	_report(ship_tests.run(_creature_root))
	if not ship_tests.stats.is_empty():
		_out("")
		_out("  measured:")
		for line in ship_tests.stats:
			_out(line)

	_section("Gameplay loop self-test  (colony · harvest · jump · save)")
	_report(GameplaySelfTest.new().run(_creature_root))

	_section("Genome lab panel  (debug UI smoke test)")
	var lab: GenomeLab = load("res://scenes/ui/genome_lab.tscn").instantiate()
	lab.visible = false
	add_child(lab)
	var lab_problems := lab.run_smoke_test()
	_out("%d passed, %d failed%s" % [
		1 if lab_problems.is_empty() else 0, lab_problems.size(),
		"" if lab_problems.is_empty() else "   <<< ATTENTION"])
	for problem in lab_problems:
		_out("  FAIL · " + problem)
	lab.queue_free()

	_section("Culture lab panel  (debug UI smoke test)")
	var culture_lab: CultureLab = load("res://scenes/ui/culture_lab.tscn").instantiate()
	culture_lab.visible = false
	add_child(culture_lab)
	var culture_lab_problems := culture_lab.run_smoke_test()
	_out("%d passed, %d failed%s" % [
		1 if culture_lab_problems.is_empty() else 0, culture_lab_problems.size(),
		"" if culture_lab_problems.is_empty() else "   <<< ATTENTION"])
	for problem in culture_lab_problems:
		_out("  FAIL · " + problem)
	culture_lab.queue_free()

	_section("World self-test  (planet derive · chunk streaming)")
	var world_tests := WorldSelfTest.new()
	_report(world_tests.run(_creature_root))
	if not world_tests.atlas.is_empty():
		_out("")
		_out("  sample atlas:")
		for line in world_tests.atlas:
			_out(line)

	if creature_tests.showcase != null:
		_section("Reloaded creature — full readout")
		for line in creature_tests.showcase.describe():
			_out(line)

	_label.text = "\n".join(_lines)
	_add_lab_button()


## Load every script in the project and check it compiles.
##
## THE GAP THIS CLOSES: the self-tests exercise systems, not scenes. `overworld.gd`
## is the largest script in the project and no suite touches it, so a compile
## error there — a type inferred from a Variant, an untyped array literal returned
## from a ternary — shows a clean 800-assertion pass and then fails the moment a
## player presses New Game. That has now happened often enough to be a pattern
## rather than an accident.
##
## Loading a script compiles it without running anything, so this is safe for
## scripts that expect a live scene tree. It is not a substitute for playing the
## game; it is the floor beneath it.
func _compile_everything() -> Dictionary:
	var lines: Array[String] = []
	var failed := 0
	var paths: Array[String] = []
	_gather_scripts("res://", paths)
	paths.sort()
	for path in paths:
		# `load()` is NOT the check. A GDScript that fails to parse still comes
		# back as a non-null resource — the first version of this test passed a
		# deliberately broken overworld.gd and reported 114/114. `can_instantiate`
		# is the question actually being asked: did this compile into something
		# the engine could build.
		var script := load(path) as GDScript
		if script != null and script.can_instantiate():
			lines.append("  [PASS] compiles: " + path)
		else:
			failed += 1
			lines.append("  [FAIL] does not compile: " + path)
	return {"passed": paths.size() - failed, "failed": failed, "lines": lines}


func _gather_scripts(dir_path: String, out: Array[String]) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	dir.list_dir_begin()
	var entry := dir.get_next()
	while not entry.is_empty():
		var full := dir_path.path_join(entry) if dir_path != "res://" else "res://" + entry
		if dir.current_is_dir():
			# `.godot` is the import cache; `addons` is not ours to vouch for.
			if not entry.begins_with(".") and entry != "addons":
				_gather_scripts(full, out)
		elif entry.ends_with(".gd"):
			out.append(full)
		entry = dir.get_next()
	dir.list_dir_end()


## Hand-off into the interactive Phase 1 tool.
func _add_lab_button() -> void:
	var button := Button.new()
	button.text = "Open Genome Lab  ->"
	button.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	button.position = Vector2(-400, -4)
	button.custom_minimum_size = Vector2(180, 0)
	button.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/ui/genome_lab.tscn"))
	add_child(button)

	var culture_button := Button.new()
	culture_button.text = "Open Culture Lab  ->"
	culture_button.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	culture_button.position = Vector2(-200, -4)
	culture_button.custom_minimum_size = Vector2(180, 0)
	culture_button.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/ui/culture_lab.tscn"))
	add_child(culture_button)


func _report(result: Dictionary) -> void:
	var failed := int(result["failed"])
	_out("%d passed, %d failed%s" % [
		result["passed"], failed, "" if failed == 0 else "   <<< ATTENTION"])
	for line in result["lines"]:
		if String(line).contains("[FAIL]") or _verbose_tests:
			_out(String(line).replace("[PASS]", "PASS ·").replace("[FAIL]", "FAIL ·"))


func _head(text: String) -> void:
	_lines.append("[b]%s[/b]" % text)
	print(text)


func _section(title: String) -> void:
	_lines.append("")
	_lines.append("[b]%s[/b]" % title)
	print("")
	print(title)


func _out(text: String) -> void:
	_lines.append(text)
	print(text)
