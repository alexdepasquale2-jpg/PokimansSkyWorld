shader_type canvas_item;

// Scanner sweep: bright leading ring, trailing wash, instrument grid, and a
// soft discovery bloom at the origin so the most-repeated verb always feels
// like sampling a living world.

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec3 sweep_color : source_color = vec3(0.45, 0.85, 1.0);

void fragment() {
	vec2 centered = UV - vec2(0.5);
	float dist = length(centered) * 2.0;
	float angle = atan(centered.y, centered.x);

	// Leading edge with slight thickness variation.
	float ring_w = 0.045 + 0.02 * sin(angle * 8.0 + progress * 12.0);
	float ring = smoothstep(ring_w, 0.0, abs(dist - progress));

	// Trailing wash + secondary echo ring.
	float behind = smoothstep(progress, progress - 0.5, dist) * step(dist, progress);
	float echo = smoothstep(0.04, 0.0, abs(dist - progress * 0.62)) * (1.0 - progress) * 0.35;

	// Polar instrument grid inside swept area.
	float spokes = smoothstep(0.88, 1.0, abs(sin(angle * 14.0)));
	float rings = smoothstep(0.88, 1.0, abs(sin(dist * 28.0 - progress * 6.0)));
	float grid = (spokes * 0.7 + rings * 0.5) * behind * 0.32;

	// Center bloom that contracts as the sweep finishes.
	float core = exp(-dist * 4.5) * (1.0 - progress) * 0.55;

	float alpha = (ring * 0.95 + behind * 0.18 + grid + echo + core) * (1.0 - progress * 0.5);
	// Slight chromatic edge on the ring for sci-fi read.
	vec3 col = sweep_color + vec3(0.08, 0.12, 0.18) * ring;
	COLOR = vec4(col, clamp(alpha, 0.0, 1.0));
}
