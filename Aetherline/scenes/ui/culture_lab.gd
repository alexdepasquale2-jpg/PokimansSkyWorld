extends Control
class_name CultureLab

## The bench for watching a culture form.
##
## Cultural drift is the one thing in this project that is genuinely invisible
## without a tool. A genome can be printed; a phenotype can be tabulated; but
## "the clan is becoming braver" lives in eighteen hundred floats and shows up in
## play as a vague feeling that things are going better than they used to. This
## panel is where that becomes a number a designer can argue with.
##
## Built in code rather than as a .tscn, for the reason genome_lab.gd gives: a
## debug tool's layout changes every time the system under it changes, and a
## scene file makes that a merge conflict instead of a diff.
##
## `run_smoke_test` runs from bootstrap so a broken debug tool fails the build
## rather than being discovered the day somebody needs it.

const ROSTER_WIDTH := 260
const MONO_SIZE := 13
const CLAN_SIZE := 8

## Situations a designer can teach a clan by hand, the same way GenomeLab's
## experience presets drive archetypes. Each is a perception override plus the
## behaviour that pays in it.
const TEACHING_PRESETS := [
	{"label": "Cold snap -> migrate", "state": "MIGRATE",
		"slots": {"thermal_comfort": 0.0, "hunger": 0.2, "mood": 0.1}},
	{"label": "Predator near -> flee", "state": "FLEE",
		"slots": {"recent_trauma": 0.9, "health": 0.5, "mood": 0.2}},
	{"label": "Abundance -> gather", "state": "FORAGE",
		"slots": {"hunger": 0.95, "energy": 0.9, "mood": 0.9}},
	{"label": "Famine -> forage hard", "state": "SEEK_FOOD",
		"slots": {"hunger": 0.25, "lifetime_hardship": 0.8}},
	{"label": "The herd is calm -> bond", "state": "SOCIALIZE",
		"slots": {"mood": 0.9, "health": 1.0, "energy": 0.8}},
	{"label": "Something strange -> look", "state": "WANDER",
		"slots": {"mood": 0.7, "energy": 0.9, "thermal_comfort": 1.0}},
]

var _creature_root: Node2D
var _router: CultureRewardRouter
var _rng := RandomNumberGenerator.new()

var _roster: Array[Creature] = []
var _selected: Creature = null
var _culture_id: String = "clan_lab"

var _culture_picker: OptionButton
var _preset_picker: OptionButton
var _roster_list: ItemList
var _readout: RichTextLabel
var _ledger: RichTextLabel
var _status: Label
var _chart: Control

var _chronicle_lines: Array[String] = []


func _ready() -> void:
	_rng.seed = 20260803
	CultureRegistry.install(20260803)
	_build_ui()

	_router = CultureRewardRouter.new()
	add_child(_router)

	EventBus.culture_shifted.connect(_on_culture_shifted)
	EventBus.culture_generation_advanced.connect(_on_generation_advanced)

	_new_clan()


func _exit_tree() -> void:
	if EventBus.culture_shifted.is_connected(_on_culture_shifted):
		EventBus.culture_shifted.disconnect(_on_culture_shifted)
	if EventBus.culture_generation_advanced.is_connected(_on_generation_advanced):
		EventBus.culture_generation_advanced.disconnect(_on_generation_advanced)


# --- Construction --------------------------------------------------------------

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

	_culture_picker = OptionButton.new()
	_culture_picker.item_selected.connect(_on_culture_picked)
	toolbar.add_child(_culture_picker)
	_add_button(toolbar, "New Clan", _new_clan)
	_add_button(toolbar, "Fork Clan", _fork_clan)
	toolbar.add_child(VSeparator.new())

	_preset_picker = OptionButton.new()
	for entry in TEACHING_PRESETS:
		_preset_picker.add_item(String(entry["label"]))
	toolbar.add_child(_preset_picker)
	_add_button(toolbar, "Teach x25", func(): _teach(25))
	_add_button(toolbar, "Teach x200", func(): _teach(200))

	toolbar.add_child(VSeparator.new())
	_add_button(toolbar, "Advance Generation", _advance_generation)
	_add_button(toolbar, "Reset to Inherited", _reset_live)
	_add_button(toolbar, "Seed Prior", _seed_prior)

	_status = Label.new()
	_status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	toolbar.add_child(_status)

	# --- main split ---
	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(split)

	var left := VBoxContainer.new()
	left.custom_minimum_size = Vector2(ROSTER_WIDTH, 0)
	split.add_child(left)
	left.add_child(_heading("Clan"))
	_roster_list = ItemList.new()
	_roster_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_roster_list.item_selected.connect(_on_roster_selected)
	left.add_child(_roster_list)

	# The chart is the reason this panel exists: drift is a shape over time, not
	# a number, and a designer needs to see it curve.
	left.add_child(_heading("Cultural drift"))
	_chart = Control.new()
	_chart.custom_minimum_size = Vector2(0, 140)
	_chart.draw.connect(_draw_chart)
	left.add_child(_chart)

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_child(right)

	var panes := HSplitContainer.new()
	panes.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(panes)

	_readout = _mono_label()
	_readout.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panes.add_child(_readout)

	var ledger_box := VBoxContainer.new()
	ledger_box.custom_minimum_size = Vector2(340, 0)
	panes.add_child(ledger_box)
	ledger_box.add_child(_heading("Reward ledger & chronicle"))
	_ledger = _mono_label()
	_ledger.size_flags_vertical = Control.SIZE_EXPAND_FILL
	ledger_box.add_child(_ledger)

	var back := Button.new()
	back.text = "<- Back to Bootstrap"
	back.pressed.connect(func():
		get_tree().change_scene_to_file("res://scenes/ui/bootstrap.tscn"))
	root.add_child(back)


func _heading(text: String) -> Label:
	var label := Label.new()
	label.text = text
	return label


func _mono_label() -> RichTextLabel:
	var label := RichTextLabel.new()
	label.bbcode_enabled = true
	label.scroll_following = false
	label.add_theme_font_size_override("normal_font_size", MONO_SIZE)
	label.add_theme_font_size_override("mono_font_size", MONO_SIZE)
	label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	return label


func _add_button(parent: Node, text: String, handler: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.pressed.connect(handler)
	parent.add_child(button)


# --- Clan management -----------------------------------------------------------

func _new_clan() -> void:
	_clear_roster()
	_culture_id = "clan_%d" % (CultureRegistry.count() + 1)
	for _i in CLAN_SIZE:
		_roster.append(CreatureFactory.spawn_random(_creature_root, _rng,
			{"culture_id": _culture_id}))
	_selected = _roster[0]
	_refresh_cultures()
	_refresh_all()
	_set_status("Founded %s with %d members." % [_culture_id, CLAN_SIZE])


## Split a clan off, carrying a copy of everything its parent culture knows.
## Stage 3 does this when a group departs a planet; here it is a button, so the
## divergence of two peoples from one starting point can be watched directly.
func _fork_clan() -> void:
	var parent := _culture()
	if parent == null:
		return
	var child_id := parent.culture_id + "_fork"
	var child := CultureRegistry.ensure(child_id, parent.display_name + " (fork)")
	child.live.copy_from(parent.live)
	child.locked.copy_from(parent.locked)
	child.generation = parent.generation
	EventBus.culture_forked.emit(parent.culture_id, child_id, "lab")
	_culture_id = child_id
	for creature in _roster:
		creature.identity.culture_id = StringName(child_id)
	_refresh_cultures()
	_refresh_all()
	_set_status("Forked %s from %s." % [child_id, parent.culture_id])


func _culture() -> CultureResource:
	return CultureRegistry.ensure(_culture_id)


func _clear_roster() -> void:
	for creature in _roster:
		if is_instance_valid(creature):
			creature.queue_free()
	_roster.clear()
	_selected = null


# --- Teaching ------------------------------------------------------------------

## Drive the whole clan through a situation `times` times, paying when they get
## it right. Exactly the loop the game runs; the only thing the lab supplies is
## the situation.
func _teach(times: int) -> void:
	var preset: Dictionary = TEACHING_PRESETS[maxi(0, _preset_picker.selected)]
	var perception := _perception_for(preset)
	var target := AetherTypes.key_to_enum(AIController.State,
		String(preset["state"]), AIController.State.IDLE)

	for _step in times:
		for creature in _roster:
			var ai: AIController = creature.ai
			ai.decide_from(perception, true)
			if ai.state == target:
				_router.route_creature(creature, "forage_success", 1.0, 400)
			else:
				_router.route_creature(creature, "hazards_endured", -1.0, 400)
			ai.clear_trace()
		SimulationBudget.current_tick += 30

	_culture().maybe_apply(true)
	_refresh_all()
	_set_status("Taught '%s' %d times." % [preset["label"], times])


func _perception_for(preset: Dictionary) -> PackedFloat32Array:
	var v := Perception.blank()
	v[Perception.slot_index("hunger")] = 0.6
	v[Perception.slot_index("energy")] = 0.6
	v[Perception.slot_index("health")] = 0.9
	v[Perception.slot_index("mood")] = 0.5
	v[Perception.slot_index("thermal_comfort")] = 1.0
	for key in preset.get("slots", {}):
		var index := Perception.slot_index(String(key))
		if index >= 0:
			v[index] = float(preset["slots"][key])
	return v


func _advance_generation() -> void:
	var retained := _culture().advance_generation()
	_refresh_all()
	_set_status("Generation %d. %.0f%% of the clan's disposition carried over."
		% [_culture().generation, retained * 100.0])


func _reset_live() -> void:
	_culture().reset_live_to_locked()
	_refresh_all()
	_set_status("Discarded this generation's learning.")


func _seed_prior() -> void:
	var ids: Array = GenomeDB.culture_priors.keys()
	if ids.is_empty():
		return
	var next: int = (_culture().generation + 1) % ids.size()
	var prior_id := String(ids[next])
	_culture().seed_prior(prior_id)
	_refresh_all()
	_set_status("Seeded prior '%s'." % prior_id)


# --- Refresh -------------------------------------------------------------------

func _refresh_all() -> void:
	_refresh_roster()
	_refresh_readout()
	_refresh_ledger()
	if _chart != null:
		_chart.queue_redraw()


func _refresh_cultures() -> void:
	_culture_picker.clear()
	for id in CultureRegistry.ids():
		_culture_picker.add_item(String(id))
	for i in _culture_picker.item_count:
		if _culture_picker.get_item_text(i) == _culture_id:
			_culture_picker.select(i)


func _on_culture_picked(index: int) -> void:
	_culture_id = _culture_picker.get_item_text(index)
	for creature in _roster:
		creature.identity.culture_id = StringName(_culture_id)
	_refresh_all()


func _refresh_roster() -> void:
	_roster_list.clear()
	for creature in _roster:
		var ai: AIController = creature.ai
		_roster_list.add_item("%-14s %s" % [
			creature.display_name().substr(0, 14), ai.state_name().to_lower()])
	if _selected != null:
		var index := _roster.find(_selected)
		if index >= 0:
			_roster_list.select(index)


func _on_roster_selected(index: int) -> void:
	if index >= 0 and index < _roster.size():
		_selected = _roster[index]
		_refresh_readout()


func _refresh_readout() -> void:
	var culture := _culture()
	var lines: Array[String] = []
	lines.append("[b]CULTURE[/b]")
	lines.append_array(culture.describe())

	lines.append("")
	lines.append("[b]WHAT THE CLAN WANTS[/b]  (mean policy over its own average situation)")
	lines.append("  %-18s %7s  %s" % ["drive", "p", "bias"])
	for entry in culture.drive_report():
		var bar := "".lpad(int(float(entry["p"]) * 40.0) + 1, "#").substr(1)
		lines.append("  %-18s %7.3f  %+5.2f  %s" % [
			entry["drive"], entry["p"], entry["bias"], bar])

	if _selected != null and is_instance_valid(_selected):
		lines.append("")
		lines.append("[b]%s[/b]" % _selected.display_name())
		lines.append_array((_selected.ai as AIController).describe())
		lines.append("")
		lines.append("[b]WHAT IT SENSES[/b]")
		var perception: PerceptionComponent = _selected.perception
		if perception != null:
			perception.sense()
			lines.append_array(perception.describe_full())

	_readout.text = "\n".join(lines)


func _refresh_ledger() -> void:
	var culture := _culture()
	var lines: Array[String] = []
	lines.append("[b]reward by kind[/b]  (one kind dominating is what")
	lines.append("an exploit looks like from here)")
	var kinds: Array = culture.reward_tally.keys()
	kinds.sort_custom(func(a, b):
		return absf(float(culture.reward_tally[a])) > absf(float(culture.reward_tally[b])))
	var total := 0.0
	for kind in kinds:
		total += absf(float(culture.reward_tally[kind]))
	for kind in kinds.slice(0, 12):
		var value := float(culture.reward_tally[kind])
		lines.append("  %-26s %+8.1f  %3.0f%%" % [
			String(kind).substr(0, 26), value,
			absf(value) / maxf(total, 0.001) * 100.0])
	if kinds.is_empty():
		lines.append("  (nothing has taught this clan anything yet)")

	lines.append("")
	lines.append("  " + _router.debug_summary())

	if not _chronicle_lines.is_empty():
		lines.append("")
		lines.append("[b]chronicle[/b]")
		for line in _chronicle_lines.slice(maxi(0, _chronicle_lines.size() - 14)):
			lines.append("  " + line)

	_ledger.text = "\n".join(lines)


func _set_status(text: String) -> void:
	_status.text = text


# --- Drift chart ---------------------------------------------------------------

## Three layer norms and the policy entropy, over the culture's bounded history.
##
## Entropy is on this chart as deliberately as the norms are: a line sliding
## toward zero is a culture collapsing onto a single drive, and that is visible
## here long before it is visible as "why is the whole clan just standing there".
func _draw_chart() -> void:
	var culture := _culture()
	var history: Array = culture.drift_history
	var size := _chart.size
	_chart.draw_rect(Rect2(Vector2.ZERO, size), Color(0.09, 0.09, 0.12))
	if history.size() < 2:
		return

	var series := [
		{"key": "n0", "color": Color(0.45, 0.72, 1.0)},
		{"key": "n1", "color": Color(0.55, 0.95, 0.6)},
		{"key": "n2", "color": Color(1.0, 0.72, 0.35)},
		{"key": "entropy", "color": Color(0.95, 0.45, 0.75)},
	]
	for entry in series:
		var key: String = entry["key"]
		var peak := 0.0
		for sample in history:
			peak = maxf(peak, float(sample[key]))
		if peak <= 0.0:
			continue
		var points := PackedVector2Array()
		for i in history.size():
			points.append(Vector2(
				size.x * float(i) / float(history.size() - 1),
				size.y - size.y * float(history[i][key]) / peak * 0.9))
		_chart.draw_polyline(points, entry["color"], 1.5)

	_chart.draw_string(ThemeDB.fallback_font, Vector2(4, 14),
		"layer norms + entropy over %d samples" % history.size(),
		HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.6, 0.6, 0.65))


# --- Bus ----------------------------------------------------------------------

func _on_culture_shifted(culture_id: String, drive_id: String, delta: float) -> void:
	_chronicle_lines.append("%s: %s %+.3f" % [culture_id, drive_id, delta])


func _on_generation_advanced(culture_id: String, generation: int, retained: float) -> void:
	_chronicle_lines.append("%s reached generation %d (%.0f%% retained)"
		% [culture_id, generation, retained * 100.0])


# --- Smoke test ----------------------------------------------------------------

## Drives the panel end to end from bootstrap, on the same argument genome_lab
## makes: a debug tool that silently broke would cost more than it saves.
func run_smoke_test() -> Array[String]:
	var problems: Array[String] = []

	if _roster.size() != CLAN_SIZE:
		problems.append("expected %d clan members, found %d" % [CLAN_SIZE, _roster.size()])
	if _culture() == null:
		problems.append("no culture was founded on open")

	for section in ["CULTURE", "WHAT THE CLAN WANTS"]:
		if not _readout.text.contains(section):
			problems.append("readout is missing the %s section" % section)

	# Teaching must actually move the clan, or the bench is lying to a designer.
	_preset_picker.select(0)
	var target := AetherTypes.key_to_enum(AIController.State, "MIGRATE",
		AIController.State.IDLE)
	var before := _clan_probability(target)
	_teach(120)
	var after := _clan_probability(target)
	if after <= before:
		problems.append("teaching did not move the clan (%.3f -> %.3f)" % [before, after])
	if _culture().drift_history.size() < 2:
		problems.append("drift chart has %d samples after teaching"
			% _culture().drift_history.size())
	if _culture().reward_tally.is_empty():
		problems.append("reward ledger stayed empty after teaching")

	# Reset must be an exact undo, or it is not a safety net.
	var learned_blob := _culture().live.to_blob()
	var inherited_blob := _culture().locked.to_blob()
	_reset_live()
	if _culture().live.to_blob() != inherited_blob:
		problems.append("reset to inherited did not restore the locked weights")
	if learned_blob == inherited_blob:
		problems.append("teaching left the live and inherited weights identical")

	var generation_before := _culture().generation
	_advance_generation()
	if _culture().generation != generation_before + 1:
		problems.append("advancing a generation did not increment the counter")

	if not _seed_prior_works():
		problems.append("seeding a pretrained prior changed no output bias")

	_fork_clan()
	if CultureRegistry.count() < 2:
		problems.append("forking did not produce a second culture")

	# `queue_redraw`, not `_draw_chart` directly: drawing outside `_draw` is an
	# engine error, and this smoke test printed one on every run while still
	# reporting a clean pass. The chart is exercised by the redraw it schedules.
	_chart.queue_redraw()
	_refresh_all()
	if _ledger.text.is_empty():
		problems.append("ledger went blank after edits")

	return problems


func _seed_prior_works() -> bool:
	var culture := _culture()
	var index := GenomeDB.drive_index("fear")
	culture.live.set_output_bias(index, 0.0)
	culture.seed_prior("prior_timid")
	return not is_zero_approx(culture.live.output_bias(index))


func _clan_probability(target_state: int) -> float:
	var culture := _culture()
	culture.ensure_nets()
	var preset: Dictionary = TEACHING_PRESETS[maxi(0, _preset_picker.selected)]
	var perception := _perception_for(preset)
	var total := 0.0
	for creature in _roster:
		var probs := culture.live.policy(culture.live.forward(perception),
			(creature.ai as AIController).gate_logits(), 1.0).duplicate()
		for i in probs.size():
			var drive := GenomeDB.get_drive(GenomeDB.drive_id_at(i))
			if AetherTypes.key_to_enum(AIController.State,
					String(drive.get("state", "")), -1) == target_state:
				total += probs[i]
	return total / float(maxi(1, _roster.size()))
