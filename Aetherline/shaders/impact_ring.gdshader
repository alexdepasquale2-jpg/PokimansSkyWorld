shader_type canvas_item;

// Expanding shockwave ring for a landed hit. Drawn on a full-rect quad;
// `progress` 0..1 drives both the ring radius and its fade, animated by the
// spawning script over ~0.35s.
uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec3 ring_color : source_color = vec3(1.0, 0.9, 0.3);
uniform float ring_width : hint_range(0.01, 0.3) = 0.08;

void fragment() {
	vec2 centered = UV - vec2(0.5);
	float dist = length(centered) * 2.0;
	float radius = progress;
	float edge = abs(dist - radius);
	float ring = smoothstep(ring_width, 0.0, edge);
	float fade = 1.0 - progress;
	COLOR = vec4(ring_color, ring * fade);
}
