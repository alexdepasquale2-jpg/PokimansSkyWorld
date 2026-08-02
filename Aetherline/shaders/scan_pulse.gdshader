shader_type canvas_item;

// The scanner sweep. A bright ring races outward while a faint grid washes
// behind it — the read is "the world is being sampled", not "an explosion".
// `progress` 0..1 is driven by the spawning script over ~0.9s.

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec3 sweep_color : source_color = vec3(0.45, 0.85, 1.0);

void fragment() {
	vec2 centered = UV - vec2(0.5);
	float dist = length(centered) * 2.0;

	// Leading edge.
	float ring = smoothstep(0.06, 0.0, abs(dist - progress));

	// Trailing wash, brightest just behind the edge and fading to nothing.
	float behind = smoothstep(progress, progress - 0.45, dist) * step(dist, progress);

	// Faint polar grid inside the swept area, so it reads as instrumentation.
	float angle = atan(centered.y, centered.x);
	float spokes = smoothstep(0.86, 1.0, abs(sin(angle * 12.0)));
	float rings = smoothstep(0.86, 1.0, abs(sin(dist * 26.0)));
	float grid = (spokes + rings) * behind * 0.30;

	float alpha = (ring * 0.85 + behind * 0.16 + grid) * (1.0 - progress * 0.55);
	COLOR = vec4(sweep_color, clamp(alpha, 0.0, 1.0));
}
