extends Control
class_name GenomeLab

## The Phase 1 deliverable's interactive half: a bench where you can make two
## parents, breed them repeatedly, and watch inheritance actually happen.
##
## It answers the three questions the design says must always be answerable:
##   1. What is written in this animal?      (genome readout, plain language)
##   2. What has life done to it?            (epigenetic marks and their effects)
##   3. What is it, therefore?               (predicted phenotype, three columns)
##
## Built in code rather than as a .tscn. A debug tool's layout changes every
## time the system under it changes, and a scene file makes that a chore; this
## way the panel and the thing it inspects live in one file.

const ROSTER_WIDTH := 260
const MONO_SIZE := 13

var _rng := RandomNumberGenerator.new()

## Everything currently on the bench, in creation order.
var _roster: Array[Creature] = []
var _selected: Creature = null
var _parent_a: Creature = null
var _parent_b: Creature = null

## Bundles of experience that drive a creature toward one archetype. Each entry
## logs several metrics together, because no real event is ever one counter —
## protecting someone also means taking the hit for them.
const EXPERIENCE_PRESETS := [
	{"label": "Protect an ally", "events": {"protect_ally": 1.0, "damage_absorbed_for_ally": 6.0}},
	{"label": "Win a fight", "events": {"combat_win": 1.0, "kill": 1.0, "damage_taken": 14.0}},
	{"label": "Lose a fight", "events": {"combat_loss": 1.0, "damage_taken": 30.0,
		"near_death_survived": 1.0}},
	{"label": "Suffer trauma", "events": {"trauma_events": 1.0, "isolation_days": 3.0}},
	{"label": "Travel", "events": {"distance_travelled": 2000.0, "biomes_entered": 1.0,
		"planets_visited": 0.34}},
	{"label": "Tend the herd", "events": {"creature_calmed": 1.0, "creature_tended": 1.5}},
	{"label": "Track prey", "events": {"track_success": 1.0, "forage_success": 0.8}},
	{"label": "Rear young", "events": {"offspring_sired": 1.0, "offspring_survived": 0.7}},
	{"label": "Approach an anomaly", "events": {"anomaly_investigated": 1.0,
		"threat_foreseen": 1.5}},
	{"label": "Endure hardship", "events": {"days_starving": 2.0, "hazards_endured": 1.0}},
]

var _creature_root: Node2D
var _roster_list: ItemList
var _readout: RichTextLabel
var _status: Label
var _parent_label: Label
var _experience_picker: OptionButton
var _chronicle: RichTextLabel

## Every story beat fired on this bench, newest last.
var _chronicle_lines: Array[String] = []


func _ready() -> void:
	_rng.randomize()
	_build_ui()
	# Listen on the bus rather than only collecting what evaluate_creature
	# returns: crystallization beats are fired from the archetype component
	# directly, and the chronicle should show everything the game said.
	EventBus.story_event_fired.connect(_on_story_event)
	_new_founders()


func _exit_tree() -> void:
	if EventBus.story_event_fired.is_connected(_on_story_event):
		EventBus.story_event_fired.disconnect(_on_story_event)


func _on_story_event(event: Dictionary) -> void:
	_add_chronicle(String(event.get("text", "")))


# --- UI construction ----------------------------------------------------------

func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	_creature_root = Node2D.new()
	_creature_root.name = "CreatureRoot"
	add_child(_creature_root)

	var root := VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 8)
	add_child(root)

	# --- toolbar ---
	var toolbar := HBoxContainer.new()
	toolbar.add_theme_constant_override("separation", 6)
	root.add_child(toolbar)

	_add_button(toolbar, "New Founders", _new_founders)
	_add_button(toolbar, "Set as Parent A", func(): _assign_parent(true))
	_add_button(toolbar, "Set as Parent B", func(): _assign_parent(false))
	_add_button(toolbar, "Breed", func(): _breed(1))
	_add_button(toolbar, "Breed x10", func(): _breed(10))
	toolbar.add_child(VSeparator.new())

	# Experience drivers. Until Phase 4 emits these from real combat and work,
	# this is how a player drives a creature toward an archetype by hand — and
	# it stays useful afterwards for testing archetypes in isolation.
	_experience_picker = OptionButton.new()
	for entry in EXPERIENCE_PRESETS:
		_experience_picker.add_item(String(entry["label"]))
	toolbar.add_child(_experience_picker)
	_add_button(toolbar, "Log x5", func(): _log_experience(5))
	_add_button(toolbar, "Log x25", func(): _log_experience(25))

	toolbar.add_child(VSeparator.new())
	_add_button(toolbar, "Mutate", _mutate_selected)
	_add_button(toolbar, "Random Mark", _mark_selected)
	_add_button(toolbar, "Age 30d", func(): _age_selected(30.0))
	toolbar.add_child(VSeparator.new())
	_add_button(toolbar, "Clear Bench", _clear_bench)
	_add_button(toolbar, "Main Menu", func():
		get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn"))

	_parent_label = Label.new()
	_parent_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_parent_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	toolbar.add_child(_parent_label)

	# --- main split ---
	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(split)

	var left := VBoxContainer.new()
	left.custom_minimum_size.x = ROSTER_WIDTH
	split.add_child(left)
	var roster_title := Label.new()
	roster_title.text = "Bench"
	left.add_child(roster_title)

	_roster_list = ItemList.new()
	_roster_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_roster_list.item_selected.connect(_on_roster_selected)
	left.add_child(_roster_list)

	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_child(scroll)

	_readout = RichTextLabel.new()
	_readout.bbcode_enabled = true
	_readout.fit_content = true
	_readout.scroll_active = false
	_readout.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	# Monospace: every readout in this panel is a column of aligned numbers.
	_readout.add_theme_font_override("normal_font", ThemeDB.fallback_font)
	_readout.add_theme_font_size_override("normal_font_size", MONO_SIZE)
	scroll.add_child(_readout)

	# The chronicle sits under the readout because it is the payoff: whatever
	# you did to these animals, this is what the game made of it.
	var chronicle_title := Label.new()
	chronicle_title.text = "Chronicle"
	root.add_child(chronicle_title)

	_chronicle = RichTextLabel.new()
	_chronicle.bbcode_enabled = true
	_chronicle.custom_minimum_size.y = 110
	_chronicle.scroll_following = true
	root.add_child(_chronicle)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	root.add_child(_status)


func _add_button(parent: Node, text: String, handler: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.pressed.connect(handler)
	parent.add_child(button)


# --- Bench management ---------------------------------------------------------

func _new_founders() -> void:
	_clear_bench()
	_parent_a = _spawn(AetherTypes.ReproRole.GAMETE_B)
	_parent_b = _spawn(AetherTypes.ReproRole.GAMETE_A)
	_select(_parent_a)
	_set_status("Two unrelated founders. Breed them and watch what surfaces.")


func _spawn(role: AetherTypes.ReproRole) -> Creature:
	var creature := CreatureFactory.spawn_random(_creature_root, _rng, {})
	creature.genetics.genome.repro_role = role
	_roster.append(creature)
	_refresh_roster()
	return creature


func _clear_bench() -> void:
	for creature in _roster:
		if is_instance_valid(creature):
			creature.free()
	_roster.clear()
	_parent_a = null
	_parent_b = null
	_selected = null
	_refresh_roster()
	_readout.text = ""
	_set_status("Bench cleared.")


func _assign_parent(is_a: bool) -> void:
	if _selected == null:
		_set_status("Select a creature on the bench first.")
		return
	if is_a:
		_parent_a = _selected
	else:
		_parent_b = _selected
	_refresh_parent_label()


func _breed(count: int) -> void:
	if _parent_a == null or _parent_b == null:
		_set_status("Assign both parents first.")
		return

	var compatibility := BreedingSystem.check_compatibility(_parent_a, _parent_b)
	if not bool(compatibility["ok"]):
		_set_status("Cannot breed: %s" % compatibility["reason"])
		return

	var born := 0
	var mutations := 0
	var inherited := 0
	var stillborn := 0
	var last_child: Creature = null

	for i in count:
		var result := BreedingSystem.breed(_parent_a, _parent_b, _creature_root, _rng)
		if not result["success"]:
			stillborn += 1
			continue
		for child in result["children"]:
			_roster.append(child)
			last_child = child
			born += 1
		mutations += (result["mutations"] as Array).size()
		inherited += int(result["inherited_marks"])

	_refresh_roster()
	if last_child != null:
		_select(last_child)

	_set_status("%d born · %d de novo mutation(s) · %d epigenetic mark(s) inherited%s" % [
		born, mutations, inherited,
		" · %d stillborn" % stillborn if stillborn > 0 else ""])


## Apply the selected experience preset `times` over, then let the archetype and
## story layers react. Both are polled here rather than pushed to, exactly as
## they are in the running game.
func _log_experience(times: int) -> void:
	if _selected == null:
		_set_status("Select a creature on the bench first.")
		return
	var preset: Dictionary = EXPERIENCE_PRESETS[_experience_picker.selected]
	var events: Dictionary = preset["events"]

	var before := _selected.archetype.state.active_archetypes().size()
	for i in times:
		for kind in events:
			_selected.experience.log_event(String(kind), float(events[kind]))
		_selected.archetype.evaluate()

	# Fired events reach the chronicle via the bus listener, so nothing to
	# collect here — this call is just the poll.
	StoryDirector.evaluate_creature(_selected)

	var gained := _selected.archetype.state.active_archetypes().size() - before
	_selected.visual.refresh()
	_refresh_readout()
	_refresh_roster()

	var closest := _describe_closest(_selected)
	_set_status("%s: %s x%d.%s%s" % [
		_selected.display_name(), preset["label"], times,
		"  Crystallized!" if gained > 0 else "",
		"  " + closest if not closest.is_empty() else ""])


func _describe_closest(creature: Creature) -> String:
	var best := ""
	var best_progress := 0.0
	for archetype_id in creature.archetype.state.progress:
		if creature.archetype.state.is_crystallized(archetype_id):
			continue
		var value := creature.archetype.state.get_progress(archetype_id)
		if value > best_progress:
			best_progress = value
			var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
			best = definition.display_name if definition != null else String(archetype_id)
	return "" if best.is_empty() else "Nearest: %s %.0f%%." % [best, best_progress * 100.0]


func _add_chronicle(text: String) -> void:
	if text.is_empty():
		return
	_chronicle_lines.append(text)
	if _chronicle_lines.size() > 40:
		_chronicle_lines = _chronicle_lines.slice(_chronicle_lines.size() - 40)
	_chronicle.text = "\n".join(_chronicle_lines.map(func(l): return "· " + l))


func _mutate_selected() -> void:
	if _selected == null:
		return
	# Force one, rather than rolling the natural rate and usually seeing nothing.
	var locus_ids: Array = _selected.genetics.genome.locus_ids()
	for attempt in 25:
		var locus_id: String = locus_ids[_rng.randi() % locus_ids.size()]
		var record := _selected.genetics.force_mutation(
			locus_id, "a" if _rng.randf() < 0.5 else "b", _rng)
		if not record.is_empty():
			var from_allele: AlleleResource = GenomeDB.get_allele(record["from"])
			var to_allele: AlleleResource = GenomeDB.get_allele(record["to"])
			_set_status("%s: %s became %s at %s." % [
				_selected.display_name(), from_allele.display_name,
				to_allele.display_name, record["locus"]])
			_selected.visual.refresh()
			_refresh_readout()
			_refresh_roster()
			return
	_set_status("No mutation landed (every roll returned the same allele).")


func _mark_selected() -> void:
	if _selected == null:
		return
	var templates: Array = GenomeDB.epi_mark_templates.keys()
	var definition_id: String = templates[_rng.randi() % templates.size()]
	var mark := _selected.epigenetics.apply_mark(definition_id, 0.3)
	if mark != null:
		_set_status("%s acquired '%s' (%s)." % [
			_selected.display_name(), mark.display_name,
			AetherTypes.enum_to_key(AetherTypes.EpiSource, mark.source).to_lower()])
	_selected.visual.refresh()
	_refresh_readout()


func _age_selected(days: float) -> void:
	if _selected == null:
		return
	_selected.tick_days(days)
	_set_status("%s aged %.0f days." % [_selected.display_name(), days])
	_refresh_readout()


# --- Selection & display ------------------------------------------------------

func _on_roster_selected(index: int) -> void:
	if index >= 0 and index < _roster.size():
		_select(_roster[index])


func _select(creature: Creature) -> void:
	_selected = creature
	var index := _roster.find(creature)
	if index >= 0:
		_roster_list.select(index)
	_refresh_readout()


func _refresh_roster() -> void:
	_roster_list.clear()
	for creature in _roster:
		if not is_instance_valid(creature):
			continue
		var tags := ""
		if creature == _parent_a:
			tags += " [A]"
		if creature == _parent_b:
			tags += " [B]"
		if not creature.genetics.genome.de_novo_loci.is_empty():
			tags += " *"
		# A crystallized archetype is the most important thing about a creature,
		# so it belongs on the roster line, not buried in the readout.
		for archetype_id in creature.archetype.state.active_archetypes():
			var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
			if definition != null:
				tags += " <%s>" % definition.display_name
		_roster_list.add_item("%s  gen %d%s" % [
			creature.display_name(), creature.identity.generation, tags])
	_refresh_parent_label()


func _refresh_parent_label() -> void:
	_parent_label.text = "A: %s     B: %s" % [
		_parent_a.display_name() if _parent_a != null else "-",
		_parent_b.display_name() if _parent_b != null else "-"]


func _refresh_readout() -> void:
	if _selected == null or not is_instance_valid(_selected):
		_readout.text = ""
		return

	var lines: Array[String] = []
	lines.append_array(_selected.describe())

	# The carried-but-not-shown half of the animal. This is the section that
	# turns breeding from arithmetic into a gamble worth taking.
	var hidden := PhenotypeResolver.hidden_carriers(_selected.genetics.genome)
	lines.append("")
	lines.append("-- CARRIED, NOT SHOWN --")
	if hidden.is_empty():
		lines.append("  (nothing hidden — this animal is what it looks like)")
	else:
		for entry in hidden:
			lines.append("  %-22s %-26s (%s)" % [
				entry["locus"], entry["name"], entry["reason"]])

	# Parentage, so a lineage can be walked by eye on the bench.
	if not _selected.identity.parent_uids.is_empty():
		lines.append("")
		lines.append("-- PARENTAGE --")
		for uid in _selected.identity.parent_uids:
			var parent := _find_by_uid(uid)
			lines.append("  %s" % (parent.display_name() if parent != null else uid))

	_readout.text = "[code]%s[/code]" % "\n".join(lines)


func _find_by_uid(uid: String) -> Creature:
	for creature in _roster:
		if is_instance_valid(creature) and String(creature.identity.uid) == uid:
			return creature
	return null


func _set_status(text: String) -> void:
	_status.text = text


# --- Smoke test ---------------------------------------------------------------

## Exercises the panel end to end without a human: founders exist, breeding
## produces offspring, and every readout section renders. Called from the
## bootstrap harness so the lab is verified on every headless run — a debug tool
## that silently broke would cost more than it saves.
func run_smoke_test() -> Array[String]:
	var problems: Array[String] = []

	if _roster.size() != 2:
		problems.append("expected 2 founders on a fresh bench, found %d" % _roster.size())
	if _parent_a == null or _parent_b == null:
		problems.append("founders were not assigned as parents")

	var before := _roster.size()
	_breed(3)
	if _roster.size() <= before:
		problems.append("breeding produced no offspring (%s)" % _status.text)

	_select(_roster[_roster.size() - 1])
	_refresh_readout()
	var text := _readout.text
	for section in ["GENOME", "EPIGENETICS", "PHENOTYPE", "CARRIED, NOT SHOWN", "PARENTAGE"]:
		if not text.contains(section):
			problems.append("readout is missing the %s section" % section)

	_mutate_selected()
	_mark_selected()
	_age_selected(30.0)
	if _readout.text.is_empty():
		problems.append("readout went blank after edits")

	# Drive the Guardian arc through the panel exactly as a player would.
	_select(_parent_a)
	_parent_a.stats.age(60.0)
	_experience_picker.select(0)  # "Protect an ally"
	_log_experience(30)
	if not _parent_a.archetype.state.is_crystallized(&"arch_guardian"):
		problems.append("driving 30 protections through the panel did not crystallize Guardian")
	if _chronicle_lines.is_empty():
		problems.append("no story beat reached the chronicle")
	if not _readout.text.contains("EXPERIENCE"):
		problems.append("readout is missing the EXPERIENCE section")

	return problems
