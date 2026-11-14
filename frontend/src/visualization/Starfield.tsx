import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * A deep-space backdrop for every view: thousands of tiny, faintly twinkling stars on a sky sphere,
 * with a denser "milky way" band. The sphere follows the camera, so stars stay infinitely far away
 * (they never slide past the city or get clipped when zooming).
 */

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const SKY_RADIUS = 400; // inside the camera's far plane (600)

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = aColor;
    // Each star twinkles at its own pace; most only a little.
    vTwinkle = 0.8 + 0.2 * sin(uTime * (0.6 + fract(aPhase * 7.13) * 1.8) + aPhase * 6.2831);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    // Soft round dot instead of a square point.
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * vTwinkle, a * vTwinkle);
  }
`;

// Mostly white, some cool blue-white, a few warm stars — like a real night sky.
const TINTS = [new THREE.Color('#ffffff'), new THREE.Color('#cfe3ff'), new THREE.Color('#a9c8ff'), new THREE.Color('#ffe2c4')];

function randomOnSphere(rng: () => number, out: THREE.Vector3) {
  const u = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(t), u, s * Math.sin(t));
}

/** Deterministic PRNG so the sky looks the same on every visit. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStars(count: number) {
  const rng = mulberry32(20261114);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  // The milky-way band: a great circle tilted across the sky.
  const bandNormal = new THREE.Vector3(0.35, 1, -0.25).normalize();
  const p = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < count; i++) {
    randomOnSphere(rng, p);
    if (rng() < 0.55) {
      // Pull this star towards the band: remove most of its component along the band's normal.
      const along = p.dot(bandNormal);
      const spread = 0.04 + rng() * rng() * 0.22;
      p.addScaledVector(bandNormal, -along * (1 - spread)).normalize();
    }
    p.multiplyScalar(SKY_RADIUS);
    positions.set([p.x, p.y, p.z], i * 3);

    // Brightness skewed low: a sky full of faint stars and only a handful of bright ones.
    const r = rng();
    const brightness = 0.45 + 0.55 * r * r * r;
    c.copy(TINTS[rng() < 0.7 ? 0 : 1 + Math.floor(rng() * 3)]).multiplyScalar(brightness);
    colors.set([c.r, c.g, c.b], i * 3);

    sizes[i] = 1.1 + r * r * r * r * 2.9; // ~1.1 px for most, up to ~4 px for the brightest
    phases[i] = rng();
  }
  return { positions, colors, sizes, phases };
}

export function Starfield({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();

  const geometry = useMemo(() => {
    const { positions, colors, sizes, phases } = buildStars(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: gl.getPixelRatio() } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [gl],
  );

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    g.position.copy(camera.position); // sky sphere stays centred on the viewer
    material.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    if (!reducedMotion) {
      material.uniforms.uTime.value += delta;
      g.rotation.y += delta * 0.004; // a very slow drift
    }
  });

  return (
    <group ref={group}>
      <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />
    </group>
  );
}
