import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { ViewMode } from '../types';
import { PALETTE } from './palette';
import { pulses } from './pulseBus';

/** City: a dark ground with a grid that pulses with the kick drum. Galaxy: a slow starfield (stars pulse via hub halos). */
export function Ground({ mode, radius }: { mode: ViewMode; radius: number }) {
  const grid = useRef<THREE.GridHelper>(null);

  useFrame((_, delta) => {
    const p = pulses.ground;
    pulses.ground = p * Math.exp(-delta * 6);
    if (grid.current) {
      const m = grid.current.material as THREE.LineBasicMaterial;
      m.opacity = 0.35 + p * 0.35;
    }
  });

  const size = Math.ceil((radius * 2.6) / 2) * 2;
  // Both looks stay mounted (hidden when not in use) so switching views never recompiles shaders.
  return (
    <group>
      <group visible={mode !== 'galaxy'}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.13, 0]}>
          <circleGeometry args={[size, 64]} />
          <meshStandardMaterial color={mode === 'city' ? '#0a1022' : PALETTE.bg} roughness={1} />
        </mesh>
        {/* Fixed-size grid, scaled per view: changing its args would recreate it (and its shader). */}
        <gridHelper
          ref={grid}
          args={[2, 40, PALETTE.grid, PALETTE.grid]}
          scale={[size, 1, size]}
          position={[0, -0.12, 0]}
          material-transparent
          material-opacity={0.35}
        />
      </group>
      <group visible={mode === 'galaxy'}>
        <Stars radius={Math.max(60, Math.round(radius / 10) * 40)} depth={40} count={2500} factor={3} saturation={0} fade speed={0.4} />
      </group>
    </group>
  );
}
