shader_type canvas_item;

// Expanding shockwave for hits / crystallize / catch. Double ring + radial
// spokes so combat reads as impact, not a flat circle.

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec3 ring_color : source_color = vec3(1.0, 0.9, 0.3);
uniform float ring_width : hint_range(0.01, 0.3) = 0.07;

void fragment() {
	vec2 centered = UV - vec2(0.5);
	float dist = length(centered) * 2.0;
	float angle = atan(centered.y, centered.x);
	float radius = progress * 1.05;

	float edge = abs(dist - radius);
	float ring = smoothstep(ring_width, 0.0, edge);
	float inner = smoothstep(ring_width * 1.6, 0.0, abs(dist - radius * 0.55)) * 0.45;
	float fill = smoothstep(radius, radius - 0.35, dist) * step(dist, radius) * 0.12;

	// Debris spokes that fade with progress.
	float spokes = smoothstep(0.7, 1.0, abs(sin(angle * 9.0 + progress * 4.0)))
		* smoothstep(radius + 0.05, radius - 0.2, dist) * (1.0 - progress) * 0.5;

	float fade = 1.0 - progress;
	float alpha = (ring + inner + fill + spokes) * fade;
	vec3 col = ring_color + vec3(0.15, 0.08, 0.0) * ring;
	COLOR = vec4(col, clamp(alpha, 0.0, 1.0));
}
