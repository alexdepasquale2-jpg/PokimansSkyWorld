shader_type canvas_item;

uniform vec3 accent_color : source_color = vec3(0.34, 0.70, 1.0);
uniform float intensity : hint_range(0.0, 1.0) = 0.25;
uniform float speed : hint_range(0.0, 5.0) = 1.0;

void fragment() {
	vec2 uv = UV;
	vec2 centered = uv - vec2(0.5);
	float dist = length(centered);
	float wave = sin((dist * 12.0) - TIME * speed * 1.2 + 0.6) * 0.5 + 0.5;
	float ring = smoothstep(0.42, 0.0, abs(dist - 0.26 - 0.06 * sin(TIME * speed * 0.7)));
	float glow = wave * 0.12 + ring * 0.24;
	vec3 col = accent_color * (0.08 + glow * intensity);
	COLOR = vec4(col, clamp(0.06 + glow * 0.25 * intensity, 0.0, 0.4));
}
