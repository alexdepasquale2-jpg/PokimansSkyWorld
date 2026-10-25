extends PanelContainer
class_name PeoplePanel

## "Your People" — where the simulation stops hiding.
##
## THE SHAPE OF THIS SCREEN IS THE ARGUMENT. The top half is prose: who your
## clan are, what they have come to believe, what each animal is turning into.
## A player who never touches the toggle gets a game about a people they are
## responsible for, and never sees a weight matrix.
##
## The bottom half, behind one key, is the machine: policy shares, exploration
## temperature, drift from forebears, network shape, and the reward ledger that
## says what has actually been teaching them. Not a debug build, not a console
## flag — a menu, in the shipped game, one keystroke from the prose.
##
## That split is why the depth is worth having. A simulation nobody can read is
## indistinguishable from a random number generator; a simulation that shows its
## working to anyone who asks is the reason to play this rather than something
## with better art. The plain view earns trust and the advanced view rewards it.
##
## Every sentence up top comes from LoreVoice, which is also what the in-play
## event feed speaks through — so the menu and the feed can never contradict
## each other about what kind of people these are.

signal closed

const PANEL_WIDTH := 760
const MONO_SIZE := 13

var _session: Node = null
var _title: Label
var _prose: RichTextLabel
var _advanced: RichTextLabel
var _advanced_button: Button
var _roster: ItemList

var _cultures: Array[String] = []
var _selected_culture: String = ""
var _show_advanced: bool = false


func _init() -> void:
	custom_minimum_size = Vector2(PANEL_WIDTH, 520)
	_build()


func _build() -> void:
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	add_child(root)

	var header := HBoxContainer.new()
	root.add_child(header)
	_title = Label.new()
	_title.text = "Your People"
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.add_theme_font_size_override("font_size", 20)
	header.add_child(_title)

	_advanced_button = Button.new()
	_advanced_button.text = "Show the numbers  (V)"
	_advanced_button.pressed.connect(toggle_advanced)
	header.add_child(_advanced_button)

	var close := Button.new()
	close.text = "Close  (L)"
	close.pressed.connect(close_panel)
	header.add_child(close)

	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(split)

	_roster = ItemList.new()
	_roster.custom_minimum_size = Vector2(220, 0)
	_roster.item_selected.connect(_on_culture_picked)
	split.add_child(_roster)

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_child(right)

	_prose = RichTextLabel.new()
	_prose.bbcode_enabled = true
	_prose.fit_content = false
	_prose.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(_prose)

	# The advanced view is built but hidden, rather than built on demand: a
	# player toggling it should not wait, and the cost is one label.
	_advanced = RichTextLabel.new()
	_advanced.bbcode_enabled = false
	_advanced.visible = false
	_advanced.custom_minimum_size = Vector2(0, 230)
	_advanced.add_theme_font_size_override("normal_font_size", MONO_SIZE)
	_advanced.add_theme_font_size_override("mono_font_size", MONO_SIZE)
	right.add_child(_advanced)


# --- Lifecycle -------------------------------------------------------------------

func open(session: Node) -> void:
	_session = session
	visible = true
	_refresh_cultures()
	refresh()


func close_panel() -> void:
	visible = false
	closed.emit()


func toggle_advanced() -> void:
	_show_advanced = not _show_advanced
	_advanced.visible = _show_advanced
	_advanced_button.text = "Hide the numbers  (V)" if _show_advanced \
		else "Show the numbers  (V)"
	refresh()


# --- Content ----------------------------------------------------------------------

## Every clan the player's own creatures belong to. Cultures they have never met
## are deliberately absent: this is a menu about your people, not a census.
func _refresh_cultures() -> void:
	_cultures.clear()
	_roster.clear()
	for creature in _party():
		var id := CultureRegistry.culture_for(creature).culture_id
		if not _cultures.has(id):
			_cultures.append(id)
	for id in _cultures:
		var culture := CultureRegistry.get_culture(id)
		_roster.add_item(LoreVoice.clan_name(culture))
	if _selected_culture.is_empty() or not _cultures.has(_selected_culture):
		_selected_culture = _cultures[0] if not _cultures.is_empty() else ""
	var index := _cultures.find(_selected_culture)
	if index >= 0:
		_roster.select(index)


func _on_culture_picked(index: int) -> void:
	if index >= 0 and index < _cultures.size():
		_selected_culture = _cultures[index]
		refresh()


func refresh() -> void:
	if not visible:
		return
	var culture := CultureRegistry.get_culture(_selected_culture)
	var lines: Array[String] = []

	if culture == null:
		lines.append("You have no people yet.")
		_prose.text = "\n".join(lines)
		return

	lines.append("[b]%s[/b]" % LoreVoice.clan_name(culture))
	lines.append("")
	lines.append("They are %s." % LoreVoice.disposition(culture))
	lines.append("They are %s, and %s." % [
		LoreVoice.conviction(culture), LoreVoice.clan_history(culture)])
	lines.append("")
	lines.append("[i]Nobody taught them any of this. It is what living here has "
		+ "made of them, and it is shared — what one of them works out, all of "
		+ "them know.[/i]")

	# What the lineage has understood — the chosen inheritance, as against the
	# learned one described above. Plain names and plain stakes; the costs and the
	# branch structure are in the advanced view.
	var tree := NeuronalTree.for_clan(_selected_culture)
	lines.append("")
	lines.append("[b]What they have understood[/b]")
	var held: Array[String] = []
	var trying: Array[String] = []
	var lost: Array[String] = []
	for entry in tree.survey():
		match String(entry["state"]):
			"locked": held.append(String(entry["name"]))
			"pending": trying.append(String(entry["name"]))
			"forgotten": lost.append(String(entry["name"]))
	lines.append("  " + (", ".join(held) if not held.is_empty()
		else "Nothing yet. They are still only surviving."))
	if not trying.is_empty():
		# Parenthesised, and that is not style. `%` binds tighter than `+` in
		# GDScript, so the original applied the format to the SECOND fragment —
		# which has no placeholder — and shipped a literal "%s" to the player.
		# Neither the jargon assertions nor the blank-text ones can see that: it
		# is not an id, not a digit, and not empty.
		lines.append("  [i]Still working out: %s — none of it survives the next generation unless there are enough of them to carry it.[/i]"
			% ", ".join(trying))
	if not lost.is_empty():
		lines.append("  [i]Once knew, and lost: %s[/i]" % ", ".join(lost))
	lines.append("  %s" % LoreVoice.leap_readiness(tree))

	# What the run is for. Stated plainly and near the top, because a player who
	# does not know what they are aiming at is playing a screensaver.
	if _session != null and _session.arc != null:
		var arc: CampaignArc = _session.arc
		lines.append("")
		lines.append("[b]The bloodline[/b]")
		if arc.is_resolved():
			lines.append("  This run is over: %s." % arc.outcome_name().to_lower())
		else:
			lines.append("  %d of %d crossings behind them." % [
				arc.leaps_taken(), CampaignArc.EVOLUTION_LEAPS_TO_WIN])
			lines.append("  Carry them through %d more and the bloodline is somewhere "
				% arc.leaps_remaining() + "it could not have reached.")

	lines.append("")
	lines.append("[b]The clan[/b]")
	var counted := 0
	for creature in _party():
		if CultureRegistry.culture_for(creature).culture_id != _selected_culture:
			continue
		counted += 1
		lines.append("")
		lines.append("  [b]%s[/b] — %s" % [
			creature.display_name(), LoreVoice.creature_condition(creature)])
		lines.append("  %s" % LoreVoice.creature_blurb(creature))
		var becoming := LoreVoice.creature_becoming(creature)
		if not becoming.is_empty():
			lines.append("  [i]%s[/i]" % becoming)
	if counted == 0:
		lines.append("  (nobody from this clan is with you)")

	_prose.text = "\n".join(lines)

	if _show_advanced:
		_advanced.text = "\n".join(LoreVoice.advanced_lines(culture))


func _party() -> Array:
	var out: Array = []
	if _session == null or _session.party == null:
		return out
	for entry in _session.party.active:
		if is_instance_valid(entry) and (entry as Creature).identity != null:
			out.append(entry)
	return out


# --- Smoke test --------------------------------------------------------------------

## Same contract as every other panel here: a debug tool — or in this case the
## screen that justifies the whole simulation — that silently broke would cost
## more than it saves.
func run_smoke_test(session: Node) -> Array[String]:
	var problems: Array[String] = []
	open(session)

	if _prose.text.is_empty():
		problems.append("the plain-language view is blank")
	for jargon in ["foraging_priority", "softmax", "logit", "culture_id",
			"applies", "PackedFloat32Array"]:
		if _prose.text.contains(jargon):
			problems.append("jargon '%s' leaked into the plain view" % jargon)

	# AN UNFORMATTED FORMAT SPECIFIER is its own class of bug, and nothing else
	# here can see it: "%s" is not an id, not a digit, and not empty. One
	# shipped — `"a" + "b" % args` applies the format to "b", because `%` binds
	# tighter than `+` in GDScript — and this screen read "Still working out: %s"
	# until somebody rendered it and looked at it.
	for specifier in ["%s", "%d", "%.1f", "%.2f"]:
		if _prose.text.contains(specifier):
			problems.append("an unformatted '%s' reached the player" % specifier)

	# And the disposition has to complete the sentence this screen wraps it in.
	if _prose.text.contains("They are no ") or _prose.text.contains("They are a people"):
		problems.append("the disposition does not complete 'They are ___'")

	if _show_advanced:
		problems.append("the advanced view is open before it was asked for")
	toggle_advanced()
	if not _advanced.visible:
		problems.append("the advanced view did not open")
	if _advanced.text.is_empty() and not _cultures.is_empty():
		problems.append("the advanced view is blank with a clan selected")
	toggle_advanced()
	if _advanced.visible:
		problems.append("the advanced view did not close again")

	close_panel()
	if visible:
		problems.append("the panel did not close")
	return problems
