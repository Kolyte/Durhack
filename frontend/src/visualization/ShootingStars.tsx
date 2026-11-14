import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Every few seconds a shooting star streaks across the part of the sky the camera is looking at:
 * a faint head with a fading tail, drawn as a camera-facing ribbon on the far sky sphere.
 */

const reducedMotion =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const SKY_RADIUS = 380; // just inside the starfield (400), within the camera's far plane
const POOL = 2; // at most two at once

const vertexShader = /* glsl */ `
  attribute float aT;     // 0 = end of tail, 1 = head
  attribute float aSide;  // -1 / +1 across the ribbon
  varying float vT;
  varying float vSide;
  void main() {
    vT = aT;
    vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uAlpha;
  varying float vT;
  varying float vSide;
  void main() {
    float along = vT * vT * vT;                    // tail fades out quickly
    float across = 1.0 - smoothstep(0.0, 1.0, abs(vSide));
    vec3 color = mix(vec3(0.55, 0.75, 1.0), vec3(1.0), vT); // blue-white tail, white head
    // Kept faint and below the bloom threshold: it's part of the backdrop, not a foreground effect.
    gl_FragColor = vec4(color * (0.5 + 0.5 * along), along * across * uAlpha * 0.45);
  }
`;

interface Meteor {
  active: boolean;
  age: number;
  life: number;
  start: THREE.Vector3; // on the sky sphere, relative to the camera
  dir: THREE.Vector3; // unit direction of travel
  speed: number; // world units per second
  length: number; // tail length
  width: number;
}

function createPool() {
  return Array.from({ length: POOL }, () => {
    // 2 segments along the ribbon (tail → middle → head) × 2 sides = 6 vertices.
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array([0, 0, 0.5, 0.5, 1, 1]), 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array([-1, 1, -1, 1, -1, 1]), 1));
    g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uAlpha: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      side: THREE.DoubleSide,
    });
    const meteor: Meteor = {
      active: false,
      age: 0,
      life: 1,
      start: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      speed: 0,
      length: 0,
      width: 0,
    };
    return { geometry: g, material: m, meteor };
  });
}


export function ShootingStars() {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const nextSpawn = useRef(3); // first one a few seconds after the scene appears

  // Mutable per-frame state lives in a ref (it is never part of React's render output).
  const pool = useRef<ReturnType<typeof createPool> | null>(null);
  pool.current ??= createPool();
  const items = pool.current;

  const tmp = useMemo(
    () => ({
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      head: new THREE.Vector3(),
      tail: new THREE.Vector3(),
      side: new THREE.Vector3(),
      p: new THREE.Vector3(),
    }),
    [],
  );

  const spawn = (m: Meteor) => {
    const { fwd, right, up } = tmp;
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    up.crossVectors(right, fwd).normalize();
    // Start somewhere in the upper part of the view (where the sky is), not straight ahead.
    const h = (Math.random() * 2 - 1) * 0.55;
    const v = 0.1 + Math.random() * 0.35;
    m.start.copy(fwd).addScaledVector(right, h).addScaledVector(up, v).normalize().multiplyScalar(SKY_RADIUS);
    // Fall diagonally, towards the centre of the view, like a real meteor.
    const sideways = (h > 0 ? -1 : 1) * (0.6 + Math.random() * 0.6);
    m.dir.copy(right).multiplyScalar(sideways).addScaledVector(up, -(0.35 + Math.random() * 0.5));
    // Keep the motion tangent to the sky sphere.
    m.dir.addScaledVector(m.start, -m.dir.dot(m.start) / (SKY_RADIUS * SKY_RADIUS)).normalize();
    m.speed = 140 + Math.random() * 90;
    m.length = 28 + Math.random() * 26;
    m.width = 0.6 + Math.random() * 0.4;
    m.life = 0.7 + Math.random() * 0.6;
    m.age = 0;
    m.active = true;
  };

  useFrame((_, delta) => {
    const g = group.current;
    if (!g || reducedMotion) return;
    g.position.copy(camera.position); // sky follows the viewer, like the starfield

    nextSpawn.current -= delta;
    if (nextSpawn.current <= 0) {
      const free = items.find((it) => !it.meteor.active);
      if (free) spawn(free.meteor);
      // Usually one every 3–8 s; now and then a quick second one.
      nextSpawn.current = Math.random() < 0.15 ? 0.4 + Math.random() * 0.6 : 3 + Math.random() * 5;
    }

    const { head, tail, side, p } = tmp;
    for (const { geometry, material, meteor: m } of items) {
      if (!m.active) {
        material.uniforms.uAlpha.value = 0;
        continue;
      }
      m.age += delta;
      const k = m.age / m.life;
      if (k >= 1) {
        m.active = false;
        material.uniforms.uAlpha.value = 0;
        continue;
      }
      // Quick fade in, longer fade out.
      material.uniforms.uAlpha.value = Math.min(1, k / 0.15) * Math.min(1, (1 - k) / 0.45);

      head.copy(m.start).addScaledVector(m.dir, m.speed * m.age);
      // The tail grows in during the first moments instead of popping in at full length.
      const len = m.length * Math.min(1, k / 0.25);
      tail.copy(head).addScaledVector(m.dir, -len);
      // Ribbon faces the camera (which sits at the group origin).
      side.crossVectors(m.dir, head).normalize();

      const pos = geometry.attributes.position as THREE.BufferAttribute;
      const pts = [tail, p.lerpVectors(tail, head, 0.5).clone(), head];
      const widths = [0.15, 0.55, 1];
      pts.forEach((pt, i) => {
        const w = m.width * widths[i];
        pos.setXYZ(i * 2, pt.x - side.x * w, pt.y - side.y * w, pt.z - side.z * w);
        pos.setXYZ(i * 2 + 1, pt.x + side.x * w, pt.y + side.y * w, pt.z + side.z * w);
      });
      pos.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} geometry={it.geometry} material={it.material} frustumCulled={false} renderOrder={-1} />
      ))}
    </group>
  );
}
