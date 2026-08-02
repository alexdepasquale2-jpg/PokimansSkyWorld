extends Node2D
class_name PlayerAvatar

## You. Deliberately plain — a small figure with a pack — because the creatures
## are the characters in this game and the player should read as the one
## unremarkable thing on screen.

func _ready() -> void:
	z_index = 5
	queue_redraw()


func _draw() -> void:
	draw_circle(Vector2(0, 7), 7.0, Color(0, 0, 0, 0.25))          # shadow
	draw_rect(Rect2(-4, -6, 8, 12), Color(0.35, 0.40, 0.52), true) # body
	draw_rect(Rect2(-6, -3, 3, 8), Color(0.55, 0.42, 0.28), true)  # pack
	draw_circle(Vector2(0, -9), 4.5, Color(0.88, 0.76, 0.62))      # head
	draw_arc(Vector2(0, -9), 4.5, 0.0, TAU, 12, Color(0.2, 0.16, 0.14), 1.4, true)
