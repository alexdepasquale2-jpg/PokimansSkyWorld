extends PanelContainer
class_name NeuronPanel

## Understandings — the screen where the player decides what their people become.
##
## THE MECHANIC WAS COMPLETE AND UNPLAYABLE. Energy accrued, neurons could be
## reinforced, generations locked or lost them and leaps consumed them — all of
## it correct, tested, and reachable only from GDScript. A player could watch the
## clan understand things and never once choose one. This is the missing half.
##
## WHAT THIS SCREEN HAS TO COMMUNICATE, in priority order, because getting the
## order wrong makes the whole system read as a shop:
##
##   1. what is at stake right now — pending understandings are NOT yours yet,
##      and how many you can keep depends on how many of you are alive;
##   2. what a thing costs and whether it is open;
##   3. what it means, in a sentence, because "Precision Grip +0.3 grip" tells a
##      player nothing about why their people are different now.
##
## THE SUPPORT LINE IS THE WHOLE DESIGN. Ancestors' generational lock is not a
## tax on progress, it is the reason progress is frightening — and a player who
## does not see "you can hold three of these and you have reinforced five"
## before the generation turns will experience the loss as the game cheating
## rather than as a decision they made. So it is stated, continuously, in plain
## words, above everything else.

signal closed

const PANEL_WIDTH := 820
const MONO_SIZE := 13

var _session: Node = null
var _clan_id: String = "culture_colony"

var _stakes: RichTextLabel
var _tree_view: NeuronTreeView
var _detail: RichTextLabel
var _reinforce_button: Button
var _cross_button: Button
var _status: Label

var _rows: Array[Dictionary] = []


func _init() -> void:
	custom_minimum_size = Vector2(PANEL_WIDTH, 560)
	_build()


func _build() -> void:
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	add_child(root)

	var header := HBoxContainer.new()
	root.add_child(header)
	var title := Label.new()
	title.text = "Understandings"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_size_override("font_size", 20)
	header.add_child(title)

	_cross_button = Button.new()
	_cross_button.text = "Cross  (X)"
	_cross_button.pressed.connect(take_leap)
	header.add_child(_cross_button)

	var close := Button.new()
	close.text = "Close  (N)"
	close.pressed.connect(close_panel)
	header.add_child(close)

	# The stakes, above everything. See the class comment.
	_stakes = RichTextLabel.new()
	_stakes.bbcode_enabled = true
	_stakes.fit_content = true
	_stakes.custom_minimum_size = Vector2(0, 86)
	root.add_child(_stakes)

	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(split)

	# A drawn tree rather than a list, inside a scroller so a deeper catalog
	# still fits. What unlocks what is the only thing a player can plan against.
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(430, 0)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	split.add_child(scroll)
	_tree_view = NeuronTreeView.new()
	_tree_view.picked.connect(func(_id: String): _refresh_detail())
	scroll.add_child(_tree_view)

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_child(right)

	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_detail.add_theme_font_size_override("normal_font_size", MONO_SIZE)
	right.add_child(_detail)

	_reinforce_button = Button.new()
	_reinforce_button.text = "Reinforce  (Enter)"
	_reinforce_button.pressed.connect(reinforce_selected)
	right.add_child(_reinforce_button)

	_status = Label.new()
	_status.add_theme_font_size_override("font_size", 12)
	root.add_child(_status)


# --- Lifecycle ---------------------------------------------------------------------

func open(session: Node, clan_id: String = "culture_colony") -> void:
	_session = session
	_clan_id = clan_id
	visible = true
	refresh()


func close_panel() -> void:
	visible = false
	closed.emit()


func tree() -> NeuronalTree:
	return NeuronalTree.for_clan(_clan_id)


# --- Actions ------------------------------------------------------------------------

func reinforce_selected() -> bool:
	var row := _selected_row()
	if row.is_empty():
		_set_status("Nothing selected.")
		return false
	var id := String(row["id"])
	var neuronal := tree()

	# Refusals are explained rather than merely refused. A greyed-out button with
	# no reason is how a player concludes a system is broken.
	if neuronal.is_held(id):
		_set_status("%s is already theirs." % row["name"])
		return false
	if not neuronal.prerequisites_met(id):
		_set_status("%s is out of reach until what it builds on is theirs for good."
			% row["name"])
		return false
	if neuronal.energy < neuronal.cost_of(id):
		_set_status("Not enough understanding banked — %s needs %d, they have %d."
			% [row["name"], int(neuronal.cost_of(id)), int(neuronal.energy)])
		return false

	if not neuronal.reinforce(id):
		_set_status("They could not hold on to that idea.")
		return false
	_set_status(LoreVoice.reinforced_sentence(id))
	refresh()
	return true


func take_leap() -> bool:
	var neuronal := tree()
	if not neuronal.leap_ready():
		_set_status("Not yet. %s" % LoreVoice.leap_readiness(neuronal))
		return false
	# Everything merely being tried is abandoned by a crossing, so say so before
	# it happens rather than after.
	var abandoned := neuronal.pending.size()
	if not neuronal.take_leap():
		return false
	_set_status("They cross." + (
		"  %d unfinished idea(s) did not come with them." % abandoned
			if abandoned > 0 else ""))
	refresh()
	return true


# --- Content --------------------------------------------------------------------------

func refresh() -> void:
	if not visible:
		return
	var neuronal := tree()
	_refresh_stakes(neuronal)
	_refresh_list(neuronal)
	_refresh_detail()
	_cross_button.disabled = not neuronal.leap_ready()
	_cross_button.text = "Cross  (X)" if neuronal.leap_ready() else "Cross — not yet"


## The line that makes the generational lock a decision instead of an ambush.
func _refresh_stakes(neuronal: NeuronalTree) -> void:
	var living := _living()
	var holdable := int(floor(float(living) / NeuronalTree.SUPPORT_PER_PENDING))
	var pending := neuronal.pending.size()

	var lines: Array[String] = []
	lines.append("[b]%d understanding banked.[/b]  %s" % [
		int(neuronal.energy), LoreVoice.leap_readiness(neuronal)])

	if pending == 0:
		lines.append("Nothing is at risk. There are %d of you; you could carry %d "
			% [living, holdable] + "new understanding(s) through the next generation.")
	elif pending <= holdable:
		lines.append("[color=#8fdc8f]%d being worked out, and %d of you to carry them. "
			% [pending, living] + "All of it survives the next generation.[/color]")
	else:
		# The important case, and the one the player must not discover afterwards.
		lines.append("[color=#ff8f6f][b]%d being worked out and only %d of you.[/b] "
			% [pending, living]
			+ "When the next generation turns, %d of them will be lost — the most "
			% (pending - holdable)
			+ "ambitious first. Find more people, or expect to forget.[/color]")
	_stakes.text = "\n".join(lines)


func _refresh_list(neuronal: NeuronalTree) -> void:
	_rows.clear()
	var survey := neuronal.survey()
	for entry in survey:
		_rows.append(entry)
	var keep := _tree_view.selected()
	_tree_view.set_survey(survey)
	if keep.is_empty():
		_tree_view.select_first_interesting()
	else:
		_tree_view.select(keep)


func _refresh_detail() -> void:
	var row := _selected_row()
	if row.is_empty():
		_detail.text = "[i]Choose an understanding.[/i]"
		_reinforce_button.disabled = true
		return

	var neuronal := tree()
	var id := String(row["id"])
	var state := String(row["state"])
	var lines: Array[String] = []
	lines.append("[b]%s[/b]   [i]%s[/i]" % [row["name"], String(row["branch"])])
	lines.append("")
	lines.append(String(row["description"]))
	lines.append("")

	match state:
		"locked":
			lines.append("[color=#8fdc8f]Theirs for good. It passes to every "
				+ "generation after this one.[/color]")
		"pending":
			lines.append("[color=#ffd966]Being worked out. It is not theirs until a "
				+ "generation carries it, and a clan too thin will lose it.[/color]")
		"forgotten":
			lines.append("[color=#d97070]They understood this once and could not keep "
				+ "it. It can be worked out again.[/color]")
		"closed":
			var missing: Array[String] = []
			for required in NeuronalTree.definition(id).get("prerequisites", []):
				if not neuronal.is_locked(required):
					missing.append(LoreVoice.neuron_name(String(required)))
			lines.append("[color=#9a9aa4]Out of reach until they have %s for good."
				% ", ".join(missing) + "[/color]")
		_:
			lines.append("Costs %d of the %d they have banked."
				% [int(row["cost"]), int(neuronal.energy)])

	# What it actually does, plainly. The advanced numbers live in the People
	# menu's toggle; here it is what the clan becomes.
	var effects: Array[String] = []
	for trait_key in NeuronalTree.definition(id).get("traits", {}):
		effects.append(String(trait_key).replace("_", " "))
	if not effects.is_empty():
		lines.append("")
		lines.append("[i]Changes: %s.[/i]" % ", ".join(effects))

	_detail.text = "\n".join(lines)
	_reinforce_button.disabled = not bool(row.get("affordable", false)) \
		or neuronal.is_held(id)


func _selected_row() -> Dictionary:
	var id := _tree_view.selected()
	if id.is_empty():
		return {}
	for row in _rows:
		if String(row["id"]) == id:
			return row
	return {}


## Living members of the clan — the number that decides how much can be carried.
##
## Asked of CultureRegistry rather than counted here, because this screen's whole
## job is to warn the player what the next generation will cost them. It used to
## count only the party while the boundary used a different number entirely, so
## the warning was arithmetic about people the boundary was not looking at. One
## count, or the screen lies.
func _living() -> int:
	var counted := CultureRegistry.living_members(_clan_id)
	if counted > 0 or _session == null or _session.party == null:
		return counted
	# Nothing registered with the simulation — a bench, or a panel opened before
	# landfall. Fall back to the party so the screen still says something true.
	var living := 0
	for entry in _session.party.active:
		var c: Creature = entry
		if is_instance_valid(c) and c.needs != null and not c.needs.is_dead():
			living += 1
	return living


func _set_status(text: String) -> void:
	_status.text = text


# --- Smoke test ----------------------------------------------------------------------------

## Drives the screen the way a player would, on the same argument every other
## panel here carries: a progression screen that silently broke would be
## discovered by a player, not by us.
func run_smoke_test(session: Node) -> Array[String]:
	var problems: Array[String] = []
	var neuronal := NeuronalTree.for_clan("clan_panel")
	open(session, "clan_panel")

	if _tree_view.node_count() != NeuronalTree.ids().size():
		problems.append("the tree does not show every understanding (%d of %d)"
			% [_tree_view.node_count(), NeuronalTree.ids().size()])
	# The point of drawing it is the dependencies. A tree with no edges is the
	# list this replaced, wearing a different hat.
	if _tree_view.edge_count() < NeuronalTree.ids().size() / 2:
		problems.append("the tree draws almost no prerequisites (%d edges)"
			% _tree_view.edge_count())
	if _tree_view.selected().is_empty():
		problems.append("nothing is selected when the screen opens")
	if _stakes.text.is_empty():
		problems.append("the stakes line is blank")

	# With nothing banked, reinforcing must refuse AND say why.
	neuronal.energy = 0.0
	refresh()
	_select_first_selectable()
	if reinforce_selected():
		problems.append("reinforced something with no understanding banked")
	if _status.text.is_empty():
		problems.append("a refusal did not explain itself")

	# With energy, a root understanding must be reachable and buyable.
	neuronal.energy = 500.0
	refresh()
	_select_first_selectable()
	var before := neuronal.pending.size()
	if not reinforce_selected():
		problems.append("could not reinforce with plenty banked (%s)" % _status.text)
	if neuronal.pending.size() <= before:
		problems.append("reinforcing did not make anything pending")

	# The stakes line must turn to a warning when the clan cannot carry what it
	# is trying to learn. This is the screen's whole job.
	for id in NeuronalTree.ids():
		if neuronal.can_reinforce(id):
			neuronal.reinforce(id)
	refresh()
	if not _stakes.text.contains("lost"):
		problems.append("over-reinforcing did not warn that understandings will be lost")

	# Crossing must refuse when not ready, and work when it is.
	if take_leap():
		problems.append("crossed without enough understanding")
	neuronal.advance_generation(1000.0)
	while not neuronal.leap_ready():
		var moved := false
		neuronal.energy = 5000.0
		for id in NeuronalTree.ids():
			if neuronal.can_reinforce(id):
				neuronal.reinforce(id)
				moved = true
		neuronal.advance_generation(1000.0)
		if not moved:
			break
	if neuronal.leap_ready() and not take_leap():
		problems.append("could not cross when ready (%s)" % _status.text)

	_refresh_detail()
	if _detail.text.is_empty():
		problems.append("the detail pane is blank")

	close_panel()
	if visible:
		problems.append("the panel did not close")
	NeuronalTree.reset()
	return problems


func _select_first_selectable() -> void:
	_tree_view.select_first_interesting()
	_refresh_detail()
