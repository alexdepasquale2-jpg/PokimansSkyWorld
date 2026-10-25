extends Control
class_name VitalBar

## A need, as a thing you can see without reading.
##
## THE PROBLEM THIS SOLVES. Neglect kills in this game — eight in-game days from
## full health to death, measured — and until now the only way to know a creature
## was starving was to read `hunger 41%` out of the middle of a six-line block of
## dot-separated text at 14px, in the same colour as the planet's name and the
## salvage count. A number you have to find and parse is not a warning. By the
## time a player notices it in that form, the answer is already "too late".
##
## So: a bar, and a colour that means one thing. Green is fine, amber is "deal
## with this soon", red is "deal with this now", and the bar PULSES only in the
## red band. Peripheral vision picks up motion and colour long before it picks up
## digits, which is the entire point — the player should feel a problem arriving
## while still looking at something else.
##
## The number is still there, small, at the right. Progressive disclosure applies
## to the HUD exactly as it applies to the Your People screen: the glanceable
## thing is the shape, the precise thing is one look away, and neither is hidden
## behind a debug build.

const HEIGHT := 14
const LABEL_WIDTH := 52
const READOUT_WIDTH := 38

## Where the colour changes. Matches NeedsComponent.CRITICAL_THRESHOLD at the
## bottom end so the bar turns red at exactly the point the simulation starts
## calling the need critical — a HUD that disagrees with the model about what
## counts as an emergency teaches the player to distrust it.
const WARN_AT := 0.40
const CRITICAL_AT := 0.15

const GOOD := Color(0.45, 0.85, 0.55)
const WARN := Color(0.95, 0.75, 0.30)
const CRITICAL := Color(0.95, 0.35, 0.35)
const TRACK := Color(0.12, 0.14, 0.18, 0.9)

var _label: Label
var _readout: Label
var _fill: ColorRect
var _track: ColorRect

var _value: float = 1.0
var _shown: float = 1.0
var _pulse: float = 0.0


func _init(caption: String = "") -> void:
	custom_minimum_size = Vector2(0, HEIGHT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build(caption)


func _build(caption: String) -> void:
	var row := HBoxContainer.new()
	row.set_anchors_preset(Control.PRESET_FULL_RECT)
	row.add_theme_constant_override("separation", 6)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(row)

	_label = Label.new()
	_label.text = caption
	_label.custom_minimum_size = Vector2(LABEL_WIDTH, 0)
	_label.add_theme_font_size_override("font_size", 11)
	_label.add_theme_color_override("font_color", Color(0.62, 0.68, 0.78))
	row.add_child(_label)

	var gauge := Control.new()
	gauge.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gauge.custom_minimum_size = Vector2(0, HEIGHT - 4)
	gauge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(gauge)

	_track = ColorRect.new()
	_track.color = TRACK
	_track.set_anchors_preset(Control.PRESET_FULL_RECT)
	_track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	gauge.add_child(_track)

	# Anchored left and sized by ratio, so the bar tracks the panel's width
	# instead of assuming one. The HUD is the only thing on screen that must
	# survive every window size without being looked at.
	_fill = ColorRect.new()
	_fill.color = GOOD
	_fill.anchor_left = 0.0
	_fill.anchor_top = 0.0
	_fill.anchor_right = 1.0
	_fill.anchor_bottom = 1.0
	_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	gauge.add_child(_fill)

	_readout = Label.new()
	_readout.custom_minimum_size = Vector2(READOUT_WIDTH, 0)
	_readout.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_readout.add_theme_font_size_override("font_size", 11)
	_readout.add_theme_color_override("font_color", Color(0.72, 0.78, 0.88))
	row.add_child(_readout)


## `value` is 0..1. Set every refresh; the bar eases toward it itself.
func set_value(value: float) -> void:
	_value = clampf(value, 0.0, 1.0)
	_readout.text = "%d%%" % int(round(_value * 100.0))


func caption() -> String:
	return _label.text


func value() -> float:
	return _value


func is_critical() -> bool:
	return _value <= CRITICAL_AT


func colour_now() -> Color:
	if _value <= CRITICAL_AT:
		return CRITICAL
	if _value <= WARN_AT:
		return WARN
	return GOOD


func _process(delta: float) -> void:
	# Eased rather than snapped. A bar that jumps reads as a glitch; a bar that
	# slides reads as something happening to an animal, and the direction of
	# travel is information the number alone does not carry.
	_shown = lerpf(_shown, _value, clampf(delta * 6.0, 0.0, 1.0))
	_fill.anchor_right = _shown

	var target := colour_now()
	if _value <= CRITICAL_AT:
		# Only the critical band moves. A HUD where everything breathes all the
		# time has no way left to say "this one, now".
		_pulse += delta * 5.0
		var beat := 0.72 + 0.28 * sin(_pulse)
		target = Color(target.r, target.g, target.b, beat)
	else:
		_pulse = 0.0
	_fill.color = _fill.color.lerp(target, clampf(delta * 8.0, 0.0, 1.0))
