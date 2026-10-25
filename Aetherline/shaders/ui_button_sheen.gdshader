shader_type canvas_item;

// Button plate: vertical depth gradient, edge rim, and a diagonal sheen
// that sweeps in when `hover` is tweened 0→1 by FxButton.

uniform vec3 base_color : source_color = vec3(0.10, 0.14, 0.22);
uniform vec3 accent_color : source_color = vec3(0.35, 0.78, 1.0);
uniform float hover : hint_range(0.0, 1.0) = 0.0;
uniform float press : hint_range(0.0, 1.0) = 0.0;
uniform float corner : hint_range(0.0, 0.5) = 0.08;

void fragment() {
	vec2 uv = UV;
	vec2 d = min(uv, 1.0 - uv);
	float edge = min(d.x, d.y);

	// Soft rounded plate (approximate corner falloff).
	float plate = smoothstep(0.0, corner, edge);

	vec3 col = mix(base_color * 0.75, base_color * 1.45, uv.y);
	col = mix(col, base_color * 0.55, 1.0 - plate);

	// Top inner highlight + bottom shadow for 3D plate feel.
	float top_hi = smoothstep(0.35, 0.0, uv.y) * 0.22 * plate;
	float bot_sh = smoothstep(0.55, 1.0, uv.y) * 0.18 * plate;
	col += vec3(top_hi);
	col -= vec3(bot_sh);

	// Accent rim that warms on hover.
	float rim = smoothstep(0.028, 0.0, edge) * plate;
	col = mix(col, accent_color, rim * (0.35 + hover * 0.45));

	// Diagonal sheen sweep driven by hover amount.
	float diag = uv.x + (1.0 - uv.y);
	float sheen_pos = mix(-0.5, 2.5, hover);
	float sheen = smoothstep(0.28, 0.0, abs(diag - sheen_pos)) * plate;
	col += accent_color * sheen * (0.35 + hover * 0.35);

	// Hover fill + press dim.
	col = mix(col, mix(col, accent_color, 0.22), hover * 0.85);
	col *= 1.0 - press * 0.18;

	// Thin outer border line.
	float border = smoothstep(0.012, 0.0, edge) * (0.4 + hover * 0.4);
	col = mix(col, accent_color * 0.9, border * 0.5);

	float alpha = mix(0.92, 1.0, hover) * plate;
	COLOR = vec4(col, clamp(alpha, 0.0, 1.0));
}
