shader_type canvas_item;

// Animated rim-light for a panel's own rect (a full-size ColorRect/NinePatch
// sibling behind the panel content). A slow light sweeps the border; the
// whole rim can pulse hotter via `emphasis` for "this matters right now".

uniform vec3 rim_color : source_color = vec3(0.35, 0.75, 1.0);
uniform float thickness : hint_range(0.0, 0.2) = 0.035;
uniform float emphasis : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec2 d = min(UV, 1.0 - UV);
	float edge = min(d.x, d.y);
	float rim = smoothstep(thickness, 0.0, edge);

	float sweep_pos = fract(TIME * 0.12);
	float perim = (UV.x + UV.y) * 0.5;
	float sweep = smoothstep(0.18, 0.0, abs(fract(perim - sweep_pos) - 0.5) - 0.32);

	float pulse = 0.7 + 0.3 * sin(TIME * 3.0) * emphasis;
	float alpha = rim * (0.35 + sweep * 0.5) * pulse;
	COLOR = vec4(rim_color, clamp(alpha, 0.0, 0.9));
}
