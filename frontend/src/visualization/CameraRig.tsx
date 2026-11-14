import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { engineStore, playhead } from '../audio/AudioEngine';
import type { Layout } from './layouts';
import { liveHubPositions, livePositions } from './pulseBus';

export type TourState = 'off' | 'running' | 'paused';

const desiredPos = new THREE.Vector3();
const desiredTarget = new THREE.Vector3();
const tmp = new THREE.Vector3();

/**
 * Orbit controls plus the guided tour. While touring, the camera follows the composition's current
 * section (overview → each directory → the most connected hub), so picture and music move together.
 * Any user drag/zoom pauses the tour.
 */
export function CameraRig({
  layout,
  tour,
  selectedId,
  onInterrupt,
}: {
  layout: Layout;
  tour: TourState;
  selectedId: string | null;
  onInterrupt: () => void;
}) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { camera } = useThree();
  const flyUntil = useRef(0);
  const tourRef = useRef(tour);
  useEffect(() => {
    tourRef.current = tour;
  }, [tour]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const onStart = () => {
      flyUntil.current = 0;
      if (tourRef.current === 'running') onInterrupt();
    };
    c.addEventListener('start', onStart);
    return () => c.removeEventListener('start', onStart);
  }, [onInterrupt]);

  // Selecting a file glides the orbit target to it (once), without taking the camera away from the user.
  useEffect(() => {
    if (selectedId) flyUntil.current = performance.now() + 1400;
  }, [selectedId]);

  // On a new layout (mode switch / new repo) frame the whole scene.
  useEffect(() => {
    const r = layout.radius;
    camera.position.set(r * 0.9, r * 0.75, r * 1.1);
    controls.current?.target.set(...layout.center);
  }, [layout.mode, layout.radius, camera, layout.center]);

  useFrame((state, delta) => {
    const c = controls.current;
    if (!c) return;
    const t = state.clock.elapsedTime;

    if (tour === 'running') {
      const section = engineStore.get().sections[playhead.sectionIndex];
      const hub = section?.groupKey ? liveHubPositions.get(section.groupKey) : undefined;
      const focus = playhead.focusFileId ? livePositions.get(playhead.focusFileId) : undefined;
      const a = t * 0.06;

      if (!section || section.kind === 'overview' || !hub) {
        const r = layout.radius;
        desiredTarget.set(...layout.center);
        desiredPos.set(Math.sin(a) * r * 1.15, r * 0.8, Math.cos(a) * r * 1.15);
      } else if (section.kind === 'directory') {
        const h = layout.hubs.get(section.groupKey!);
        const r = 6 + (h ? Math.max(h.width, h.depth) : 2) * 1.2;
        desiredTarget.set(...hub);
        if (focus) desiredTarget.lerp(tmp.set(...focus), 0.3);
        desiredPos.set(hub[0] + Math.sin(a) * r, hub[1] + r * 0.6, hub[2] + Math.cos(a) * r);
      } else {
        const f = focus ?? hub;
        desiredTarget.set(...f);
        desiredPos.set(f[0] + Math.sin(a) * 7, f[1] + 4.5, f[2] + Math.cos(a) * 7);
      }
      const k = 1 - Math.exp(-delta * 0.7);
      camera.position.lerp(desiredPos, k);
      c.target.lerp(desiredTarget, 1 - Math.exp(-delta * 1.1));
    } else if (selectedId && performance.now() < flyUntil.current) {
      const p = livePositions.get(selectedId);
      if (p) c.target.lerp(tmp.set(...p), 1 - Math.exp(-delta * 3));
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      autoRotate={tour === 'off' && !selectedId}
      autoRotateSpeed={0.35}
      maxPolarAngle={Math.PI * 0.48}
      minDistance={2}
      maxDistance={layout.radius * 4}
    />
  );
}
