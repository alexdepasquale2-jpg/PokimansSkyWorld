extends Label
class_name DamagePopup

## Floating combat number. Not a shader — a shader can't set arbitrary glyph
## layout cheaply — but it rides the same "spawn, tween, free" pattern as
## ImpactEffect so both read the same way at the call site.

static func spawn(parent: Node, at: Vector2, amount: float, kind: String = "damage") -> void:
	var label := DamagePopup.new()
	label.text = "%.0f" % amount if kind != "miss" else "miss"
	label.add_theme_font_size_override("font_size", 20 if kind != "crystallize" else 14)
	label.add_theme_color_override("font_color", {
		"damage": Color(1.0, 0.35, 0.3),
		"heal": Color(0.4, 1.0, 0.5),
		"miss": Color(0.7, 0.7, 0.7),
		"capture": Color(0.6, 0.8, 1.0),
	}.get(kind, Color.WHITE))
	label.global_position = at + Vector2(-10, -20)
	label.z_index = 100
	parent.add_child(label)

	var tween := label.create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "global_position:y", label.global_position.y - 36.0, 0.7)
	tween.tween_property(label, "modulate:a", 0.0, 0.7).set_delay(0.15)
	tween.chain().tween_callback(label.queue_free)
