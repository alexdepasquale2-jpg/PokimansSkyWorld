shader_type canvas_item;

// Combined per-creature effect shader. A CanvasItem accepts exactly one
// material, so hit-flash and crystallize-glow — otherwise two independent
// techniques (see hit_flash.gdshader / crystallize_glow.gdshader for each in
// isolation) — are composited here for anything actually drawn on screen.

uniform float flash_amount : hint_range(0.0, 1.0) = 0.0;
uniform vec3 flash_color : source_color = vec3(1.0, 1.0, 1.0);

uniform bool glow_active = false;
uniform vec3 glow_color : source_color = vec3(1.0, 0.85, 0.4);
uniform float glow_strength : hint_range(0.0, 2.0) = 0.6;

void fragment() {
	vec3 c = COLOR.rgb;
	if (glow_active) {
		float pulse = sin(TIME * 3.5) * 0.5 + 0.5;
		c += glow_color * glow_strength * pulse * COLOR.a;
	}
	c = mix(c, flash_color, flash_amount);
	COLOR.rgb = c;
}
