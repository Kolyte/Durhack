import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { pulses } from '../pulseBus';
import { mulberry32, noRaycast, reducedMotion } from './random';

/**
 * The Code Tree's surroundings: a glowing forest floor with moss, grass, flowers and luminous
 * mushrooms, roots spreading from the trunk, fireflies drifting through the branches, petals falling
 * from the canopy and a big moon behind it all. Instanced meshes and two particle systems only.
 */

const GROUND_Y = -0.13;

const floorVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
// Moss glowing softly under the tree, fading into the night at the edge, with a ring that pulses on the beat.
const floorFragment = /* glsl */ `
  uniform float uBeat;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c) * 2.0;
    float n = noise(vUv * 40.0) * 0.5 + noise(vUv * 11.0) * 0.5;
    vec3 moss = mix(vec3(0.02, 0.07, 0.06), vec3(0.05, 0.22, 0.17), n);
    vec3 col = moss * (1.0 - smoothstep(0.15, 1.0, d)) + vec3(0.024, 0.035, 0.08) * smoothstep(0.6, 1.0, d);
    float ring = smoothstep(0.02, 0.0, abs(d - 0.22 - uBeat * 0.05)) * (0.15 + uBeat * 0.2);
    col += vec3(0.18, 0.83, 0.75) * ring;
    float alpha = 1.0 - smoothstep(0.85, 1.0, d);
    gl_FragColor = vec4(col, alpha);
  }
`;

const fireflyVertex = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vBlink;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.35 + aPhase * 6.28) * 0.6;
    p.y += sin(uTime * 0.5 + aPhase * 3.1) * 0.35;
    p.z += cos(uTime * 0.3 + aPhase * 5.0) * 0.6;
    vBlink = pow(0.5 + 0.5 * sin(uTime * (1.2 + aPhase) + aPhase * 40.0), 3.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(55.0 / -mv.z, 1.5, 10.0) * uPixelRatio;
  }
`;
const fireflyFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vBlink;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (smoothstep(0.5, 0.0, d) * 0.6 + smoothstep(0.15, 0.0, d)) * (0.15 + vBlink);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const petalVertex = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uTop;
  uniform float uPixelRatio;
  varying float vFade;
  varying float vSpin;
  void main() {
    // Each petal falls from the canopy to the ground, drifting sideways, then starts again.
    float fall = fract(uTime * 0.035 * (0.6 + aPhase) + aPhase);
    vec3 p = position;
    p.y = mix(uTop, 0.0, fall);
    p.x += sin(uTime * 0.8 + aPhase * 20.0) * 0.5 + fall * 1.5;
    p.z += cos(uTime * 0.6 + aPhase * 13.0) * 0.5;
    vFade = smoothstep(0.0, 0.08, fall) * smoothstep(1.0, 0.85, fall);
    vSpin = uTime * (1.0 + aPhase * 2.0) + aPhase * 10.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(70.0 / -mv.z, 1.5, 12.0) * uPixelRatio;
  }
`;
const petalFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vFade;
  varying float vSpin;
  void main() {
    // A small oval that tumbles (rotating and flattening) as it falls.
    vec2 c = gl_PointCoord - 0.5;
    float s = sin(vSpin), co = cos(vSpin);
    c = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
    c.y /= 0.35 + 0.65 * abs(sin(vSpin * 0.7));
    float a = smoothstep(0.5, 0.3, length(c * vec2(1.0, 1.8))) * vFade * 0.9;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const moonFragment = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 c = vUv - 0.5;
    float d = length(c);
    float disc = smoothstep(0.205, 0.195, d);
    // Soft maria on the disc.
    float maria = 0.85 - 0.18 * smoothstep(0.09, 0.0, length(c - vec2(0.05, 0.04)))
                       - 0.12 * smoothstep(0.06, 0.0, length(c + vec2(0.07, 0.02)));
    float halo = exp(-max(0.0, d - 0.2) * 14.0) * 0.45 * (1.0 - disc);
    vec3 col = vec3(0.92, 0.95, 1.0) * disc * maria + vec3(0.55, 0.65, 1.0) * halo;
    float a = max(disc, halo);
    gl_FragColor = vec4(col, a);
  }
`;

function scatter(rng: () => number, count: number, rMin: number, rMax: number) {
  return Array.from({ length: count }, () => {
    const a = rng() * Math.PI * 2;
    const r = rMin + Math.sqrt(rng()) * (rMax - rMin);
    return [Math.cos(a) * r, Math.sin(a) * r, rng(), rng()] as const;
  });
}

function instancedAt(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], colors?: THREE.Color[]) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  colors?.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

const FLOWER_COLORS = ['#f472b6', '#a78bfa', '#fde68a', '#f9a8d4', '#7dd3fc'].map((c) => new THREE.Color(c));
const CAP_COLORS = ['#2dd4bf', '#38bdf8', '#f472b6', '#a78bfa'].map((c) => new THREE.Color(c));

function buildFloor(radius: number, lowPower: boolean) {
  const rng = mulberry32(99);
  const o = new THREE.Object3D();
  const at = (x: number, y: number, z: number, s: [number, number, number], ry = 0, rx = 0) => {
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, 0);
    o.scale.set(...s);
    o.updateMatrix();
    return o.matrix.clone();
  };
  const R = radius * 0.95;
  const objects: THREE.Object3D[] = [];

  // Grass tufts: thin dark-teal blades.
  const grass = scatter(rng, lowPower ? 450 : 1100, 0.6, R);
  objects.push(
    instancedAt(
      new THREE.ConeGeometry(0.03, 0.4, 3).translate(0, 0.2, 0),
      new THREE.MeshStandardMaterial({ color: '#0f3d35', emissive: '#0f766e', emissiveIntensity: 0.25, roughness: 0.9 }),
      grass.map(([x, z, a, b]) => at(x, GROUND_Y, z, [1, 0.5 + a * 1.2, 1], b * 6, (a - 0.5) * 0.5)),
    ),
  );

  // Flowers: small glowing heads on the floor.
  const flowers = scatter(rng, lowPower ? 70 : 160, 1.2, R * 0.9);
  objects.push(
    instancedAt(
      new THREE.IcosahedronGeometry(0.07, 0),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.6, toneMapped: false }),
      flowers.map(([x, z, a]) => at(x, GROUND_Y + 0.12 + a * 0.12, z, [1, 0.7, 1])),
      flowers.map((_, i) => FLOWER_COLORS[i % FLOWER_COLORS.length]),
    ),
  );

  // Luminous mushrooms: stem + cap, in small clusters.
  const clusters = scatter(rng, lowPower ? 10 : 18, 1.5, R * 0.85);
  const shrooms = clusters.flatMap(([x, z]) => Array.from({ length: 3 }, () => [x + (rng() - 0.5) * 0.7, z + (rng() - 0.5) * 0.7, 0.6 + rng() * 0.9] as const));
  objects.push(
    instancedAt(
      new THREE.CylinderGeometry(0.035, 0.05, 0.3, 6).translate(0, 0.15, 0),
      new THREE.MeshStandardMaterial({ color: '#d9e7ff', emissive: '#94a3b8', emissiveIntensity: 0.3 }),
      shrooms.map(([x, z, s]) => at(x, GROUND_Y, z, [s, s, s])),
    ),
  );
  const caps = instancedAt(
    new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.4, toneMapped: false }),
    shrooms.map(([x, z, s]) => at(x, GROUND_Y + 0.28 * s, z, [s, s * 0.8, s])),
    shrooms.map((_, i) => CAP_COLORS[i % CAP_COLORS.length]),
  );
  objects.push(caps);

  // Roots spreading from the trunk, half buried.
  const rootMat = new THREE.MeshStandardMaterial({ color: '#2a2150', emissive: '#a78bfa', emissiveIntensity: 0.12, roughness: 0.85 });
  const roots = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 + rng() * 0.4;
    const len = 1.4 + rng() * 1.6;
    const g = new THREE.CylinderGeometry(0.03, 0.16, len, 7).translate(0, len / 2, 0).rotateZ(-Math.PI / 2 + 0.12).rotateY(-a);
    return new THREE.Mesh(g, rootMat).translateY(GROUND_Y + 0.02);
  });
  objects.push(...roots);

  return { objects, caps };
}

export function TreeWorld({ visible, radius, height, lowPower }: { visible: boolean; radius: number; height: number; lowPower: boolean }) {
  const R = Math.max(8, radius);
  const floor = useMemo(() => buildFloor(R, lowPower), [R, lowPower]);
  useEffect(
    () => () =>
      floor.objects.forEach((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material)?.dispose?.();
      }),
    [floor],
  );

  const floorMat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: floorVertex, fragmentShader: floorFragment, uniforms: { uBeat: { value: 0 } }, transparent: true, depthWrite: false }),
    [],
  );
  const moonMat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: floorVertex, fragmentShader: moonFragment, transparent: true, depthWrite: false, fog: false }),
    [],
  );

  const flies = useMemo(() => {
    const rng = mulberry32(5);
    const n = lowPower ? 90 : 200;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * R * 0.75;
      pos.set([Math.cos(a) * r, 0.3 + rng() * height * 1.1, Math.sin(a) * r], i * 3);
      phase[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    return g;
  }, [R, height, lowPower]);
  const petals = useMemo(() => {
    const rng = mulberry32(11);
    const n = lowPower ? 60 : 140;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * R * 0.6;
      pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
      phase[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    return g;
  }, [R, lowPower]);
  useEffect(() => () => flies.dispose(), [flies]);
  useEffect(() => () => petals.dispose(), [petals]);

  const fliesMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: fireflyVertex,
        fragmentShader: fireflyFragment,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uColor: { value: new THREE.Color('#d9f99d') } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const petalMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: petalVertex,
        fragmentShader: petalFragment,
        uniforms: { uTime: { value: 0 }, uTop: { value: height }, uPixelRatio: { value: 1 }, uColor: { value: new THREE.Color('#f9a8d4') } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [height],
  );

  const capMat = floor.caps.material as THREE.MeshStandardMaterial;
  const time = useRef(0);
  useFrame((state, delta) => {
    if (!visible) return;
    if (!reducedMotion) time.current += delta;
    const pr = state.gl.getPixelRatio();
    fliesMat.uniforms.uTime.value = time.current;
    fliesMat.uniforms.uPixelRatio.value = pr;
    petalMat.uniforms.uTime.value = time.current;
    petalMat.uniforms.uPixelRatio.value = pr;
    floorMat.uniforms.uBeat.value = pulses.ground;
    capMat.emissiveIntensity = 0.5 + pulses.ground * 0.6;
  });

  return (
    <group visible={visible}>
      <mesh raycast={noRaycast} material={floorMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y + 0.005, 0]}>
        <circleGeometry args={[R * 1.15, 72]} />
      </mesh>
      {floor.objects.map((o) => (
        <primitive key={o.uuid} object={o} raycast={noRaycast} />
      ))}
      <points raycast={noRaycast} geometry={flies} material={fliesMat} frustumCulled={false} />
      <points raycast={noRaycast} geometry={petals} material={petalMat} frustumCulled={false} />
      <Billboard position={[-R * 3.2, height * 0.95 + R * 0.35, -R * 3.4]}>
        <mesh raycast={noRaycast} material={moonMat} scale={R * 1.5}>
          <planeGeometry />
        </mesh>
      </Billboard>
      {/* Cool moonlight from behind, so leaves get a rim of light. */}
      <directionalLight position={[-R * 2.2, height * 1.4 + R, -R * 3]} intensity={visible ? 0.6 : 0} color="#c7d2fe" />
    </group>
  );
}
