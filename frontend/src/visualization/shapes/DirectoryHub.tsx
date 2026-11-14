import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { DirGroup } from '../../model/repoModel';
import type { ViewMode } from '../../types';
import type { HubLayout } from '../layouts';
import { PALETTE } from '../palette';
import { liveHubPositions, pulses, readDecay } from '../pulseBus';

const HUB_COLORS = [PALETTE.teal, PALETTE.lavender, PALETTE.cyan, PALETTE.pink];

/** A directory: a glowing plaza in Code City, a star in the Dependency Galaxy. Lights up on chords. */
export function DirectoryHub({
  group,
  layout,
  mode,
  active,
}: {
  group: DirGroup;
  layout: HubLayout;
  mode: ViewMode;
  active: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);

  const pos = useRef(new THREE.Vector3(...layout.pos));
  const target = useRef(new THREE.Vector3());
  const color = HUB_COLORS[group.index % HUB_COLORS.length];
  const lampColor = useMemo(() => new THREE.Color('#fde68a'), []);
  const street = useMemo(
    () => ({
      lamp: new THREE.MeshBasicMaterial({ color: '#fde68a', toneMapped: false }),
      pole: new THREE.MeshStandardMaterial({ color: '#1e293b' }),
    }),
    [],
  );
  const lampRef = useRef(street.lamp);

  useFrame((_, delta) => {
    target.current.set(...layout.pos);
    pos.current.lerp(target.current, 1 - Math.exp(-delta * 2.5));
    ref.current?.position.copy(pos.current);
    liveHubPositions.set(group.key, [pos.current.x, pos.current.y, pos.current.z]);

    const chord = readDecay(pulses.hub, group.key, delta, 1.2);
    const beat = pulses.ground; // decayed by <Ground/>
    const base = active ? 0.45 : 0.14;
    if (glow.current) glow.current.emissiveIntensity = base + chord * 0.9 + beat * (mode === 'city' ? 0.25 : 0.1);
    if (halo.current) halo.current.opacity = 0.06 + chord * 0.12 + (active ? 0.05 : 0);
    lampRef.current.color.copy(lampColor).multiplyScalar(0.55 + beat * 0.45);
  });

  if (mode === 'city') {
    return (
      <group ref={ref}>
        <mesh position={[0, -0.06, 0]} receiveShadow>
          <boxGeometry args={[layout.width, 0.12, layout.depth]} />
          <meshStandardMaterial ref={glow} color={PALETTE.navy} emissive={color} emissiveIntensity={0.2} roughness={0.8} />
          <Edges color={color} />
        </mesh>
        {/* Streetlights on the block corners: they pulse with the kick drum. */}
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([sx, sz]) => (
          <group key={`${sx}${sz}`} position={[(sx * layout.width) / 2 - sx * 0.12, 0, (sz * layout.depth) / 2 - sz * 0.12]}>
            <mesh position={[0, 0.35, 0]} material={street.pole}>
              <cylinderGeometry args={[0.018, 0.024, 0.7, 5]} />
            </mesh>
            <mesh position={[0, 0.72, 0]} material={street.lamp}>
              <sphereGeometry args={[0.055, 10, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[layout.width, 32, 24]} />
        <meshStandardMaterial ref={glow} color={color} emissive={color} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[layout.width * (mode === 'tree' ? 1.8 : 2.4), 24, 16]} />
        <meshBasicMaterial ref={halo} color={color} transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}
