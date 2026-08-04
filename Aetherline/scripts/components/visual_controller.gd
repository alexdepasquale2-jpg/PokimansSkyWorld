extends CreatureComponent
class_name VisualController

## Phenotype-readable creature art.
## Drawn once on refresh(); idle breath is free canvas.scale (no redraw storm).
##
## size/mass/armor/insulation/limbs/aggression/display/camouflage/
## sight/lumen/venom/attack/archetype → silhouette.

const ELLIPSE_SEGS := 14
const ANIM_REDRAW_FRAMES := 24

var canvas: Node2D = null

var _base_color: Color = Color.WHITE
var _belly_color: Color = Color.WHITE
var _accent_color: Color = Color.WHITE
var _eye_color: Color = Color.WHITE
var _scale: float = 1.0
var _width: float = 1.0
var _outline: float = 0.0
var _fringe: float = 0.0
var _limbs: float = 4.0
var _agility: float = 1.0
var _speed: float = 1.0
var _posture: float = 1.0
var _reach: float = 1.0
var _grip: float = 0.0
var _dig: float = 0.0
var _balance: float = 0.0
var _sight: float = 1.0
var _lumen: float = 0.0
var _venom: float = 0.0
var _attack: float = 1.0
var _display: float = 0.0
var _camouflage: float = 0.0
var _has_archetype: bool = false
var _seed: int = 0
var _needs_anim_redraw: bool = false
var _base_canvas_scale: float = 1.0


func _on_setup() -> void:
	canvas = Node2D.new()
	canvas.name = "CreatureCanvas"
	canvas.z_index = 2
	canvas.draw.connect(_draw_creature)
	creature.add_child(canvas)
	set_process(true)


func _process(_delta: float) -> void:
	if canvas == null or not is_instance_valid(canvas):
		return
	var t := Time.get_ticks_msec() * 0.001
	var breath := 1.0 + sin(t * 2.1 + float(_seed % 97) * 0.1) * 0.028
	canvas.scale = Vector2(_base_canvas_scale * breath, _base_canvas_scale * breath)
	if _needs_anim_redraw and Engine.get_process_frames() % ANIM_REDRAW_FRAMES == 0:
		canvas.queue_redraw()


func refresh() -> void:
	if creature == null or canvas == null:
		return
	var t: Dictionary = creature.stats.phenotype()
	_scale = clampf(float(t.get("size", 1.0)), 0.25, 3.5)
	_width = clampf(float(t.get("mass", 1.0)), 0.2, 3.0)
	_outline = clampf(float(t.get("armor", 0.0)), 0.0, 1.5)
	_fringe = clampf(float(t.get("insulation", 0.0)), 0.0, 1.5)
	_limbs = clampf(float(t.get("limbs", 4.0)), 2.0, 8.0)
	_agility = clampf(float(t.get("agility", 1.0)), 0.2, 2.5)
	_speed = clampf(float(t.get("speed", 1.0)), 0.2, 2.5)
	_posture = clampf(float(t.get("stability", 1.0)), 0.2, 2.0)
	_reach = clampf(float(t.get("reach", 1.0)), 0.3, 2.5)
	_grip = clampf(float(t.get("grip", 0.0)), 0.0, 1.5)
	_dig = clampf(float(t.get("dig", 0.0)), 0.0, 1.5)
	_balance = clampf(float(t.get("balance", 0.0)), 0.0, 1.5)
	_sight = clampf(float(t.get("sight", 1.0)), 0.2, 2.5)
	_lumen = clampf(float(t.get("lumen", 0.0)), 0.0, 2.0)
	_venom = clampf(float(t.get("venom", 0.0)), 0.0, 2.0)
	_attack = clampf(float(t.get("attack_power", 1.0)), 0.2, 3.0)
	_display = clampf(float(t.get("display", 0.0)), 0.0, 2.0)
	_camouflage = clampf(float(t.get("camouflage", 0.0)), 0.0, 2.0)
	_has_archetype = creature.archetype != null and creature.archetype.state.has_any_archetype()
	_needs_anim_redraw = _lumen > 0.05 or _balance > 0.15 or _grip > 0.4 or _has_archetype

	var aggression := clampf(float(t.get("aggression", 0.5)), 0.0, 1.0)
	_base_color = Color(0.32, 0.52, 0.72).lerp(Color(0.82, 0.28, 0.22), aggression)
	if _display > 0.15:
		_base_color = _base_color.lerp(Color(0.55, 0.35, 0.78), clampf(_display * 0.35, 0.0, 0.55))
	if _camouflage > 0.15:
		_base_color = _base_color.lerp(Color(0.42, 0.40, 0.32), clampf(_camouflage * 0.4, 0.0, 0.7))
	_belly_color = _base_color.lightened(0.28).lerp(Color(0.92, 0.88, 0.78), 0.35)
	_accent_color = _base_color.darkened(0.22)
	if _venom > 0.2:
		_accent_color = _accent_color.lerp(Color(0.45, 0.95, 0.35), clampf(_venom * 0.4, 0.0, 0.7))
	_eye_color = Color(0.12, 0.14, 0.18).lerp(Color(0.95, 0.85, 0.25), clampf((_sight - 0.5) * 0.35, 0.0, 0.6))
	if _lumen > 0.1:
		_eye_color = _eye_color.lerp(Color(0.55, 0.95, 1.0), clampf(_lumen * 0.45, 0.0, 0.8))
	_seed = int(hash(creature.identity.uid)) if creature.identity != null else 0
	# Humans read slightly more upright / bipedal at a glance.
	if creature.identity != null and creature.identity.is_human:
		_limbs = 2.0
		_posture = maxf(_posture, 1.15)
		_reach = maxf(_reach, 1.1)
	_base_canvas_scale = 1.0
	canvas.queue_redraw()


func _draw_creature() -> void:
	var t := Time.get_ticks_msec() * 0.001
	var pulse := 0.7
	if _needs_anim_redraw:
		pulse = 0.55 + 0.45 * sin(t * 3.0 + float(_seed % 53) * 0.2)
	var body_r := 11.0 * _scale
	var body_w := body_r * _width
	var body_h := body_r * (0.85 + 0.15 * clampf(_posture, 0.4, 1.6))
	var pitch := clampf((_posture - 1.0) * 0.18, -0.22, 0.28)
	var lean := clampf((_agility + _speed) * 0.5 - 1.0, -0.25, 0.35)
	_ellipse(Vector2(0.5, body_h * 0.85 + 4.0), Vector2(body_w * 0.95, body_h * 0.22), Color(0, 0, 0, 0.22))
	if _lumen > 0.05:
		canvas.draw_circle(Vector2.ZERO, body_w * (1.1 + 0.2 * _lumen),
			Color(0.35, 0.85, 1.0, (0.12 + 0.18 * _lumen) * pulse))
	if _fringe > 0.05:
		_draw_fringe(body_w, body_h, pitch)
	_draw_limbs(body_w, body_h, pitch, lean)
	if _balance > 0.15 or _grip > 0.4:
		_draw_tail(body_w, body_h, pitch, t)
	var centre := Vector2(0.0, -pitch * body_h * 2.0)
	var rim := _base_color.darkened(0.35)
	var mid := _base_color
	_ellipse(centre + Vector2(0.8, 1.2), Vector2(body_w, body_h), rim)
	_ellipse(centre, Vector2(body_w * 0.97, body_h * 0.97), mid)
	_ellipse(centre + Vector2(-body_w * 0.08, -body_h * 0.12), Vector2(body_w * 0.72, body_h * 0.7), mid.lightened(0.08))
	_ellipse(centre + Vector2(body_w * 0.05, body_h * 0.18), Vector2(body_w * 0.55, body_h * 0.45), _belly_color)
	_ellipse(centre + Vector2(-body_w * 0.22, -body_h * 0.32), Vector2(body_w * 0.22, body_h * 0.16), Color(1, 1, 1, 0.22 + 0.1 * _display))
	if _display > 0.25:
		_draw_display_marks(centre, body_w, body_h)
	if _outline > 0.08:
		_draw_armor(centre, body_w, body_h)
	var head_c := centre + Vector2(body_w * 0.15 * lean, -body_h * 0.55 - body_h * (0.35 + 0.45 * clampf(_reach, 0.4, 2.0)) * 0.35)
	var head_r := body_r * (0.38 + 0.08 * clampf(_attack, 0.5, 2.0))
	canvas.draw_line(centre + Vector2(0, -body_h * 0.4), head_c, mid.darkened(0.1), maxf(2.0, body_r * 0.28), true)
	canvas.draw_circle(head_c + Vector2(0.6, 0.8), head_r, rim)
	canvas.draw_circle(head_c, head_r * 0.96, mid)
	canvas.draw_circle(head_c + Vector2(-head_r * 0.2, -head_r * 0.25), head_r * 0.45, Color(1, 1, 1, 0.18))
	if _attack > 0.8:
		var snout := head_c + Vector2(head_r * 0.55, head_r * 0.15)
		_ellipse(snout, Vector2(head_r * (0.35 + 0.15 * _attack), head_r * 0.28), mid.darkened(0.05))
		if _venom > 0.3:
			canvas.draw_circle(snout + Vector2(head_r * 0.15, head_r * 0.12), 1.4, Color(0.4, 0.95, 0.3, 0.85))
	if _attack > 1.2 and _display > 0.3:
		var horn_h := head_r * (0.6 + 0.4 * _attack)
		canvas.draw_colored_polygon(PackedVector2Array([
			head_c + Vector2(-head_r * 0.35, -head_r * 0.4),
			head_c + Vector2(-head_r * 0.15, -head_r * 0.4 - horn_h),
			head_c + Vector2(-head_r * 0.05, -head_r * 0.35),
		]), _accent_color)
		canvas.draw_colored_polygon(PackedVector2Array([
			head_c + Vector2(head_r * 0.15, -head_r * 0.4),
			head_c + Vector2(head_r * 0.35, -head_r * 0.4 - horn_h * 0.9),
			head_c + Vector2(head_r * 0.45, -head_r * 0.35),
		]), _accent_color)
	var eye_r := clampf(1.4 * _scale * (0.7 + 0.5 * _sight), 1.2, 5.5)
	var eye_off := Vector2(head_r * 0.28, -head_r * 0.1)
	_draw_eye(head_c - eye_off + Vector2(-1, 0), eye_r)
	_draw_eye(head_c + eye_off * Vector2(0.35, -0.2), eye_r * 0.92)
	if _has_archetype:
		_draw_crystallization(centre, body_w, body_h, pulse)


func _ellipse(center: Vector2, radii: Vector2, color: Color) -> void:
	var pts := PackedVector2Array()
	pts.resize(ELLIPSE_SEGS)
	for i in ELLIPSE_SEGS:
		var a := TAU * float(i) / float(ELLIPSE_SEGS)
		pts[i] = center + Vector2(cos(a) * radii.x, sin(a) * radii.y)
	canvas.draw_colored_polygon(pts, color)


func _draw_eye(pos: Vector2, r: float) -> void:
	canvas.draw_circle(pos, r * 1.15, Color(0.05, 0.05, 0.07, 0.85))
	canvas.draw_circle(pos, r, Color(0.95, 0.96, 0.98))
	canvas.draw_circle(pos + Vector2(r * 0.1, 0), r * 0.62, _eye_color)
	canvas.draw_circle(pos + Vector2(r * 0.15, -r * 0.05), r * 0.28, Color(0.05, 0.05, 0.08))
	canvas.draw_circle(pos + Vector2(-r * 0.25, -r * 0.3), r * 0.18, Color(1, 1, 1, 0.75))


func _draw_fringe(body_w: float, body_h: float, pitch: float) -> void:
	var centre := Vector2(0.0, -pitch * body_h * 2.0)
	var tufts := int(6 + _fringe * 8.0)
	var outer := Color(_base_color.r, _base_color.g, _base_color.b, 0.12 + 0.22 * _fringe)
	var inner := Color(0.92, 0.90, 0.84, 0.1 + 0.2 * _fringe)
	_ellipse(centre, Vector2(body_w * (1.0 + 0.28 * _fringe), body_h * (1.0 + 0.22 * _fringe)), outer)
	for i in tufts:
		var a := TAU * float(i) / float(tufts) + float(_seed % 11) * 0.07
		var jitter := 0.85 + 0.3 * _hash01(_seed + i * 17)
		var tip := centre + Vector2(cos(a) * body_w, sin(a) * body_h) * (1.05 + 0.45 * _fringe * jitter)
		var base := centre + Vector2(cos(a) * body_w, sin(a) * body_h) * 0.82
		canvas.draw_line(base, tip, inner, 1.0 + _fringe * 1.2, true)


func _draw_limbs(body_w: float, body_h: float, pitch: float, lean: float) -> void:
	var n := clampi(int(roundf(_limbs)), 2, 8)
	var leg_len := body_h * (0.55 + 0.35 * clampf(_speed, 0.4, 2.0)) * (1.0 - lean * 0.15)
	var leg_w := maxf(1.6, 2.2 * _scale * (0.7 + 0.3 * _width) / (1.0 + float(n) * 0.08))
	var stance := body_w * (0.55 + 0.12 * clampf(_posture, 0.5, 1.8))
	var hip_y := body_h * 0.35 - pitch * body_h
	var col := _base_color.darkened(0.18)
	var col_hi := col.lightened(0.12)
	for i in n:
		var side := -1.0 if (i % 2 == 0) else 1.0
		var row := float(i / 2) / maxf(1.0, float((n - 1) / 2))
		var hip := Vector2(side * stance * (0.55 + 0.45 * (1.0 - row * 0.5)), hip_y - row * body_h * 0.15)
		var foot := Vector2(hip.x + side * (2.0 + lean * 3.0), hip.y + leg_len)
		var knee := hip.lerp(foot, 0.48) + Vector2(side * leg_w * 0.8, 0)
		canvas.draw_line(hip, knee, col, leg_w * 1.15, true)
		canvas.draw_line(knee, foot, col_hi, leg_w * 0.95, true)
		_draw_extremity(foot, side, leg_w)


func _draw_extremity(foot: Vector2, side: float, leg_w: float) -> void:
	var pad := _base_color.darkened(0.3)
	pad.a = 0.95
	if _dig > _grip and _dig > 0.25:
		for k in 3:
			canvas.draw_line(foot, foot + Vector2(side * (2.0 + float(k) * 1.4), 2.5), Color(0.75, 0.72, 0.68), 1.2, true)
	elif _grip > 0.35:
		canvas.draw_circle(foot, leg_w * 0.85, pad)
	else:
		_ellipse(foot + Vector2(0, 1.0), Vector2(leg_w * 1.1, leg_w * 0.55), pad)


func _draw_tail(body_w: float, body_h: float, pitch: float, t: float) -> void:
	var base := Vector2(-body_w * 0.75, body_h * 0.1 - pitch * body_h)
	var segs := 5 if _balance > 0.5 else 3
	var len_scale := 0.9 + _balance * 0.8 + _grip * 0.3
	var sway := sin(t * 1.7 + float(_seed % 19)) * 0.35
	var prev := base
	var col := _base_color.darkened(0.1)
	for i in segs:
		var u := float(i + 1) / float(segs)
		var next := base + Vector2(-body_w * 0.55 * u * len_scale,
			sin(u * PI + sway) * body_h * 0.35 * len_scale + u * body_h * 0.15)
		canvas.draw_line(prev, next, col, maxf(1.2, (3.5 - u * 2.5) * _scale), true)
		prev = next
	if _grip > 0.5:
		canvas.draw_circle(prev, 2.2 * _scale, _accent_color)


func _draw_display_marks(centre: Vector2, body_w: float, body_h: float) -> void:
	var stripes := clampi(int(2 + _display * 2.5), 2, 5)
	var col := Color(_accent_color.r, _accent_color.g, _accent_color.b, 0.25 + 0.2 * _display)
	for i in stripes:
		var y := centre.y - body_h * 0.55 + body_h * 1.1 * (float(i) + 0.5) / float(stripes)
		canvas.draw_line(Vector2(centre.x - body_w * 0.7, y),
			Vector2(centre.x + body_w * 0.7, y + sin(float(i)) * body_h * 0.05),
			col, 1.0 + _display * 0.8, true)


func _draw_armor(centre: Vector2, body_w: float, body_h: float) -> void:
	var plates := clampi(int(2 + _outline * 3.0), 2, 6)
	var plate_col := Color(0.18, 0.17, 0.2, 0.55 + 0.25 * _outline)
	for i in plates:
		var a0 := -0.9 + float(i) * (1.8 / float(plates))
		var a1 := a0 + 1.6 / float(plates)
		var r := body_w * (0.92 + 0.06 * _outline)
		var pts := PackedVector2Array()
		pts.append(centre)
		for s in 5:
			var a := lerpf(a0, a1, float(s) / 4.0) - PI * 0.5
			pts.append(centre + Vector2(cos(a) * r, sin(a) * body_h * 0.95))
		canvas.draw_colored_polygon(pts, plate_col)
	canvas.draw_arc(centre, body_w + 1.0 + _outline * 2.0, 0.0, TAU, 28,
		Color(0.12, 0.12, 0.14, 0.85), 1.0 + 2.8 * _outline, true)


func _draw_crystallization(centre: Vector2, body_w: float, body_h: float, pulse: float) -> void:
	var gold := Color(1.0, 0.86, 0.38, 0.55 + 0.35 * pulse)
	var r := maxf(body_w, body_h) + 7.0
	canvas.draw_circle(centre, r + 3.0, Color(1.0, 0.85, 0.4, 0.08 * pulse))
	for i in 6:
		var a0 := TAU * float(i) / 6.0 + pulse * 0.15
		var a1 := TAU * float(i + 1) / 6.0 + pulse * 0.15
		var p0 := centre + Vector2(cos(a0), sin(a0)) * r
		var p1 := centre + Vector2(cos(a1), sin(a1)) * r
		var mid := centre + Vector2(cos((a0 + a1) * 0.5), sin((a0 + a1) * 0.5)) * (r * 1.18)
		canvas.draw_line(p0, mid, gold, 1.6, true)
		canvas.draw_line(mid, p1, gold, 1.6, true)
	canvas.draw_arc(centre, r, 0.0, TAU, 28, gold, 2.0, true)


func _hash01(n: int) -> float:
	var x := n * 1103515245 + 12345
	x = (x >> 16) ^ x
	return float(x & 0x7fffffff) / 2147483647.0


func describe() -> Array[String]:
	return ["  scale %.2f · width %.2f · outline %.2f · coat %.2f · limbs %.0f · hue %s%s" % [
		_scale, _width, _outline, _fringe, _limbs, _base_color.to_html(false),
		" · crystallized" if _has_archetype else ""]]


func post_load() -> void:
	refresh()
