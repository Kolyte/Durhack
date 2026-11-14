import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DirGroup } from '../model/repoModel';
import type { ViewMode } from '../types';
import type { Layout } from './layouts';
import { liveHubPositions } from './pulseBus';

/**
 * Directory labels as plain DOM (under the UI panels), positioned every frame from the 3D scene.
 * Cheaper and more robust than one React root per label.
 */
const elements = new Map<string, HTMLDivElement>();
const v = new THREE.Vector3();

export function HubLabelLayer({ groups, activeKey }: { groups: DirGroup[]; activeKey: string | null }) {
  return (
    <div className="hub-labels" aria-hidden>
      {groups.map((g) => (
        <div
          key={g.key}
          ref={(el) => {
            if (el) elements.set(g.key, el);
            else elements.delete(g.key);
          }}
          className={`hub-label${g.key === activeKey ? ' hub-label--active' : ''}`}
        >
          {g.label}
        </div>
      ))}
    </div>
  );
}

/** Lives inside the <Canvas>: projects each hub to screen space and moves its DOM label. */
export function LabelProjector({ layout, mode }: { layout: Layout; mode: ViewMode }) {
  const { camera, size } = useThree();
  useFrame(() => {
    for (const [key, el] of elements) {
      const p = liveHubPositions.get(key);
      const h = layout.hubs.get(key);
      if (!p || !h) {
        el.style.opacity = '0';
        continue;
      }
      if (mode === 'city') v.set(p[0], p[1] + 0.1, p[2] + h.depth / 2 + 0.25);
      else v.set(p[0], p[1] + h.width + (mode === 'tree' ? 1.6 : 0.7), p[2]);
      v.project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.opacity = visible ? '1' : '0';
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}
