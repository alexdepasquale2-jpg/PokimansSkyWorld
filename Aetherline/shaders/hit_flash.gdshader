shader_type canvas_item;

// Flashes a creature's own drawn shape toward a colour on hit. Works on plain
// _draw() primitives (no texture needed) — the fragment stage still runs per
// pixel of whatever was rasterized, using the interpolated vertex COLOR.
uniform float flash_amount : hint_range(0.0, 1.0) = 0.0;
uniform vec3 flash_color : source_color = vec3(1.0, 1.0, 1.0);

void fragment() {
	COLOR.rgb = mix(COLOR.rgb, flash_color, flash_amount);
}
