extends Label
class_name DamagePopup

## Floating combat number with scale pop — rides the same spawn/tween/free
## pattern as ImpactEffect so both read as one combat language.

static func spawn(parent: Node, at: Vector2, amount: float, kind: String = "damage") -> void:
	var label := DamagePopup.new()
	var is_miss := kind == "miss"
	label.text = "%.0f" % amount if not is_miss else "miss"
	if kind == "capture":
		label.text = "CAUGHT"
	elif kind == "crystallize":
		label.text = "CRYSTALLIZE"
	label.add_theme_font_size_override("font_size", 22 if kind == "capture" else (14 if kind == "crystallize" else 20))
	var col: Color = {
		"damage": Color(1.0, 0.38, 0.32),
		"heal": Color(0.4, 1.0, 0.55),
		"miss": Color(0.72, 0.74, 0.78),
		"capture": Color(0.55, 0.88, 1.0),
		"crystallize": Color(1.0, 0.86, 0.4),
	}.get(kind, Color.WHITE)
	label.add_theme_color_override("font_color", col)
	label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	label.add_theme_constant_override("outline_size", 5)
	label.global_position = at + Vector2(-14, -24)
	label.z_index = 100
	label.pivot_offset = Vector2(12, 10)
	label.scale = Vector2.ONE * 0.6
	parent.add_child(label)

	var rise := 42.0 if kind != "miss" else 28.0
	var tween := label.create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "scale", Vector2.ONE * (1.15 if kind == "capture" else 1.0), 0.12) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "global_position:y", label.global_position.y - rise, 0.75) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "modulate:a", 0.0, 0.75).set_delay(0.18)
	tween.chain().tween_callback(label.queue_free)
