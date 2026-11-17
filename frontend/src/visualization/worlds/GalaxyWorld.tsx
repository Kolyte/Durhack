import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { pulses } from '../pulseBus';
import { createGlowMaterial } from '../shapes/glow';
import { mulberry32, noRaycast, reducedMotion } from './random';

/**
 * The Dependency Galaxy's surroundings: a spiral galaxy turning slowly beneath the solar systems,
 * coloured nebulae far away, and an asteroid belt circling everything. All of it is a handful of draw
 * calls (points, instanced rocks and a few billboards), so it costs little even on phones.
 */

const spiralVertex = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uBeat;
  varying vec3 vColor;
  void main() {
    // Only a faint response to the beat: the spiral fills the screen, and a strong pulse read as blinking.
    vColor = aColor * (0.9 + uBeat * 0.06);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Perspective size, clamped so close dust doesn't turn into blobs.
    gl_PointSize = clamp(aSize * uPixelRatio * (90.0 / -mv.z), 1.0, 9.0 * uPixelRatio);
  }
`;
const spiralFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const nebulaVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
// Soft fractal-noise cloud, faded towards the edges of the billboard.
const nebulaFragment = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 p = vUv * 3.0 + uSeed;
    float n = fbm(p + vec2(uTime * 0.01, -uTime * 0.007) + fbm(p * 1.7));
    float edge = smoothstep(0.5, 0.05, length(vUv - 0.5));
    float a = smoothstep(0.35, 0.95, n) * edge * uOpacity;
    vec3 col = mix(uColorA, uColorB, smoothstep(0.3, 0.9, fbm(p * 0.8 + 5.0)));
    gl_FragColor = vec4(col * a, a);
  }
`;

const coreFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c);
    float glow = exp(-d * 9.0) * 1.2 + exp(-d * 22.0);
    // Faint diffraction spikes.
    float spikes = (exp(-abs(c.x) * 160.0) + exp(-abs(c.y) * 160.0)) * smoothstep(0.5, 0.0, d) * 0.5;
    float a = (glow + spikes) * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const ARM_COLORS = ['#7dd3fc', '#a78bfa', '#f0abfc', '#5eead4'].map((c) => new THREE.Color(c));
const CORE_COLOR = new THREE.Color('#ffe7b8');

function buildSpiral(count: number, radius: number) {
  const rng = mulberry32(42);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const arms = 4;
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = Math.pow(rng(), 0.6); // more stars near the core
    const r = t * radius;
    const arm = Math.floor(rng() * arms);
    const twist = r / radius * 5.2;
    const spread = (rng() - 0.5) * (0.35 + 0.6 * (1 - t)) * (rng() < 0.25 ? 3 : 1);
    const a = (arm / arms) * Math.PI * 2 + twist + spread;
    const y = (rng() - 0.5) * radius * 0.05 * (1.4 - t);
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    c.copy(CORE_COLOR).lerp(ARM_COLORS[arm], Math.min(1, t * 1.6)).multiplyScalar(0.35 + rng() * 0.65);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 1 + rng() * rng() * 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  return g;
}

function buildBelt(count: number, radius: number) {
  const rng = mulberry32(7);
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: '#3b3552', roughness: 0.95, flatShading: true, emissive: '#1e1b4b', emissiveIntensity: 0.3 }),
    count,
  );
  const o = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = radius * (1 + (rng() - 0.5) * 0.14);
    o.position.set(Math.cos(a) * r, (rng() - 0.5) * radius * 0.04, Math.sin(a) * r);
    o.rotation.set(rng() * 6, rng() * 6, rng() * 6);
    const s = 0.05 + Math.pow(rng(), 3) * 0.35;
    o.scale.set(s * (0.7 + rng() * 0.6), s * (0.7 + rng() * 0.6), s);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

const NEBULAE = [
  { dir: [-1, 0.35, -0.8], a: '#0f766e', b: '#38bdf8', seed: 1.3, scale: 1.0 },
  { dir: [0.9, 0.5, -0.6], a: '#7c3aed', b: '#f472b6', seed: 4.1, scale: 1.25 },
  { dir: [0.2, -0.25, 1], a: '#1d4ed8', b: '#a78bfa', seed: 7.7, scale: 0.9 },
  { dir: [-0.6, 0.8, 0.5], a: '#be185d', b: '#fb923c', seed: 2.2, scale: 0.7 },
] as const;

export function GalaxyWorld({ visible, radius, lowPower }: { visible: boolean; radius: number; lowPower: boolean }) {
  const R = Math.max(10, radius);
  const spin = useRef<THREE.Group>(null);
  const belt = useRef<THREE.Group>(null);

  const spiral = useMemo(() => buildSpiral(lowPower ? 7000 : 16000, R * 3.4), [R, lowPower]);
  const spiralMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: spiralVertex,
        fragmentShader: spiralFragment,
        uniforms: { uPixelRatio: { value: 1 }, uBeat: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const asteroids = useMemo(() => buildBelt(lowPower ? 220 : 520, R * 1.18), [R, lowPower]);
  const nebulae = useMemo(
    () =>
      NEBULAE.map(
        (n) =>
          new THREE.ShaderMaterial({
            vertexShader: nebulaVertex,
            fragmentShader: nebulaFragment,
            uniforms: {
              uColorA: { value: new THREE.Color(n.a) },
              uColorB: { value: new THREE.Color(n.b) },
              uTime: { value: 0 },
              uSeed: { value: n.seed },
              uOpacity: { value: 0.85 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false,
          }),
      ),
    [],
  );
  const coreMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: nebulaVertex,
        fragmentShader: coreFragment,
        uniforms: { uColor: { value: CORE_COLOR.clone() }, uIntensity: { value: 0.9 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  );
  // Compiled with everything else (see ShaderWarmup), so the first planet atmosphere is free.
  const warmGlow = useMemo(() => createGlowMaterial(), []);

  useEffect(
    () => () => {
      spiral.dispose();
    },
    [spiral],
  );
  useEffect(
    () => () => {
      asteroids.geometry.dispose();
      (asteroids.material as THREE.Material).dispose();
      asteroids.dispose();
    },
    [asteroids],
  );

  useFrame((state, delta) => {
    if (!visible) return;
    spiralMat.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    spiralMat.uniforms.uBeat.value = pulses.ground;
    coreMat.uniforms.uIntensity.value = 0.42 + pulses.ground * 0.04;
    if (reducedMotion) return;
    if (spin.current) spin.current.rotation.y += delta * 0.012;
    if (belt.current) belt.current.rotation.y += delta * 0.02;
    for (const m of nebulae) m.uniforms.uTime.value += delta;
  });

  const far = R * 5.5;
  return (
    <group visible={visible}>
      {/* The host galaxy, seen at an angle below the solar systems. */}
      <group position={[R * 0.3, -R * 1.25, -R * 0.6]} rotation={[0.22, 0, 0.1]}>
        <group ref={spin}>
          <points raycast={noRaycast} geometry={spiral} material={spiralMat} frustumCulled={false} />
        </group>
        <Billboard>
          <mesh raycast={noRaycast} material={coreMat} scale={R * 1.5}>
            <planeGeometry />
          </mesh>
        </Billboard>
      </group>

      <group ref={belt}>
        <primitive object={asteroids} raycast={noRaycast} />
      </group>

      {NEBULAE.map((n, i) => {
        const d = new THREE.Vector3(...n.dir).normalize().multiplyScalar(far);
        return (
          <Billboard key={i} position={[d.x, d.y, d.z]}>
            <mesh raycast={noRaycast} material={nebulae[i]} scale={far * 0.9 * n.scale}>
              <planeGeometry />
            </mesh>
          </Billboard>
        );
      })}

      <mesh raycast={noRaycast} material={warmGlow} position={[0, -1000, 0]} scale={0.001}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
    </group>
  );
}
