shader_type canvas_item;

// Drifting procedural starfield for full-screen UI backgrounds (main menu,
// landfall). Pure noise, no texture asset needed.

uniform float speed : hint_range(0.0, 2.0) = 0.06;
uniform vec3 tint : source_color = vec3(0.05, 0.07, 0.12);

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
	vec2 uv = UV * vec2(1.0, 1.0);
	vec3 col = tint;
	for (int layer = 0; layer < 3; layer++) {
		float scale = 40.0 + float(layer) * 55.0;
		vec2 grid = uv * scale + vec2(TIME * speed * float(layer + 1), 0.0);
		vec2 cell = floor(grid);
		float star = hash(cell);
		float twinkle = sin(TIME * (1.5 + star * 3.0) + star * 30.0) * 0.5 + 0.5;
		float dist = length(fract(grid) - 0.5);
		float glow = smoothstep(0.06 + star * 0.03, 0.0, dist) * step(0.90, star);
		col += vec3(glow * twinkle * (0.5 + 0.5 / float(layer + 1)));
	}
	COLOR = vec4(col, 1.0);
}
