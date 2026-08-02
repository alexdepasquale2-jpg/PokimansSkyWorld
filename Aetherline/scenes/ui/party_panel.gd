extends Control
class_name PartyPanel

## Your team and everything on the ship.
##
## Also the ONLY place the genetics simulation surfaces. A player who never
## opens this screen still has a complete game; a player who does finds the
## whole depth — traits, what an animal is hiding, what it's turning into.
## That is the deal: complexity is available, never mandatory.

var session: GameSession
var _owner_scene: Node
var _party_list: ItemList
var _stored_list: ItemList
var _detail: RichTextLabel
var _frame: FxPanel


func _ready() -> void:
	_build_ui()
	visible = false


func open(game_session: GameSession, owner_scene: Node) -> void:
	session = game_session
	_owner_scene = owner_scene
	visible = true
	_refresh()


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	_frame = FxPanel.new(Color(0.45, 0.8, 0.95))
	_frame.custom_minimum_size = Vector2(880, 520)
	center.add_child(_frame)
	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	_frame.add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	margin.add_child(root)

	var title := Label.new()
	title.text = "PARTY"
	title.add_theme_font_size_override("font_size", 24)
	root.add_child(title)

	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(split)

	var lists := VBoxContainer.new()
	lists.custom_minimum_size.x = 320
	split.add_child(lists)

	lists.add_child(_titled("With you"))
	_party_list = ItemList.new()
	_party_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_party_list.item_selected.connect(func(i): _show_party(i))
	lists.add_child(_party_list)

	lists.add_child(_titled("On the ship"))
	_stored_list = ItemList.new()
	_stored_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_stored_list.item_selected.connect(func(i): _show_stored(i))
	lists.add_child(_stored_list)

	var scroll := ScrollContainer.new()
	split.add_child(scroll)
	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.scroll_active = false
	_detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_detail)

	var buttons := HBoxContainer.new()
	root.add_child(buttons)
	_add_button(buttons, "Send to ship", Color(0.6, 0.6, 0.7), _deposit_selected)
	_add_button(buttons, "Bring out", Color(0.4, 0.85, 0.55), _withdraw_selected)
	_add_button(buttons, "Close", Color(0.6, 0.6, 0.68), func(): visible = false)


func _titled(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_color_override("font_color", Color(0.6, 0.78, 0.9))
	return label


func _add_button(parent: Node, text: String, accent: Color, handler: Callable) -> void:
	var b := FxButton.new(accent)
	b.text = text
	b.custom_minimum_size = Vector2(150, 34)
	b.pressed.connect(handler)
	parent.add_child(b)


# --- Contents ------------------------------------------------------------------------

func _refresh() -> void:
	_party_list.clear()
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		_party_list.add_item("%s   %d/%d hp%s" % [c.display_name(),
			int(c.stats.hp), int(c.stats.max_hp()),
			"   DOWNED" if c.stats.downed else ""])

	_stored_list.clear()
	for data in session.party.stored:
		var identity: Dictionary = data.get("identity", {})
		_stored_list.add_item(String(identity.get("given_name", "?")))

	if not session.party.active.is_empty():
		_party_list.select(0)
		_show_party(0)


func _show_party(index: int) -> void:
	if index < 0 or index >= session.party.active.size():
		return
	var c: Creature = session.party.active[index]
	if not is_instance_valid(c):
		return

	var lines: Array[String] = []
	lines.append("[b]%s[/b]" % c.display_name())
	lines.append("[color=#9a9aa5]%s · generation %d · born on %s[/color]" % [
		DiscoverySystem.describe_species(c.genetics.genome),
		c.identity.generation,
		c.identity.birth_planet_name if not c.identity.birth_planet_name.is_empty()
			else "somewhere"])
	lines.append("")

	var d := c.stats.derived()
	lines.append("  hp        %d / %d" % [int(c.stats.hp), int(d["max_hp"])])
	lines.append("  attack    %.1f" % d["attack_power"])
	lines.append("  defense   %.1f" % d["defense"])
	lines.append("  speed     %.0f" % d["move_speed"])

	# Archetype — the closest thing this game has to an evolution.
	var becoming := ""
	var best := 0.0
	for archetype_id in c.archetype.state.progress:
		if c.archetype.state.is_crystallized(archetype_id):
			var crystal: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
			lines.append("")
			lines.append("[color=#ffd98a]** %s **[/color]" % crystal.display_name)
			lines.append("[color=#9a9aa5]%s[/color]" % crystal.description)
			becoming = ""
			break
		var p := c.archetype.state.get_progress(archetype_id)
		if p > best:
			best = p
			var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
			becoming = definition.display_name if definition != null else String(archetype_id)
	if not becoming.is_empty() and best > 0.15:
		lines.append("")
		lines.append("[color=#c9a7ff]becoming %s — %d%%[/color]" % [becoming, int(best * 100.0)])

	# The hidden half. Gated on the ship's bio-sensor, so upgrading it visibly
	# opens up the breeding game.
	lines.append("")
	if session.ship.reveal_depth() >= 2:
		var hidden := PhenotypeResolver.hidden_carriers(c.genetics.genome)
		lines.append("[b]CARRIES[/b]")
		if hidden.is_empty():
			lines.append("  nothing hidden")
		for h in hidden.slice(0, 6):
			lines.append("  %s (%s)" % [h["name"], h["reason"]])
	else:
		lines.append("[color=#8a8a95]Upgrade the Bio-Sensor to read what it carries.[/color]")

	# Epigenetic marks are flavour here and nowhere else — never narrated at
	# the player in the world log.
	if not c.epigenetics.profile.marks.is_empty():
		lines.append("")
		lines.append("[b]SHAPED BY[/b]")
		for mark in c.epigenetics.profile.marks:
			lines.append("  %s" % mark.display_name)

	_detail.text = "\n".join(lines)


func _show_stored(index: int) -> void:
	if index < 0 or index >= session.party.stored.size():
		return
	var data: Dictionary = session.party.stored[index]
	var identity: Dictionary = data.get("identity", {})
	_detail.text = "[b]%s[/b]\n\n[color=#9a9aa5]Held on the ship. Bring it out to see more.[/color]" \
		% identity.get("given_name", "?")


# --- Actions -------------------------------------------------------------------------

func _deposit_selected() -> void:
	var selected := _party_list.get_selected_items()
	if selected.is_empty() or session.party.active.size() <= 1:
		return
	session.party.deposit(session.party.active[selected[0]])
	_frame.flash(0.5)
	_refresh()


func _withdraw_selected() -> void:
	var selected := _stored_list.get_selected_items()
	if selected.is_empty():
		return
	if not session.party.has_room(session.ship):
		_detail.text = "[color=#ff9a9a]Party is full. Send one to the ship first,\nor upgrade the Habitat Ring.[/color]"
		return
	var brought := session.party.withdraw(selected[0], _owner_scene, session.ship)
	if brought != null:
		brought.position = _owner_scene.player.position
		_frame.flash(0.6)
	_refresh()
