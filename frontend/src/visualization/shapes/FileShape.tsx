import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FileInfo } from '../../model/repoModel';
import type { ViewMode } from '../../types';
import type { FileLayout } from '../layouts';
import { livePositions, pulses, readDecay } from '../pulseBus';

interface Props {
  file: FileInfo;
  layout: FileLayout;
  mode: ViewMode;
  color: THREE.Color;
  /** 0–1 value of the active metric overlay: drives glow. */
  metric: number;
  /** "dim" when another file is selected and this one is unrelated. */
  emphasis: 'normal' | 'selected' | 'related' | 'dim';
  onSelect: (id: string) => void;
}

const DARK = new THREE.Color('#0b1226');
const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

/** One file. Its geometry depends on its role (source, module, config, test, docs) and the view mode. */
export function FileShape({ file, layout, mode, color, metric, emphasis, onSelect }: Props) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const pos = useRef(new THREE.Vector3(...layout.pos));
  const appear = useRef(0);
  const lastMode = useRef(mode);

  const h = layout.height;
  const s = layout.size;
  const geometry = useMemo(() => shapeFor(file.kind, mode, h, s), [file.kind, mode, h, s]);
  const softness = file.kind === 'docs' ? 0.5 : 1;
  // One material per file, shared by all of its parts and animated imperatively in useFrame.
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.35,
        metalness: 0.35,
        flatShading: file.kind === 'source' || file.kind === 'config',
        toneMapped: false,
      }),
    [file.kind],
  );
  const matRef = useRef(material);
  useEffect(() => {
    matRef.current = material;
    return () => material.dispose();
  }, [material]);

  useFrame((state, delta) => {
    if (!outer.current || !inner.current) return;
    // Galaxy: slow Kepler-ish orbit around the directory's star.
    let target = tmpVec.set(...layout.pos);
    if (layout.orbit) {
      const o = layout.orbit;
      const a = o.angle + state.clock.elapsedTime * (0.05 / Math.sqrt(o.radius));
      target = tmpVec.set(o.center[0] + Math.cos(a) * o.radius, o.center[1] + o.y, o.center[2] + Math.sin(a) * o.radius);
    }
    pos.current.lerp(target, 1 - Math.exp(-delta * 2.5));
    outer.current.position.copy(pos.current);
    const anchorY = mode === 'city' ? (file.kind === 'module' ? h * 0.8 + 0.4 : h) : 0;
    livePositions.set(file.id, [pos.current.x, pos.current.y + anchorY, pos.current.z]);

    // Grow in on first appearance / mode switch.
    if (lastMode.current !== mode) {
      lastMode.current = mode;
      appear.current = 0.2;
    }
    appear.current = Math.min(1, appear.current + delta * 1.8);
    const grow = 1 - Math.pow(1 - appear.current, 3);

    const pulse = readDecay(pulses.node, file.id, delta, 3);
    const scale = grow * (1 + pulse * 0.28 + (emphasis === 'selected' ? 0.12 : 0) + (hovered ? 0.06 : 0));
    inner.current.scale.lerp(tmpVec.set(scale, scale, scale), 1 - Math.exp(-delta * 12));
    if (ring.current) ring.current.rotation.z += delta * (0.3 + file.concurrency * 0.08);

    const dim = emphasis === 'dim';
    const baseGlow = (0.12 + metric * 0.55) * softness * (file.analyzed ? 1 : 0.35);
    const glow =
      (dim ? baseGlow * 0.15 : baseGlow) + pulse * 1.6 + (emphasis === 'selected' ? 0.9 : emphasis === 'related' ? 0.4 : 0) + (hovered ? 0.3 : 0);
    // Body colour is a darker version of the metric colour; emissive glow carries the brightness.
    tmpColor.copy(color).lerp(DARK, dim ? 0.8 : 0.45);
    const m = matRef.current;
    m.color.copy(tmpColor);
    m.emissive.copy(color);
    m.emissiveIntensity = glow;
    m.opacity = dim ? 0.35 : 1;
    m.transparent = dim;
  });

  const handlers = {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(file.id);
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      setHovered(false);
      document.body.style.cursor = '';
    },
  };

  return (
    <group ref={outer}>
      <group ref={inner} {...handlers}>
        {geometry.map((g, i) =>
          g.kind === 'ring' ? (
            <mesh key={i} ref={ring} position={g.position} rotation={g.rotation} material={material}>
              <torusGeometry args={g.args as [number, number, number, number]} />
            </mesh>
          ) : (
            <mesh key={i} position={g.position} rotation={g.rotation} material={material}>
              <Geometry part={g} />
            </mesh>
          ),
        )}
      </group>
    </group>
  );
}

type Part = {
  kind: 'hex' | 'cylinder' | 'sphere' | 'cone' | 'dodeca' | 'ico' | 'octa' | 'torus' | 'ring';
  args: number[];
  position?: [number, number, number];
  rotation?: [number, number, number];
};

function Geometry({ part }: { part: Part }) {
  switch (part.kind) {
    case 'hex':
    case 'cylinder':
      return <cylinderGeometry args={part.args as [number, number, number, number]} />;
    case 'sphere':
      return <sphereGeometry args={part.args as [number, number, number]} />;
    case 'cone':
      return <coneGeometry args={part.args as [number, number, number]} />;
    case 'dodeca':
      return <dodecahedronGeometry args={part.args as [number, number]} />;
    case 'ico':
      return <icosahedronGeometry args={part.args as [number, number]} />;
    case 'octa':
      return <octahedronGeometry args={part.args as [number, number]} />;
    case 'torus':
    case 'ring':
      return <torusGeometry args={part.args as [number, number, number, number]} />;
  }
}

/** Geometry recipe per file role and view. */
function shapeFor(kind: FileInfo['kind'], mode: ViewMode, h: number, s: number): Part[] {
  if (mode === 'city') {
    switch (kind) {
      case 'module':
        return [
          { kind: 'cylinder', args: [0.14, 0.22, h * 0.8, 8], position: [0, h * 0.4, 0] },
          { kind: 'sphere', args: [0.4, 24, 16], position: [0, h * 0.8 + 0.4, 0] },
          { kind: 'ring', args: [0.68, 0.035, 8, 48], position: [0, h * 0.8 + 0.4, 0], rotation: [Math.PI / 2.4, 0, 0] },
        ];
      case 'config':
        return [{ kind: 'cone', args: [0.5, h, 4], position: [0, h / 2, 0], rotation: [0, Math.PI / 4, 0] }];
      case 'test':
        return [
          { kind: 'cylinder', args: [0.52, 0.52, 0.1, 32], position: [0, 0.05, 0] },
          { kind: 'cylinder', args: [0.34, 0.34, 0.1, 32], position: [0, 0.2, 0] },
        ];
      case 'docs':
        return [{ kind: 'dodeca', args: [0.26, 0], position: [0, 0.35, 0] }];
      default:
        return [{ kind: 'hex', args: [0.36, 0.42, h, 6], position: [0, h / 2, 0] }];
    }
  }
  switch (kind) {
    case 'module':
      return [
        { kind: 'sphere', args: [s * 1.15, 24, 16] },
        { kind: 'ring', args: [s * 2, s * 0.08, 8, 48], rotation: [Math.PI / 2.3, 0, 0] },
      ];
    case 'config':
      return [{ kind: 'octa', args: [s, 0] }];
    case 'test':
      return [{ kind: 'torus', args: [s * 1.05, s * 0.28, 10, 32], rotation: [Math.PI / 2, 0, 0] }];
    case 'docs':
      return [{ kind: 'sphere', args: [s * 0.6, 16, 12] }];
    default:
      return [{ kind: 'ico', args: [s, 0] }];
  }
}
