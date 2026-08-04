shader_type canvas_item;

uniform vec4 flash_color : source_color = vec4(1.0, 0.78, 0.25, 1.0);
uniform float intensity : hint_range(0.0, 1.0) = 0.0;
uniform float pulse_speed : hint_range(0.0, 10.0) = 3.0;
uniform float shimmer : hint_range(0.0, 0.25) = 0.04;

void fragment() {
    vec4 base = texture(TEXTURE, UV);
    float wave = 0.5 + 0.5 * sin(TIME * pulse_speed + UV.x * 8.0 + UV.y * 8.0);
    vec3 tinted = mix(base.rgb, flash_color.rgb, intensity * (0.35 + 0.65 * wave));
    vec3 shimmer_rgb = tinted + vec3(shimmer * wave * intensity);
    COLOR = vec4(shimmer_rgb, base.a * (1.0 - 0.2 * intensity));
}
