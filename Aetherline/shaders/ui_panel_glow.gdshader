shader_type canvas_item;

// Living panel: soft interior fill, animated rim sweep, and optional
// emphasis pulse for "this just changed" feedback.

uniform vec3 rim_color : source_color = vec3(0.35, 0.75, 1.0);
uniform vec3 fill_color : source_color = vec3(0.05, 0.07, 0.12);
uniform float thickness : hint_range(0.0, 0.25) = 0.04;
uniform float emphasis : hint_range(0.0, 1.0) = 0.0;
uniform float fill_alpha : hint_range(0.0, 1.0) = 0.78;

void fragment() {
	vec2 uv = UV;
	vec2 d = min(uv, 1.0 - uv);
	float edge = min(d.x, d.y);

	// Rounded-ish plate via edge falloff.
	float plate = smoothstep(0.0, 0.06, edge);
	float rim = smoothstep(thickness, 0.0, edge) * plate;

	// Perimeter light that crawls the border.
	float sweep_pos = fract(TIME * 0.09);
	float perim = (uv.x * 0.55 + uv.y * 0.45);
	float sweep = smoothstep(0.16, 0.0, abs(fract(perim - sweep_pos + 0.5) - 0.5) - 0.30);

	// Gentle interior gradient + corner bloom.
	float corner = (1.0 - smoothstep(0.0, 0.35, length(d))) * 0.35;
	float pulse = 0.75 + 0.25 * sin(TIME * 2.8) * emphasis;
	float rim_a = rim * (0.40 + sweep * 0.55 + emphasis * 0.35) * pulse;

	vec3 fill = mix(fill_color * 0.7, fill_color * 1.15, uv.y);
	fill += rim_color * corner * 0.15;
	fill = mix(fill, rim_color, rim_a * 0.25);

	float alpha = max(fill_alpha * plate, rim_a);
	// Soft outer bloom beyond the plate edge.
	float bloom = smoothstep(thickness * 1.8, 0.0, edge) * (0.12 + emphasis * 0.2);
	alpha = clamp(alpha + bloom, 0.0, 0.95);
	vec3 col = mix(fill, rim_color, rim_a * 0.65 + bloom * 0.4);

	COLOR = vec4(col, alpha);
}
