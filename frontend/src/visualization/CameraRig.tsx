import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { engineStore, playhead } from '../audio/AudioEngine';
import type { Layout } from './layouts';
import { liveHubPositions, livePositions } from './pulseBus';

export type TourState = 'off' | 'running' | 'paused';

const desiredPos = new THREE.Vector3();
const framed = new THREE.Vector3();

/** Viewing direction per view (from target to camera): city from above, tree from the side. */
/** Flat scenes don't fill their bounding sphere, so they can be framed tighter. */
const FIT: Record<Layout['mode'], number> = { city: 0.78, galaxy: 0.85, tree: 1.12 };

const VIEW_DIR: Record<Layout['mode'], [number, number, number]> = {
  city: [0.55, 0.62, 0.7],
  galaxy: [0.5, 0.6, 0.75],
  tree: [0.6, 0.2, 0.85],
};

/** Camera position that fits the bounding sphere in view (rotated `angle` around the vertical axis). */
function framePosition(bounds: Layout['bounds'], mode: Layout['mode'], camera: THREE.Camera, angle: number) {
  const dir = VIEW_DIR[mode];
  const fov = ((camera as THREE.PerspectiveCamera).fov ?? 48) * (Math.PI / 180);
  const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.6;
  // Use the narrower of the vertical/horizontal FOV; UI panels cover part of the screen, hence the margin.
  const half = Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * aspect));
  const dist = (bounds.radius / Math.sin(half)) * FIT[mode];
  framed.set(dir[0], dir[1], dir[2]).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).multiplyScalar(dist);
  return framed.add(tmp.set(...bounds.center));
}
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
  const { bounds } = layout;
  useEffect(() => {
    camera.position.copy(framePosition(bounds, layout.mode, camera, 0));
    controls.current?.target.set(...bounds.center);
    // Only reframe when the view or the scene size meaningfully changes, not on every streamed metric.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.mode, Math.round(bounds.radius), camera]);

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
        desiredTarget.set(...layout.bounds.center);
        desiredPos.copy(framePosition(layout.bounds, layout.mode, camera, a));
      } else if (section.kind === 'directory') {
        const h = layout.hubs.get(section.groupKey!);
        const r = layout.mode === 'tree' ? 11 : 6 + (h ? Math.max(h.width, h.depth) : 2) * 1.2;
        desiredTarget.set(...hub);
        if (focus) desiredTarget.lerp(tmp.set(...focus), 0.3);
        // In the tree, orbit on the outside of the canopy (away from the trunk) so the trunk never blocks the view.
        const outward = layout.mode === 'tree' && Math.hypot(hub[0], hub[2]) > 0.5 ? Math.atan2(hub[0], hub[2]) + Math.sin(a) * 0.6 : a;
        desiredPos.set(hub[0] + Math.sin(outward) * r, hub[1] + r * (layout.mode === 'tree' ? 0.35 : 0.6), hub[2] + Math.cos(outward) * r);
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
      maxDistance={layout.bounds.radius * 6}
    />
  );
}
