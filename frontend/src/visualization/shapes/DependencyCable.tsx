import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { QuadraticBezierLine } from '@react-three/drei';
import * as THREE from 'three';
import type { ViewMode } from '../../types';
import { PALETTE } from '../palette';
import { edgeKey, livePositions, pulses } from '../pulseBus';

type LineRef = React.ComponentRef<typeof QuadraticBezierLine>;

const start = new THREE.Vector3();
const end = new THREE.Vector3();
const mid = new THREE.Vector3();

/** An import. Follows its files as they move; a light travels along it when the melody follows the import. */
export function DependencyCable({
  sourceId,
  targetId,
  mode,
  highlight,
  dimmed,
}: {
  sourceId: string;
  targetId: string;
  mode: ViewMode;
  highlight: boolean;
  dimmed: boolean;
}) {
  const line = useRef<LineRef>(null);
  const spark = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(), []);
  const keys = useMemo(() => [edgeKey(sourceId, targetId), edgeKey(targetId, sourceId)], [sourceId, targetId]);
  const baseOpacity = highlight ? 0.9 : dimmed ? 0.05 : 0.22;

  useFrame(() => {
    const a = livePositions.get(sourceId);
    const b = livePositions.get(targetId);
    if (!a || !b || !line.current) return;
    start.set(...a);
    end.set(...b);
    const dist = start.distanceTo(end);
    mid.addVectors(start, end).multiplyScalar(0.5);
    mid.y += mode === 'city' ? 1 + dist * 0.25 : dist * 0.15;
    line.current.setPoints(start, end, mid);
    curve.v0.copy(start);
    curve.v1.copy(mid);
    curve.v2.copy(end);

    // Travelling light (in either direction) when the melody moves along this import.
    let t = -1;
    for (let k = 0; k < 2; k++) {
      const tr = pulses.travel.get(keys[k]);
      if (!tr) continue;
      const p = (performance.now() - tr.start) / tr.dur;
      if (p > 1.2) pulses.travel.delete(keys[k]);
      else if (p >= 0 && p <= 1) t = k === 0 ? p : 1 - p;
    }
    // keys[0] is source→target; a travel from target→source runs backwards.
    const material = line.current.material as THREE.Material & { opacity: number };
    if (spark.current) {
      spark.current.visible = t >= 0;
      if (t >= 0) {
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        curve.getPoint(eased, spark.current.position);
      }
    }
    material.opacity = t >= 0 ? Math.max(baseOpacity, 0.75) : baseOpacity;
  });

  return (
    <>
      <QuadraticBezierLine
        ref={line}
        start={[0, 0, 0]}
        end={[0, 0, 0]}
        color={highlight ? PALETTE.teal : PALETTE.lavender}
        lineWidth={highlight ? 2 : 1}
        transparent
        opacity={baseOpacity}
        depthWrite={false}
      />
      <mesh ref={spark} visible={false}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshBasicMaterial color="#e0fbff" toneMapped={false} />
      </mesh>
    </>
  );
}
