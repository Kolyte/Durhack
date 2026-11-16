import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import type { ViewMode } from '../types';
import { pulses } from './pulseBus';

/** Galaxy: an extra layer of slowly drifting stars. (The tree's floor lives in worlds/TreeWorld.) */
export function Ground({ mode, radius }: { mode: ViewMode; radius: number }) {
  // The kick-drum pulse that city lights, the forest floor and the galaxy core react to decays here.
  useFrame((_, delta) => {
    pulses.ground *= Math.exp(-delta * 6);
  });

  return (
    <group visible={mode === 'galaxy'}>
      <Stars radius={Math.max(60, Math.round(radius / 10) * 40)} depth={40} count={2500} factor={3} saturation={0} fade speed={0.4} />
    </group>
  );
}
