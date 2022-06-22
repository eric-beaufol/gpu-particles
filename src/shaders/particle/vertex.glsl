#pragma glslify: noise = require(glsl-noise/simplex/4d)

varying vec2 vUv;
attribute vec2 reference;
uniform sampler2D positionTexture1;
uniform sampler2D positionTexture2;
uniform float uTime;
uniform float uStrength;
uniform float uSpeed;
uniform float uSize;
uniform float uSlider;

void main() {
  vUv = reference;
  vec3 pos = mix(
    texture2D(positionTexture1, reference).xyz,
    texture2D(positionTexture2, reference).xyz,
    uSlider
  );

  // vec3 pos = texture2D(positionTexture1, reference).xyz;

  pos.x += noise(vec4(pos.xyz, uTime * uSpeed)) * uStrength;
  pos.y += noise(vec4(pos.xyz, uTime * uSpeed)) * uStrength;
  pos.z += noise(vec4(pos.xyz, uTime * uSpeed)) * uStrength;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1);

  gl_PointSize = uSize * (1. / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}