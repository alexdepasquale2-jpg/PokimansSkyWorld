shader_type canvas_item;

// Full-screen atmospheric haze for the overworld. Driven by biome tint and
// planet hostility so each world has a distinct "air" — the Odyssey survival
// read of climate pressing on the body.

uniform vec3 haze_color : source_color = vec3(0.55, 0.72, 0.95);
uniform float density : hint_range(0.0, 1.0) = 0.22;
uniform float grain : hint_range(0.0, 0.2) = 0.04;
uniform float wind : hint_range(0.0, 2.0) = 0.35;
uniform float vignette : hint_range(0.0, 1.0) = 0.35;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = UV;
	vec2 drift = uv + vec2(TIME * wind * 0.02, TIME * wind * 0.01);
	float n = hash(floor(drift * 180.0));
	float soft = hash(floor(drift * 48.0 + 3.7));

	// Soft volumetric bands.
	float bands = 0.5 + 0.5 * sin((uv.y + soft * 0.08) * 18.0 + TIME * wind * 0.4);
	float dust = mix(n, soft, 0.6) * grain + bands * density * 0.15;

	float vig = smoothstep(0.2, 0.95, length(uv - vec2(0.5)));
	float alpha = density * 0.55 + dust + vig * vignette * 0.35;
	alpha = clamp(alpha, 0.0, 0.55);

	vec3 col = haze_color * (0.85 + soft * 0.25);
	COLOR = vec4(col, alpha);
}
