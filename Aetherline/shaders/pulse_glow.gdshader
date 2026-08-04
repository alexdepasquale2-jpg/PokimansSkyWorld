shader_type canvas_item;

uniform vec3 tint : source_color = vec3(0.96, 0.78, 0.36);
uniform float pulse : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec2 uv = UV;
	vec2 centered = uv - vec2(0.5);
	float dist = length(centered);
	float glow = smoothstep(0.55, 0.0, dist) * (0.25 + pulse * 0.65);
	COLOR = vec4(tint, glow);
}
