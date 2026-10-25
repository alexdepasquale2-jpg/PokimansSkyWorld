shader_type canvas_item;

// Deep-space menu backdrop: layered stars, soft nebulae, and a vignette so
// the title plate sits in a living galaxy rather than a flat void.

uniform float speed : hint_range(0.0, 2.0) = 0.045;
uniform vec3 tint : source_color = vec3(0.03, 0.045, 0.09);
uniform vec3 nebula_a : source_color = vec3(0.12, 0.22, 0.55);
uniform vec3 nebula_b : source_color = vec3(0.45, 0.12, 0.38);
uniform float nebula_strength : hint_range(0.0, 1.5) = 0.85;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * noise(p);
		p *= 2.05;
		a *= 0.5;
	}
	return v;
}

void fragment() {
	vec2 uv = UV;
	vec2 centered = uv - vec2(0.5);
	vec3 col = tint;

	// Slow nebula bands — the "infinite scatter of worlds" feeling.
	vec2 n_uv = uv * 2.4 + vec2(TIME * speed * 0.15, TIME * speed * 0.08);
	float n1 = fbm(n_uv);
	float n2 = fbm(n_uv * 1.7 + vec2(4.2, -1.8) + TIME * speed * 0.05);
	col += nebula_a * n1 * n1 * 0.55 * nebula_strength;
	col += nebula_b * n2 * n2 * 0.40 * nebula_strength;
	col += mix(nebula_a, nebula_b, 0.5) * n1 * n2 * 0.25 * nebula_strength;

	// Three star layers with parallax and twinkle.
	for (int layer = 0; layer < 3; layer++) {
		float scale = 32.0 + float(layer) * 58.0;
		float layer_speed = speed * (0.4 + float(layer) * 0.55);
		vec2 grid = uv * scale + vec2(TIME * layer_speed, TIME * layer_speed * 0.35);
		vec2 cell = floor(grid);
		float star = hash(cell + float(layer) * 17.0);
		float size = hash(cell + 3.7) * 0.045 + 0.012;
		float twinkle = 0.55 + 0.45 * sin(TIME * (1.2 + star * 4.0) + star * 40.0);
		float dist = length(fract(grid) - 0.5);
		float core = smoothstep(size, 0.0, dist) * step(0.88 - float(layer) * 0.04, star);
		float halo = smoothstep(size * 3.2, 0.0, dist) * step(0.94, star) * 0.35;
		float bright = (core + halo) * twinkle * (0.55 + 0.45 / float(layer + 1));
		// Occasional warm giants.
		vec3 star_col = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.82, 0.55), step(0.97, star));
		col += star_col * bright;
	}

	// Soft horizon glow so the menu plate feels grounded in space.
	float horizon = exp(-pow((uv.y - 0.72) * 3.2, 2.0)) * 0.18;
	col += mix(nebula_a, nebula_b, 0.4) * horizon;

	// Vignette keeps focus on the title cluster.
	float vig = 1.0 - smoothstep(0.35, 0.95, length(centered * vec2(1.15, 1.0)));
	col *= mix(0.55, 1.0, vig);

	COLOR = vec4(col, 1.0);
}
