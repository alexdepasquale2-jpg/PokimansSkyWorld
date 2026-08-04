extends Node2D
class_name PlayerAvatar

## Layered walker — the human you guide. Slightly more figure than fauna so
## the Odyssey "you are someone" read sticks at a glance.

var _facing: float = 1.0
var _walk_phase: float = 0.0
var _moving: bool = false
var _was_moving: bool = false


func _ready() -> void:
	z_index = 5
	set_process(true)
	queue_redraw()


func _process(delta: float) -> void:
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	_moving = dir.length_squared() > 0.01
	if _moving:
		if absf(dir.x) > 0.1:
			_facing = signf(dir.x)
		_walk_phase += delta * 9.5
		queue_redraw()
	elif _was_moving:
		_walk_phase = 0.0
		queue_redraw()
	_was_moving = _moving


func _draw() -> void:
	var bob := sin(_walk_phase) * (1.5 if _moving else 0.0)
	var leg_swing := sin(_walk_phase) * (3.4 if _moving else 0.0)
	var face := _facing
	# Contact shadow.
	draw_circle(Vector2(0.4, 9.4), 7.2, Color(0, 0, 0, 0.16))
	draw_circle(Vector2(0, 8.8), 5.4, Color(0, 0, 0, 0.28))
	var origin := Vector2(0, bob)
	var leg_col := Color(0.20, 0.22, 0.30)
	var boot := Color(0.16, 0.12, 0.10)
	var hip := origin + Vector2(0, 2)
	var foot_l := hip + Vector2(-2.6 * face - leg_swing * 0.15, 9.2 + leg_swing * 0.15)
	var foot_r := hip + Vector2(2.6 * face + leg_swing * 0.15, 9.2 - leg_swing * 0.15)
	draw_line(hip + Vector2(-2, 0), foot_l, leg_col, 2.5, true)
	draw_line(hip + Vector2(2, 0), foot_r, leg_col, 2.5, true)
	draw_circle(foot_l, 1.7, boot)
	draw_circle(foot_r, 1.7, boot)
	# Torso with depth.
	var body := Rect2(origin.x - 4.6, origin.y - 7.2, 9.2, 12.4)
	draw_rect(Rect2(body.position + Vector2(0.9, 1.1), body.size), Color(0.14, 0.16, 0.24), true)
	draw_rect(body, Color(0.32, 0.40, 0.54), true)
	draw_rect(Rect2(body.position.x + 1, body.position.y + 1, 3.6, 7.2), Color(0.48, 0.56, 0.70, 0.55), true)
	# Survival belt + buckle.
	draw_rect(Rect2(origin.x - 4.6, origin.y + 2.1, 9.2, 1.8), Color(0.28, 0.20, 0.14), true)
	draw_rect(Rect2(origin.x - 1.1, origin.y + 2.1, 2.2, 1.8), Color(0.78, 0.62, 0.28), true)
	# Pack.
	var pack_x := origin.x - 5.8 * face
	draw_rect(Rect2(pack_x, origin.y - 5.2, 4.2, 9.0), Color(0.52, 0.38, 0.24), true)
	draw_rect(Rect2(pack_x + 0.5, origin.y - 4.6, 2.4, 3.2), Color(0.68, 0.52, 0.34, 0.75), true)
	draw_rect(Rect2(pack_x + 0.6, origin.y + 0.2, 3.0, 2.2), Color(0.35, 0.42, 0.48, 0.8), true)
	# Arms.
	var arm_col := Color(0.90, 0.78, 0.64)
	var sleeve := Color(0.28, 0.34, 0.48)
	var shoulder := origin + Vector2(4.3 * face, -4.2)
	var hand := shoulder + Vector2(2.6 * face, 5.2 + sin(_walk_phase + PI) * (2.1 if _moving else 0.0))
	draw_line(shoulder, hand, sleeve, 2.3, true)
	draw_circle(hand, 1.8, arm_col)
	var shoulder2 := origin + Vector2(-3.6 * face, -3.6)
	var hand2 := shoulder2 + Vector2(-1.6 * face, 4.6 - sin(_walk_phase + PI) * (1.6 if _moving else 0.0))
	draw_line(shoulder2, hand2, sleeve, 2.1, true)
	draw_circle(hand2, 1.6, arm_col)
	# Head + hair + eyes.
	var head := origin + Vector2(0, -10.8)
	draw_circle(head + Vector2(0.4, 0.6), 4.7, Color(0.55, 0.42, 0.32, 0.35))
	draw_circle(head, 4.7, Color(0.90, 0.78, 0.64))
	draw_circle(head + Vector2(-1.3, -1.3), 1.7, Color(1, 1, 1, 0.22))
	draw_circle(head + Vector2(0, -2.9), 2.9, Color(0.22, 0.16, 0.12))
	draw_circle(Vector2(head.x - 1.45 * face, head.y - 0.25), 0.9, Color(0.10, 0.10, 0.12))
	draw_circle(Vector2(head.x + 1.15 * face, head.y - 0.25), 0.9, Color(0.10, 0.10, 0.12))
	draw_circle(Vector2(head.x - 1.55 * face, head.y - 0.4), 0.35, Color(1, 1, 1, 0.7))
	draw_arc(head, 4.7, 0.0, TAU, 16, Color(0.16, 0.12, 0.10), 1.3, true)
	# Soft selection halo — you are the center of the bloodline.
	draw_arc(Vector2(0, 8.5), 9.5, 0.0, TAU, 20, Color(0.45, 0.85, 1.0, 0.22), 1.2, true)
