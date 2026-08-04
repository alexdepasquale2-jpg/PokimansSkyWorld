extends Control
class_name HudRoot

## Everything the player needs while they are actually playing.
##
## WHAT THIS REPLACES, and why it needed replacing. The HUD was one `Label` fed a
## single format string that had grown to six lines:
##
##   Kesh II · tundra · (1840, -620)
##   leading: Sesk   39/62 hp
##   party 2/4 · caught 3 · dex 5 spp · salvage 120 · hold 12/40 · jumps 2
##   clan Survivors · gen 3 · 412 lessons · lean foraging
##   bloodline: 2/3 crossings · 4 alive  <<< YOUR PEOPLE ARE DYING
##   understanding: 96 banked · 2 within reach (N) · 3 not yet safe
##
## Every one of those at 14px, one colour, separated by interpuncts, with a
## permanent thirteen-item keyboard wall underneath. Nothing has a shape. The
## planet's name is as loud as your people dying. To find out whether an animal
## is starving you have to read a percentage out of the middle of a sentence —
## and neglect kills in eight in-game days, so that is the one number a player
## most needs to catch WITHOUT reading.
##
## THE REDESIGN IS ABOUT RANK, not decoration. Three zones, each answering one
## question a player actually asks:
##
##   who am I looking after   — the led creature, its vitals as bars
##   what is this run for     — crossings as pips, the clan's strength
##   what can I do right now  — banked understanding, and the keys that matter
##
## Alarms are their own element with their own colour and their own motion,
## rather than an ALL-CAPS suffix on line five that looks like the rest of line
## five. Coordinates are gone: they were debug output shipped to a player.
##
## OWNED HERE RATHER THAN IN `overworld.gd`, which was building and formatting all
## of this inline across ~120 lines in the middle of the planet-streaming layer.
## The overworld hands over state; this decides how it reads.

const WIDTH := 300
const ALARM_HOLD := 6.0

signal hint_requested   ## Player asked for the full key list.

var _leader_name: Label
var _leader_note: Label
var _vitals: Dictionary = {}      ## key -> VitalBar
var _pips: PipRow
var _bloodline_note: Label
var _clan_note: Label
var _mind_note: Label
var _alarm: Label
var _alarm_panel: FxPanel
var _keys: Label
var _place: Label

var _alarm_timer: float = 0.0
var _alarm_sticky: bool = false
var _alarm_text: String = ""


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()


func _build() -> void:
	var column := VBoxContainer.new()
	column.position = Vector2(12, 12)
	column.custom_minimum_size = Vector2(WIDTH, 0)
	column.add_theme_constant_override("separation", 8)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(column)

	column.add_child(_build_who())
	column.add_child(_build_run())
	column.add_child(_build_alarm())

	# The key list goes at the BOTTOM of the screen and stays short. Thirteen
	# bindings pinned under the HUD taught the player nothing after the first
	# minute and covered the world for the rest of the campaign.
	_keys = Label.new()
	_keys.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_keys.position = Vector2(14, -30)
	_keys.add_theme_font_size_override("font_size", 11)
	_keys.add_theme_color_override("font_color", Color(0.50, 0.56, 0.66))
	_keys.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	_keys.add_theme_constant_override("outline_size", 3)
	_keys.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_keys)

	# Where you are, said once, quietly, top right — it is orientation, not a
	# thing you act on, so it should never compete with the things you do.
	_place = Label.new()
	_place.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_place.position = Vector2(-260, 14)
	_place.custom_minimum_size = Vector2(246, 0)
	_place.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_place.add_theme_font_size_override("font_size", 13)
	_place.add_theme_color_override("font_color", Color(0.66, 0.74, 0.85))
	_place.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	_place.add_theme_constant_override("outline_size", 3)
	_place.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_place)


func _build_who() -> Control:
	var panel := FxPanel.new(Color(0.40, 0.78, 1.0), 0.70)
	panel.custom_minimum_size = Vector2(WIDTH, 0)
	var box := _padded(panel)

	_leader_name = Label.new()
	_leader_name.add_theme_font_size_override("font_size", 17)
	_leader_name.add_theme_color_override("font_color", Color(0.94, 0.96, 1.0))
	box.add_child(_leader_name)

	_leader_note = Label.new()
	_leader_note.add_theme_font_size_override("font_size", 11)
	_leader_note.add_theme_color_override("font_color", Color(0.60, 0.68, 0.80))
	box.add_child(_leader_note)

	# Ordered by how fast each one kills you, top to bottom. Health first
	# because it is the one that ends the run; social last because it is the one
	# that only ever colours the story.
	for pair in [["health", "health"], ["hunger", "fed"], ["energy", "rested"],
			["mood", "spirit"]]:
		var bar := VitalBar.new(String(pair[1]))
		_vitals[String(pair[0])] = bar
		box.add_child(bar)

	return panel


func _build_run() -> Control:
	var panel := FxPanel.new(Color(0.95, 0.80, 0.45), 0.70)
	panel.custom_minimum_size = Vector2(WIDTH, 0)
	var box := _padded(panel)

	var heading := HBoxContainer.new()
	heading.add_theme_constant_override("separation", 10)
	box.add_child(heading)

	var title := Label.new()
	title.text = "the bloodline"
	title.add_theme_font_size_override("font_size", 12)
	title.add_theme_color_override("font_color", Color(0.80, 0.74, 0.58))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(title)

	_pips = PipRow.new(CampaignArc.EVOLUTION_LEAPS_TO_WIN)
	heading.add_child(_pips)

	_bloodline_note = Label.new()
	_bloodline_note.add_theme_font_size_override("font_size", 12)
	_bloodline_note.add_theme_color_override("font_color", Color(0.86, 0.90, 0.96))
	box.add_child(_bloodline_note)

	_clan_note = Label.new()
	_clan_note.add_theme_font_size_override("font_size", 11)
	_clan_note.add_theme_color_override("font_color", Color(0.60, 0.68, 0.80))
	# Wrapped, because a clan's disposition is a sentence of unbounded length and
	# rendering the HUD showed it running off the panel edge mid-word.
	_clan_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_clan_note.custom_minimum_size = Vector2(WIDTH - 28, 0)
	box.add_child(_clan_note)

	_mind_note = Label.new()
	_mind_note.add_theme_font_size_override("font_size", 12)
	_mind_note.add_theme_color_override("font_color", Color(0.72, 0.88, 0.78))
	box.add_child(_mind_note)

	return panel


func _build_alarm() -> Control:
	_alarm_panel = FxPanel.new(Color(1.0, 0.40, 0.38), 0.85)
	_alarm_panel.custom_minimum_size = Vector2(WIDTH, 0)
	_alarm_panel.visible = false
	var box := _padded(_alarm_panel)

	_alarm = Label.new()
	_alarm.add_theme_font_size_override("font_size", 13)
	_alarm.add_theme_color_override("font_color", Color(1.0, 0.86, 0.84))
	_alarm.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_alarm.custom_minimum_size = Vector2(WIDTH - 28, 0)
	box.add_child(_alarm)

	return _alarm_panel


func _padded(panel: Control) -> VBoxContainer:
	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 12)
	panel.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	margin.add_child(box)
	return box


# --- What the overworld hands over ---------------------------------------------

## The creature the player is leading, or null.
func show_leader(creature: Node) -> void:
	if creature == null or not is_instance_valid(creature):
		_leader_name.text = "nobody left to lead"
		_leader_note.text = ""
		for key in _vitals:
			(_vitals[key] as VitalBar).set_value(0.0)
		return
	_leader_name.text = creature.display_name()
	_leader_note.text = LoreVoice.creature_condition(creature)
	var needs: NeedsComponent = creature.needs
	if needs == null:
		return
	# Health shown as the fraction of the body that is left, not the need, so
	# the bar agrees with what combat does to it.
	(_vitals["health"] as VitalBar).set_value(creature.stats.hp_fraction())
	(_vitals["hunger"] as VitalBar).set_value(needs.hunger)
	(_vitals["energy"] as VitalBar).set_value(needs.energy)
	(_vitals["mood"] as VitalBar).set_value(needs.mood)


func show_place(planet_name: String, biome: String) -> void:
	_place.text = planet_name if biome.is_empty() else "%s — %s" % [planet_name, biome]


func show_run(leaps: int, living: int, clan_line: String) -> void:
	_pips.set_progress(leaps, CampaignArc.EVOLUTION_LEAPS_TO_WIN)
	var left := CampaignArc.EVOLUTION_LEAPS_TO_WIN - leaps
	if left <= 0:
		_bloodline_note.text = "They are somewhere they could not have reached."
	elif left == 1:
		_bloodline_note.text = "One more crossing. %s of them alive." % _count_word(living)
	else:
		_bloodline_note.text = "%d more crossings. %s of them alive." % [
			left, _count_word(living)]
	_clan_note.text = clan_line


## Banked understanding, what is affordable, what is still provisional.
func show_understanding(banked: float, within_reach: int, at_risk: int,
		supportable: int) -> void:
	if banked < 1.0 and at_risk == 0:
		_mind_note.text = ""
		return
	var parts: Array[String] = []
	if within_reach > 0:
		parts.append("%d within reach — press N" % within_reach)
	elif banked >= 1.0:
		parts.append("%d understanding banked" % int(banked))
	if at_risk > 0:
		parts.append("%d not yet safe" % at_risk)
	_mind_note.text = " · ".join(parts)
	if at_risk > supportable:
		raise_alarm("More is being worked out than there are of them to carry. "
			+ "Some of it goes when the generation turns.")


## Something the player has to act on. Its own panel, its own colour, its own
## motion — not an ALL-CAPS suffix on a line of statistics.
##
## TWO KINDS, and the distinction is not cosmetic. A transient alarm reports
## something that HAPPENED and fades, because an alarm that never leaves stops
## being an alarm. A sticky one reports something that IS TRUE and stays until it
## stops being true — your people dying out is not an event, it is a state, and
## an auto-fading version of it re-raises itself the moment it clears, flashing
## the panel every six seconds forever.
##
## Sticky outranks transient: a passing note must not paper over the condition
## that is ending the run.
func raise_alarm(text: String, sticky: bool = false) -> void:
	if _alarm_sticky and not sticky:
		return
	if text == _alarm_text and _alarm_panel.visible:
		return
	_alarm_text = text
	_alarm_sticky = sticky
	_alarm.text = text
	_alarm_panel.visible = true
	_alarm_timer = 0.0 if sticky else ALARM_HOLD
	_alarm_panel.flash(0.9)


func clear_alarm() -> void:
	_alarm_panel.visible = false
	_alarm_text = ""
	_alarm_sticky = false
	_alarm_timer = 0.0


## Drop a standing condition when it stops being true, leaving any transient
## alarm that arrived meanwhile alone.
func clear_sticky_alarm() -> void:
	if _alarm_sticky:
		clear_alarm()


func alarm_text() -> String:
	return _alarm_text if _alarm_panel.visible else ""


## Only the keys that do something here, in the order a player reaches for them.
func show_keys(context: Array[String]) -> void:
	_keys.text = "  ·  ".join(context) if not context.is_empty() else ""


func _process(delta: float) -> void:
	if _alarm_timer <= 0.0:
		return
	_alarm_timer -= delta
	if _alarm_timer <= 0.0:
		clear_alarm()


static func _count_word(n: int) -> String:
	match n:
		0: return "None"
		1: return "One"
		2: return "Two"
		3: return "Three"
		_: return str(n)


# --- Smoke test ------------------------------------------------------------------

## The screen a player looks at for the entire game. A silent break here costs
## more than a silent break anywhere else in the project.
func run_smoke_test() -> Array[String]:
	var problems: Array[String] = []

	show_place("Kesh II", "tundra")
	if not _place.text.contains("Kesh II"):
		problems.append("the place is not named")
	if _place.text.contains("(") or _place.text.contains(","):
		problems.append("raw coordinates leaked back into the HUD")

	show_run(1, 2, "Survivors, third generation")
	if _pips.done() != 1 or _pips.total() != CampaignArc.EVOLUTION_LEAPS_TO_WIN:
		problems.append("the crossings do not match the arc")
	# A clan you can count on one hand is named in words — "Two of them alive"
	# lands where "2 alive" is a statistic about someone else.
	if not _bloodline_note.text.contains("Two of them"):
		problems.append("a small clan is not counted in words: " + _bloodline_note.text)
	show_run(1, 19, "")
	if not _bloodline_note.text.contains("19"):
		problems.append("a large clan is not counted at all: " + _bloodline_note.text)

	# A finished run must not still be asking for more crossings.
	show_run(CampaignArc.EVOLUTION_LEAPS_TO_WIN, 4, "")
	if _bloodline_note.text.contains("more crossing"):
		problems.append("a finished run still asks for crossings")

	# Vitals: colour has to mean one thing, and only the emergency moves.
	var health := _vitals["health"] as VitalBar
	health.set_value(0.9)
	if health.colour_now() != VitalBar.GOOD or health.is_critical():
		problems.append("a healthy creature does not read as healthy")
	health.set_value(0.3)
	if health.colour_now() != VitalBar.WARN:
		problems.append("a wearing-down creature does not read as a warning")
	health.set_value(0.05)
	if health.colour_now() != VitalBar.CRITICAL or not health.is_critical():
		problems.append("a dying creature does not read as critical")
	if health.value() > 0.1 and not health.is_critical():
		problems.append("the critical threshold disagrees with the value")

	# The four bars must be the four needs, and captioned in words.
	for key in ["health", "hunger", "energy", "mood"]:
		if not _vitals.has(key):
			problems.append("no bar for '%s'" % key)
			continue
		var bar := _vitals[key] as VitalBar
		if bar.caption().is_empty() or bar.caption().contains("_"):
			problems.append("the '%s' bar is captioned with an id" % key)

	# Understanding: silence when there is nothing to say, and an alarm exactly
	# when the clan is carrying more than it can hold.
	clear_alarm()
	show_understanding(0.0, 0, 0, 3)
	if not _mind_note.text.is_empty():
		problems.append("the HUD talks about understanding when there is none")
	show_understanding(96.0, 2, 1, 3)
	if not _mind_note.text.contains("N"):
		problems.append("the player is not told which key spends it")
	if not alarm_text().is_empty():
		problems.append("a clan within its means raised an alarm")
	show_understanding(96.0, 2, 5, 2)
	if alarm_text().is_empty():
		problems.append("a clan over its means raised no alarm")

	# A transient alarm must fade; a standing condition must not, or it re-raises
	# itself the instant it clears and flashes forever.
	clear_alarm()
	raise_alarm("something happened")
	if _alarm_timer <= 0.0:
		problems.append("a transient alarm does not fade")
	raise_alarm("your people are dying out", true)
	if _alarm_timer > 0.0:
		problems.append("a standing condition fades like a passing note")
	raise_alarm("something else happened")
	if not alarm_text().contains("dying"):
		problems.append("a passing note papered over the condition ending the run")
	clear_sticky_alarm()
	if not alarm_text().is_empty():
		problems.append("a standing condition cannot be dropped when it ends")

	show_leader(null)
	if _leader_name.text.is_empty():
		problems.append("an empty party leaves the HUD blank rather than saying so")

	show_keys(["WASD move", "E interact"])
	if not _keys.text.contains("WASD"):
		problems.append("the key hints are empty")
	show_keys([])
	if not _keys.text.is_empty():
		problems.append("the key hints cannot be cleared")

	return problems
