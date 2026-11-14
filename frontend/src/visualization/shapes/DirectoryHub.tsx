import { memo, useRef } from 'react';
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
export const DirectoryHub = memo(function DirectoryHub({
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
  const starGlow = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);

  const pos = useRef(new THREE.Vector3(...layout.pos));
  const target = useRef(new THREE.Vector3());
  const color = HUB_COLORS[group.index % HUB_COLORS.length];
  useFrame((_, delta) => {
    target.current.set(...layout.pos);
    pos.current.lerp(target.current, 1 - Math.exp(-delta * 2.5));
    ref.current?.position.copy(pos.current);
    liveHubPositions.set(group.key, [pos.current.x, pos.current.y, pos.current.z]);

    const chord = readDecay(pulses.hub, group.key, delta, 1.2);
    const beat = pulses.ground; // decayed by <Ground/>
    const base = active ? 0.45 : 0.14;
    if (glow.current) glow.current.emissiveIntensity = base + chord * 0.9 + beat * 0.25;
    if (starGlow.current) starGlow.current.emissiveIntensity = base + 0.3 + chord * 0.9 + beat * 0.1;
    if (halo.current) halo.current.opacity = 0.06 + chord * 0.12 + (active ? 0.05 : 0);
  });

  // Both looks stay mounted and are shown/hidden per view, so their shaders are compiled once and
  // switching views never rebuilds them.
  const city = mode === 'city';
  return (
    <group ref={ref}>
      <group visible={city}>
        <mesh position={[0, -0.06, 0]}>
          <boxGeometry args={[layout.width, 0.12, layout.depth]} />
          <meshStandardMaterial ref={glow} color={PALETTE.navy} emissive={color} emissiveIntensity={0.2} roughness={0.8} />
          <Edges color={color} />
        </mesh>
      </group>
      <group visible={!city}>
        <mesh>
          <sphereGeometry args={[layout.width, 32, 24]} />
          <meshStandardMaterial ref={starGlow} color={color} emissive={color} emissiveIntensity={0.5} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[layout.width * (mode === 'tree' ? 1.8 : 2.4), 24, 16]} />
          <meshBasicMaterial ref={halo} color={color} transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
});
