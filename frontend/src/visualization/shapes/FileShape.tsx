import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { FileInfo } from '../../model/repoModel';
import type { ViewMode } from '../../types';
import type { FileLayout } from '../layouts';
import { livePositions, pulses, readDecay } from '../pulseBus';
import { getWindowTexture, shapeFor } from './geometry';

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
  onHover: (id: string | null, x: number, y: number) => void;
}

const DARK = new THREE.Color('#0b1226');
const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

/** One file. Its geometry depends on its role (source, module, config, test, docs) and the view mode. */
export function FileShape({ file, layout, mode, color, metric, emphasis, onSelect, onHover }: Props) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const spinners = useRef(new Set<THREE.Mesh>());
  const [hovered, setHovered] = useState(false);
  const pos = useRef(new THREE.Vector3(...layout.pos));
  const appear = useRef(0);
  const lastMode = useRef(mode);
  const phase = useMemo(() => (file.id.length * 13.7) % (Math.PI * 2), [file.id]);

  const h = layout.height;
  const s = layout.size;
  const footprint = layout.footprint;
  const recipe = useMemo(() => shapeFor(file.kind, mode, h, s, footprint), [file.kind, mode, h, s, footprint]);
  useEffect(() => () => recipe.parts.forEach((p) => p.geometry.dispose()), [recipe]);

  // Two materials per file: a body (windowed façade in City) and a solid accent glow.
  const materials = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({
      roughness: mode === 'city' ? 0.55 : 0.35,
      metalness: mode === 'city' ? 0.5 : 0.3,
      flatShading: mode === 'galaxy' && (file.kind === 'source' || file.kind === 'config'),
      emissiveMap: mode === 'city' ? getWindowTexture() : null,
      toneMapped: false,
    });
    const accent = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.2, toneMapped: false });
    return { body, accent };
  }, [mode, file.kind]);
  const matRef = useRef(materials);
  useEffect(() => {
    matRef.current = materials;
    return () => {
      materials.body.dispose();
      materials.accent.dispose();
    };
  }, [materials]);

  useFrame((state, delta) => {
    if (!outer.current || !inner.current) return;
    const t = state.clock.elapsedTime;
    let target = tmpVec.set(...layout.pos);
    if (layout.orbit) {
      // Galaxy: slow Kepler-ish orbit around the directory's star.
      const o = layout.orbit;
      const a = o.angle + t * (0.05 / Math.sqrt(o.radius));
      target = tmpVec.set(o.center[0] + Math.cos(a) * o.radius, o.center[1] + o.y, o.center[2] + Math.sin(a) * o.radius);
    } else if (mode === 'tree') {
      // Tree: leaves sway gently in a breeze.
      target.y += Math.sin(t * 0.9 + phase) * 0.05;
      target.x += Math.sin(t * 0.6 + phase * 2) * 0.04;
    }
    pos.current.lerp(target, 1 - Math.exp(-delta * 2.5));
    outer.current.position.copy(pos.current);
    livePositions.set(file.id, [pos.current.x, pos.current.y + recipe.anchorY, pos.current.z]);

    // Grow in on first appearance / mode switch.
    if (lastMode.current !== mode) {
      lastMode.current = mode;
      appear.current = 0.2;
    }
    appear.current = Math.min(1, appear.current + delta * 1.8);
    const grow = 1 - Math.pow(1 - appear.current, 3);

    const pulse = readDecay(pulses.node, file.id, delta, 3);
    const scale = grow * (1 + pulse * (mode === 'city' ? 0.12 : 0.28) + (emphasis === 'selected' ? 0.1 : 0) + (hovered ? 0.05 : 0));
    inner.current.scale.lerp(tmpVec.set(scale, scale, scale), 1 - Math.exp(-delta * 12));
    for (const sp of spinners.current) sp.rotation.z += delta * (0.3 + file.concurrency * 0.08);

    const dim = emphasis === 'dim';
    const softness = file.kind === 'docs' ? 0.6 : 1;
    const baseGlow = (0.12 + metric * 0.55) * softness * (file.analyzed ? 1 : 0.35);
    const extra = (emphasis === 'selected' ? 0.9 : emphasis === 'related' ? 0.4 : 0) + (hovered ? 0.3 : 0);
    const glow = (dim ? baseGlow * 0.15 : baseGlow) + pulse * 1.6 + extra;
    const { body, accent } = matRef.current;

    // City façades: dark walls, windows lit in the metric colour (they flash when the note plays).
    // Elsewhere: a darker body with an emissive glow.
    tmpColor.copy(color).lerp(DARK, dim ? 0.9 : mode === 'city' ? 0.8 : 0.45);
    body.color.copy(tmpColor);
    body.emissive.copy(color);
    body.emissiveIntensity = mode === 'city' ? glow * 2.2 + 0.25 : glow;
    accent.color.copy(color).lerp(DARK, dim ? 0.8 : 0.2);
    accent.emissive.copy(color);
    accent.emissiveIntensity = dim ? 0.1 : glow * 1.2 + 0.25;
    for (const m of [body, accent]) {
      m.opacity = dim ? 0.35 : 1;
      m.transparent = dim;
    }
  });

  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect(file.id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = 'pointer';
      onHover(file.id, e.nativeEvent.clientX, e.nativeEvent.clientY);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => onHover(file.id, e.nativeEvent.clientX, e.nativeEvent.clientY),
    onPointerOut: () => {
      setHovered(false);
      document.body.style.cursor = '';
      onHover(null, 0, 0);
    },
  };

  return (
    <group ref={outer}>
      <group ref={inner} rotation={layout.rot} {...handlers}>
        {recipe.parts.map((p, i) => (
          <mesh
            key={i}
            ref={(m) => {
              if (!m || !p.spin) return;
              const set = spinners.current;
              set.add(m);
              return () => void set.delete(m);
            }}
            geometry={p.geometry}
            material={p.mat === 'body' ? materials.body : materials.accent}
            position={p.position}
            rotation={p.rotation}
            scale={p.scale}
          />
        ))}
      </group>
    </group>
  );
}
