uniform float uTime;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 position = texture2D(texturePosition1, uv).xyz;

  gl_FragColor = vec4(position, 1.);
}