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


func _ready() -> void:
	_head("AETHERLINE — Phase 0")
	_out("Godot %s" % Engine.get_version_info()["string"])

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

	_section("World self-test  (generation · streaming · pressure · jumps)")
	var world_tests := WorldSelfTest.new()
	_report(world_tests.run(_creature_root))
	if not world_tests.atlas.is_empty():
		_out("")
		_out("  sample worlds:")
		for line in world_tests.atlas:
			_out(line)

	_section("Combat + utility self-test  (fight · protect · capture · mount · work · terrain)")
	_report(CombatSelfTest.new().run(_creature_root))

	_section("Colony self-test  (building · research · relationships · needs · colony story)")
	_report(ColonySelfTest.new().run(_creature_root))

	_section("Progression self-test  (economy · legacy · save · LOD · A/V hooks)")
	_report(ProgressionSelfTest.new().run(_creature_root))

	_section("Catching self-test  (odds · throw · party · full loop)")
	_report(CatchingSelfTest.new().run(_creature_root))

	_section("Gameplay loop self-test  (colony · harvest · survive · breed · jump · save)")
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

	if creature_tests.showcase != null:
		_section("Reloaded creature — full readout")
		for line in creature_tests.showcase.describe():
			_out(line)

	_label.text = "\n".join(_lines)
	_add_lab_button()


## Hand-off into the interactive Phase 1 tool.
func _add_lab_button() -> void:
	var lab := Button.new()
	lab.text = "Open Genome Lab  ->"
	lab.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	lab.position = Vector2(-200, -34)
	lab.custom_minimum_size = Vector2(180, 0)
	lab.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/ui/genome_lab.tscn"))
	add_child(lab)

	var world := Button.new()
	world.text = "Open World  ->"
	world.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	world.position = Vector2(-200, 0)
	world.custom_minimum_size = Vector2(180, 0)
	world.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/world/overworld.tscn"))
	add_child(world)

	var menu := Button.new()
	menu.text = "<-  Main Menu"
	menu.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	menu.position = Vector2(-200, -68)
	menu.custom_minimum_size = Vector2(180, 0)
	menu.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn"))
	add_child(menu)

	var lineage := Button.new()
	lineage.text = "Lineages  ->"
	lineage.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	lineage.position = Vector2(-200, 34)
	lineage.custom_minimum_size = Vector2(180, 0)
	lineage.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/ui/lineage_panel.tscn"))
	add_child(lineage)


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
