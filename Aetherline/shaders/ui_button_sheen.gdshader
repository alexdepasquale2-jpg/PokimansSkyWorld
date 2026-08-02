shader_type canvas_item;

// Button backdrop: a soft vertical gradient plus a diagonal sheen that sweeps
// across on hover. `hover` is 0/1, tweened by the script that owns the button.

uniform vec3 base_color : source_color = vec3(0.16, 0.20, 0.28);
uniform vec3 accent_color : source_color = vec3(0.35, 0.75, 1.0);
uniform float hover : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec3 col = mix(base_color, base_color * 1.35, UV.y);
	float diag = UV.x + (1.0 - UV.y);
	float sheen_pos = mix(-0.4, 2.4, hover);
	float sheen = smoothstep(0.22, 0.0, abs(diag - sheen_pos));
	col += accent_color * sheen * 0.5;
	col = mix(col, mix(col, accent_color, 0.18), hover);
	COLOR = vec4(col, 1.0);
}
