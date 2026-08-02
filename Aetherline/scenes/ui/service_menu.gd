extends Control
class_name ServiceMenu

## The interaction loop for one building. Opens on approach, lists what its
## NPC can do for you, executes the service, reports back.
##
## Every service here is written to matter at more than one point in the
## campaign — see each building's `early_value` / `late_value` in
## data/settlements/buildings.json, which the menu shows the player directly so
## the reason to come back is never a secret.

signal closed()

var session: GameSession
var colony: Array = []          ## Array[Creature] — hero + companions.
var _entry: Dictionary = {}
var _definition: Dictionary = {}

var _title: Label
var _dialogue: Label
var _body: RichTextLabel
var _actions: VBoxContainer
var _rng := RandomNumberGenerator.new()
var _frame: FxPanel


func _ready() -> void:
	_rng.randomize()
	_build_ui()
	visible = false


func open(entry: Dictionary, game_session: GameSession, colony_creatures: Array) -> void:
	_entry = entry
	_definition = SettlementGenerator.get_building(entry["building_id"])
	session = game_session
	colony = colony_creatures
	visible = true
	_refresh()


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := FxPanel.new(Color(0.85, 0.65, 0.35))
	_frame = panel
	panel.custom_minimum_size = Vector2(620, 460)
	center.add_child(panel)

	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	panel.add_child(margin)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	margin.add_child(box)

	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 24)
	box.add_child(_title)

	_dialogue = Label.new()
	_dialogue.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialogue.add_theme_color_override("font_color", Color(0.85, 0.82, 0.65))
	box.add_child(_dialogue)

	box.add_child(HSeparator.new())

	_actions = VBoxContainer.new()
	box.add_child(_actions)

	box.add_child(HSeparator.new())

	_body = RichTextLabel.new()
	_body.bbcode_enabled = true
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.custom_minimum_size.y = 150
	box.add_child(_body)

	var close := FxButton.new(Color(0.6, 0.6, 0.68))
	close.text = "Leave"
	close.custom_minimum_size = Vector2(0, 34)
	close.pressed.connect(func():
		visible = false
		closed.emit())
	box.add_child(close)


func _refresh() -> void:
	_title.text = "%s — %s %s" % [_definition["display_name"],
		_entry["npc_role"], _entry["npc_name"]]
	_dialogue.text = "\"%s\"" % _definition.get("greeting", "")

	for child in _actions.get_children():
		child.queue_free()
	for service in _definition.get("services", []):
		var label := _service_label(String(service))
		if label.is_empty():
			continue  # a colony-era service with no meaning in this game
		var button := FxButton.new(Color(0.85, 0.65, 0.35))
		button.text = label
		button.custom_minimum_size = Vector2(0, 32)
		button.pressed.connect(func(): _perform(String(service)))
		_actions.add_child(button)

	if _actions.get_child_count() == 0:
		var nothing := Label.new()
		nothing.text = "Nothing here for you today."
		nothing.add_theme_color_override("font_color", Color(0.6, 0.6, 0.66))
		_actions.add_child(nothing)

	_report("[i]%s[/i]\n\nNow: %s\nLater: %s" % [
		_definition.get("description", ""),
		_definition.get("early_value", ""), _definition.get("late_value", "")])


## Everything a settlement sells is priced in SALVAGE — the game's one
## currency. No inventory, no material shopping list.
const PRICES := {
	"heal": 0.0, "rest": 0.0,
	"breed": 15.0, "assay": 20.0, "purge": 40.0,
	"divine": 10.0, "consecrate": 60.0, "trade": 0.0, "rumor": 0.0,
}


func _service_label(service: String) -> String:
	var label: String = {
		"heal": "Rest your team — back to full",
		"rest": "Sleep here — back to full",
		"breed": "Use the breeding stalls",
		"assay": "Read what your creatures are hiding",
		"purge": "Ease a creature's worst scar",
		"divine": "Read what your creatures are becoming",
		"consecrate": "Push a creature over the edge",
		"rumor": "Ask about distant worlds",
		"trade": "Sell surplus for salvage",
	}.get(service, "")
	if label.is_empty():
		return ""
	var cost := float(PRICES.get(service, 0.0))
	return label if cost <= 0.0 else "%s  —  %.0f salvage" % [label, cost]


## Spend salvage. Returns false and reports if you cannot afford it.
func _charge(service: String) -> bool:
	var cost := float(PRICES.get(service, 0.0))
	if cost <= 0.0:
		return true
	if session.ship.salvage < cost:
		_report("That costs %.0f salvage. You have %.0f." % [cost, session.ship.salvage])
		return false
	session.ship.salvage -= cost
	return true


func _report(text: String) -> void:
	_body.text = text
	if _frame != null:
		_frame.flash(0.5)


# --- Services ---------------------------------------------------------------------
#
# Only the services that mean something in a catching game survived the cut.
# Anything a building still advertises that isn't handled here is filtered out
# of the menu by _service_label returning "".

func _perform(service: String) -> void:
	match service:
		"heal", "rest": _rest_team()
		"breed": _breed()
		"assay": _assay()
		"purge": _purge()
		"divine": _divine()
		"consecrate": _consecrate()
		"rumor": _rumor()
		"trade": _trade()


## The only healing in the game. Free, because a game about exploring should
## never strand you — the cost of losing a fight is time, not a resource.
func _rest_team() -> void:
	session.party.heal_all()
	_report("Your team sleeps under a roof.\n\nEveryone is back to full.")


func _breed() -> void:
	if not _charge("breed"):
		return
	var eligible: Array = session.party.active.filter(func(c):
		return is_instance_valid(c) and c.stats.hp > 0.0)
	if eligible.size() < 2:
		_report("You need two creatures with you for the stalls.")
		return
	for i in eligible.size():
		for j in range(i + 1, eligible.size()):
			var result := BreedingSystem.breed(
				eligible[i], eligible[j], get_tree().current_scene, _rng)
			if not result["success"]:
				continue
			var child: Creature = result["child"]
			get_tree().current_scene.call("adopt_offspring", child)
			_report("[b]%s[/b]\n\nborn to %s and %s.\n\n%s" % [
				child.display_name(),
				eligible[i].display_name(), eligible[j].display_name(),
				"Something new surfaced in it."
					if not (result["mutations"] as Array).is_empty()
					else "It takes after its parents."])
			return
	_report("No viable pairing among your creatures.")


func _assay() -> void:
	if not _charge("assay"):
		return
	var lines: Array[String] = []
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		var hidden := PhenotypeResolver.hidden_carriers(c.genetics.genome)
		lines.append("[b]%s[/b]" % c.display_name())
		if hidden.is_empty():
			lines.append("  carries nothing hidden")
		for h in hidden.slice(0, 4):
			lines.append("  %s (%s)" % [h["name"], h["reason"]])
	_report("\n".join(lines) if not lines.is_empty() else "You have nothing to assay.")


func _purge() -> void:
	if not _charge("purge"):
		return
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		for mark in c.epigenetics.profile.marks:
			if mark.has_tag(&"trauma"):
				c.epigenetics.profile.remove(mark.uid)
				c.stats.mark_dirty()
				_report("Eased '%s' out of %s.\n\nIt sleeps easier now."
					% [mark.display_name, c.display_name()])
				return
	_report("Nothing you have carries a scar worth easing.")


func _divine() -> void:
	if not _charge("divine"):
		return
	var lines: Array[String] = []
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		var best := ""
		var best_progress := 0.0
		for archetype_id in c.archetype.state.progress:
			if c.archetype.state.is_crystallized(archetype_id):
				continue
			var p := c.archetype.state.get_progress(archetype_id)
			if p > best_progress:
				best_progress = p
				var d: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
				best = d.display_name if d != null else String(archetype_id)
		if not best.is_empty():
			lines.append("  %-18s is becoming %s (%.0f%%)"
				% [c.display_name(), best, best_progress * 100.0])
	_report("\"This is what they are turning into.\"\n\n" + "\n".join(lines)
		if not lines.is_empty() else "\"None of them are becoming anything yet.\"")


func _consecrate() -> void:
	if not _charge("consecrate"):
		return
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		for archetype_id in c.archetype.state.progress:
			var p := c.archetype.state.get_progress(archetype_id)
			if p >= 0.55 and p < 1.0 and not c.archetype.state.is_crystallized(archetype_id):
				# Pushed over, not handed out — it still had to live most of
				# the way there on its own.
				c.archetype.state.set_progress(archetype_id, 1.0)
				c.archetype.evaluate()
				_report("Something settles in %s.\n\nIt is what it was becoming."
					% c.display_name())
				return
	_report("\"Nothing you have is close enough to push.\"")


## Rumours are real navigation: they name a world that actually exists and say
## what it would do to the creatures you bring there.
func _rumor() -> void:
	var candidate := PlanetManager.create_planet()
	PlanetGenerator.derive(candidate)
	var pressures: Array[String] = []
	for key in candidate.epigenetic_pressures:
		var mark := GenomeDB.get_epi_template(key)
		pressures.append(mark.display_name if mark != null else String(key))
	_report("\"There's a world called %s out that way.\"\n\n  %s star · %.0f C · gravity %.2f\n  %d lifeforms\n  it would shape them: %s" % [
		candidate.display_name, candidate.star_class, candidate.mean_temperature_c,
		candidate.surface_gravity_g, candidate.fauna_species_count,
		", ".join(pressures) if not pressures.is_empty() else "not at all"])


## Selling off what you gathered. The gathering verb still exists because
## walking past something interesting and picking it up is good; it just feeds
## salvage instead of an inventory.
func _trade() -> void:
	session.ship.add_salvage(8.0)
	_report("Sold what you were carrying.\n\n+8 salvage.")
