import { memo, useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { ViewMode } from '../../types';
import { PALETTE } from '../palette';
import { edgeKey, livePositions, pulses } from '../pulseBus';

const SEGMENTS = 24;
const TEAL = new THREE.Color(PALETTE.teal);
const LAVENDER = new THREE.Color(PALETTE.lavender);
const start = new THREE.Vector3();
const end = new THREE.Vector3();
const mid = new THREE.Vector3();
const p = new THREE.Vector3();

/**
 * An import, drawn as a fat curved line. It follows its files as they move, and a light travels along
 * it when the melody follows the import.
 *
 * Built directly on three's Line2 (not drei's <Line>): one geometry and one material for the cable's
 * whole life, with points rewritten in place. drei's component disposed its material whenever the
 * points changed, which forced a shader recompile on every view switch.
 */
export const DependencyCable = memo(function DependencyCable({
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
  const [obj] = useState(() => {
    const geometry = new LineGeometry();
    geometry.setPositions(new Float32Array((SEGMENTS + 1) * 3));
    const material = new LineMaterial({ color: LAVENDER, linewidth: 1, transparent: true, opacity: 0.22, depthWrite: false });
    const line = new Line2(geometry, material);
    line.frustumCulled = false;
    return { geometry, material, line, curve: new THREE.QuadraticBezierCurve3() };
  });
  useEffect(
    () => () => {
      obj.geometry.dispose();
      obj.material.dispose();
    },
    [obj],
  );

  const spark = useRef<THREE.Mesh>(null);
  const keys = useRef([edgeKey(sourceId, targetId), edgeKey(targetId, sourceId)]);
  const baseOpacity = highlight ? 0.9 : dimmed ? 0.05 : 0.22;
  useEffect(() => {
    obj.material.color.copy(highlight ? TEAL : LAVENDER);
    obj.material.linewidth = highlight ? 2 : 1;
  }, [obj, highlight]);

  // Only rewrite the points when an end has moved (static in City/Tree once settled).
  const last = useRef<number[]>([NaN, NaN, NaN, NaN, NaN, NaN]);
  const lastMode = useRef(mode);

  useFrame((state) => {
    obj.material.resolution.set(state.size.width, state.size.height);
    const a = livePositions.get(sourceId);
    const b = livePositions.get(targetId);
    if (!a || !b) return;
    const l = last.current;
    const moved =
      Number.isNaN(l[0]) ||
      lastMode.current !== mode ||
      Math.abs(l[0] - a[0]) +
        Math.abs(l[1] - a[1]) +
        Math.abs(l[2] - a[2]) +
        Math.abs(l[3] - b[0]) +
        Math.abs(l[4] - b[1]) +
        Math.abs(l[5] - b[2]) >
        0.01;
    const { curve } = obj;
    if (moved) {
      l.splice(0, 6, a[0], a[1], a[2], b[0], b[1], b[2]);
      lastMode.current = mode;
      start.set(a[0], a[1], a[2]);
      end.set(b[0], b[1], b[2]);
      const dist = start.distanceTo(end);
      mid.addVectors(start, end).multiplyScalar(0.5);
      mid.y += mode === 'city' ? 1 + dist * 0.25 : dist * 0.15;
      curve.v0.copy(start);
      curve.v1.copy(mid);
      curve.v2.copy(end);
      // LineGeometry stores each segment as [start xyz, end xyz] in one interleaved buffer.
      const attr = obj.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
      const arr = attr.data.array as Float32Array;
      for (let i = 0; i <= SEGMENTS; i++) {
        curve.getPoint(i / SEGMENTS, p);
        if (i < SEGMENTS) {
          arr[i * 6] = p.x;
          arr[i * 6 + 1] = p.y;
          arr[i * 6 + 2] = p.z;
        }
        if (i > 0) {
          arr[(i - 1) * 6 + 3] = p.x;
          arr[(i - 1) * 6 + 4] = p.y;
          arr[(i - 1) * 6 + 5] = p.z;
        }
      }
      attr.data.needsUpdate = true;
    }

    // Travelling light (in either direction) when the melody moves along this import.
    let t = -1;
    for (let k = 0; k < 2; k++) {
      const tr = pulses.travel.get(keys.current[k]);
      if (!tr) continue;
      const prog = (performance.now() - tr.start) / tr.dur;
      if (prog > 1.2) pulses.travel.delete(keys.current[k]);
      else if (prog >= 0 && prog <= 1) t = k === 0 ? prog : 1 - prog;
    }
    if (spark.current) {
      spark.current.visible = t >= 0;
      if (t >= 0) curve.getPoint(t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, spark.current.position);
    }
    obj.material.opacity = t >= 0 ? Math.max(baseOpacity, 0.75) : baseOpacity;
  });

  return (
    <>
      <primitive object={obj.line} />
      <mesh ref={spark} visible={false}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshBasicMaterial color="#e0fbff" toneMapped={false} />
      </mesh>
    </>
  );
});
