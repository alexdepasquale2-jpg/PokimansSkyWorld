shader_type canvas_item;

// Pulsing rim glow for a crystallized archetype — driven by TIME so it never
// needs a per-frame script tween. `active` is the only thing gameplay toggles.
uniform bool active = false;
uniform vec3 glow_color : source_color = vec3(1.0, 0.85, 0.4);
uniform float glow_strength : hint_range(0.0, 2.0) = 0.6;

void fragment() {
	if (active) {
		float pulse = sin(TIME * 3.5) * 0.5 + 0.5;
		COLOR.rgb += glow_color * glow_strength * pulse * COLOR.a;
	}
}
