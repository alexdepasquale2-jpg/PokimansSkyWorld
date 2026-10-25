extends Control
class_name EndingScreen

## What this lineage was, when there is no more of it.
##
## THE MOST IMPORTANT MOMENT IN THE GAME WAS THE LEAST BUILT. A run that ended
## printed four lines into the same scrolling feed that carries "The Vess are
## becoming bolder", then paused the simulation and left the player standing in a
## frozen world with no acknowledgement and nowhere to go. Quitting from there
## SAVED the finished run, and the menu's Continue loaded it straight back — a
## resolved campaign with a dead clan, an arc that had already latched and would
## never fire again, and no ending, because the ending had already scrolled past.
##
## So this takes the screen. It says what they understood and what they could not
## keep, by name, out of the same LoreVoice sentences the feed speaks — a player
## who reads this and a player who read the feed are told the same things in the
## same words.
##
## IT OFFERS A WAY OUT, which is the part that was actually broken rather than
## merely thin. Begin Again clears the slot before starting, or Continue would
## keep reopening the corpse.

signal begin_again
signal to_menu

const PANEL_WIDTH := 720

var _title: Label
var _body: RichTextLabel
var _again: Button
var _menu: Button

var _outcome: int = CampaignArc.Outcome.UNRESOLVED


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()


func _build() -> void:
	# A full-screen scrim, because everything under this is over and should read
	# that way rather than competing for attention.
	var scrim := ColorRect.new()
	scrim.set_anchors_preset(Control.PRESET_FULL_RECT)
	scrim.color = Color(0.02, 0.02, 0.04, 0.88)
	add_child(scrim)

	var centre := CenterContainer.new()
	centre.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(centre)

	var panel := FxPanel.new(Color(0.85, 0.72, 0.45), 0.92)
	panel.custom_minimum_size = Vector2(PANEL_WIDTH, 0)
	centre.add_child(panel)

	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 28)
	panel.add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	margin.add_child(column)

	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 28)
	column.add_child(_title)

	_body = RichTextLabel.new()
	_body.bbcode_enabled = true
	_body.fit_content = true
	_body.custom_minimum_size = Vector2(PANEL_WIDTH - 56, 200)
	column.add_child(_body)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 12)
	column.add_child(buttons)

	_again = Button.new()
	_again.text = "Begin again"
	_again.custom_minimum_size = Vector2(180, 40)
	_again.pressed.connect(func(): begin_again.emit())
	buttons.add_child(_again)

	_menu = Button.new()
	_menu.text = "Back to the menu"
	_menu.custom_minimum_size = Vector2(180, 40)
	_menu.pressed.connect(func(): to_menu.emit())
	buttons.add_child(_menu)


## Show a resolved run. `chronicle` is CampaignArc.chronicle().
func show_ending(outcome: int, chronicle: Dictionary) -> void:
	_outcome = outcome
	var lines := LoreVoice.ending_lines(outcome, chronicle)

	# The first line is the verdict and carries its own emphasis; it belongs in
	# the heading rather than the body, so a player knows in one glance which of
	# the two endings this is.
	_title.text = _strip(lines[0]) if not lines.is_empty() else "The run is over."
	_title.add_theme_color_override("font_color",
		Color(0.95, 0.85, 0.55) if outcome == CampaignArc.Outcome.TRIUMPH
			else Color(0.85, 0.55, 0.55))
	_body.text = "\n\n".join(lines.slice(1))

	visible = true
	_again.grab_focus()


func outcome() -> int:
	return _outcome


static func _strip(text: String) -> String:
	return text.replace("[b]", "").replace("[/b]", "").replace("[i]", "").replace("[/i]", "")


# --- Smoke test --------------------------------------------------------------------

## Same contract as every other screen here. This one is worth more than most: it
## is shown exactly twice in a campaign's life, at the two moments a player is
## least willing to forgive a blank panel.
func run_smoke_test() -> Array[String]:
	var problems: Array[String] = []

	for outcome in [CampaignArc.Outcome.EXTINCTION, CampaignArc.Outcome.TRIUMPH]:
		show_ending(outcome, {
			"leaps": 3, "generations": 6, "peak_members": 8, "deaths": 4,
			"understood": ["Grip", "Listening"], "lost": ["Balance"],
		})
		if _title.text.is_empty():
			problems.append("the verdict is blank")
		if _body.text.is_empty():
			problems.append("the chronicle is blank")
		for markup in ["[b]", "[/b]"]:
			if _title.text.contains(markup):
				problems.append("markup leaked into the heading")
		if not _body.text.contains("Grip"):
			problems.append("the ending does not say what they understood")
		if not _body.text.contains("Balance"):
			problems.append("the ending does not say what they lost")

	# The two endings must not read the same. A run you won and a run you lost
	# telling the same story is the whole point missed.
	show_ending(CampaignArc.Outcome.TRIUMPH, {"generations": 2})
	var won := _title.text
	show_ending(CampaignArc.Outcome.EXTINCTION, {"generations": 2})
	if won == _title.text:
		problems.append("winning and losing read identically")

	# A clan that achieved nothing still gets a sentence rather than a gap.
	show_ending(CampaignArc.Outcome.EXTINCTION, {})
	if _body.text.strip_edges().is_empty():
		problems.append("a clan that understood nothing gets a blank ending")

	# Collected into an array, not counted into an int: a GDScript lambda captures
	# locals BY VALUE, so `pressed += 1` inside the handler increments a copy and
	# this check would fail (or, with the comparison the other way round, pass) on
	# a signal that fired perfectly well.
	var taken: Array[String] = []
	var again_handler := func(): taken.append("again")
	var menu_handler := func(): taken.append("menu")
	begin_again.connect(again_handler)
	to_menu.connect(menu_handler)
	_again.pressed.emit()
	_menu.pressed.emit()
	begin_again.disconnect(again_handler)
	to_menu.disconnect(menu_handler)
	if taken != ["again", "menu"]:
		problems.append("the way out of a finished run does not report being taken")

	return problems
