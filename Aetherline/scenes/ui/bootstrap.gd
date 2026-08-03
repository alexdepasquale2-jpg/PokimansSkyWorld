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

	if creature_tests.showcase != null:
		_section("Reloaded creature — full readout")
		for line in creature_tests.showcase.describe():
			_out(line)

	_label.text = "\n".join(_lines)
	_add_lab_button()


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
