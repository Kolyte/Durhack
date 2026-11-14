import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Branch } from '../layouts';
import { pulses } from '../pulseBus';

const UP = new THREE.Vector3(0, 1, 0);

/** Trunk and branches of the Code Tree. They grow outward (trunk first) and glow faintly on the beat. */
/** Shared bark material (kept for the app's lifetime so its shader is compiled only once). */
let bark: THREE.MeshStandardMaterial | null = null;
const getBark = () =>
  (bark ??= new THREE.MeshStandardMaterial({ color: '#2a2150', emissive: '#a78bfa', emissiveIntensity: 0.12, roughness: 0.85 }));

export function TreeBranches({ branches, visible = true }: { branches: Branch[]; visible?: boolean }) {
  const material = getBark();
  const matRef = useRef(material);
  const groups = useRef(new Map<number, THREE.Group>());
  const born = useRef(0);

  const items = useMemo(
    () =>
      branches.map((b) => {
        const start = new THREE.Vector3(...b.start);
        const dir = new THREE.Vector3(...b.end).sub(start);
        const length = dir.length();
        const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
        return { b, start, length, quat };
      }),
    [branches],
  );

  useFrame((state, delta) => {
    if (born.current === 0) born.current = state.clock.elapsedTime;
    const age = state.clock.elapsedTime - born.current;
    for (const [i, g] of groups.current) {
      // Each depth level starts growing 0.35s after its parent.
      const t = Math.max(0, Math.min(1, (age - items[i].b.depth * 0.35) / 0.9));
      const eased = 1 - Math.pow(1 - t, 3);
      g.scale.set(Math.max(0.001, eased), Math.max(0.001, eased), Math.max(0.001, eased));
    }
    matRef.current.emissiveIntensity = 0.12 + pulses.ground * 0.18;
    void delta;
  });

  return (
    <group visible={visible}>
      {items.map(({ b, start, length, quat }, i) => (
        <group
          key={i}
          position={start}
          quaternion={quat}
          ref={(g) => {
            if (!g) return;
            const map = groups.current;
            map.set(i, g);
            return () => void map.delete(i);
          }}
        >
          <mesh position={[0, length / 2, 0]} material={material}>
            <cylinderGeometry args={[b.radius * 0.62, b.radius, length, 10]} />
          </mesh>
          {/* A knot at each joint hides the seam between segments. */}
          <mesh position={[0, length, 0]} material={material}>
            <sphereGeometry args={[b.radius * 0.66, 10, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
