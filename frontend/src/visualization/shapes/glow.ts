import * as THREE from 'three';

/**
 * A soft, view-dependent halo (Fresnel rim): bright at the silhouette, clear in the middle. Used for
 * planet atmospheres and glowing fruit. All instances share one shader program; only uniforms differ.
 */
const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
    float a = pow(rim, 2.6) * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function createGlowMaterial(color = '#38bdf8'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0.7 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

const billboardVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// A star's corona: a bright core, a soft halo, four light spikes and a faint slow shimmer.
const coronaFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c);
    float ang = atan(c.y, c.x);
    float halo = exp(-d * 7.0) * (0.9 + 0.1 * sin(ang * 9.0 + uTime * 0.6));
    float core = exp(-d * 30.0) * 1.4;
    float spikes = (exp(-abs(c.x) * 120.0) + exp(-abs(c.y) * 120.0)) * smoothstep(0.5, 0.02, d) * 0.7;
    float a = (halo + spikes) * uIntensity * smoothstep(0.5, 0.35, d);
    vec3 col = mix(uColor, vec3(1.0), clamp(core, 0.0, 1.0));
    gl_FragColor = vec4(col * (a + core * uIntensity), a + core * uIntensity);
  }
`;

export function createCoronaMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: billboardVertex,
    fragmentShader: coronaFragment,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0.6 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
