import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { FileInfo } from '../../model/repoModel';
import type { ViewMode } from '../../types';
import type { FileLayout } from '../layouts';
import { livePositions, pulses, readDecay } from '../pulseBus';
import { complexityLevel } from '../../audio/composer';
import { bodyMapFor, getWhiteTexture, shapeFor } from './geometry';
import { createGlowMaterial } from './glow';
import type { SkinDef, StyleId } from '../../cosmetics/catalog';
import { windowTexture } from '../../cosmetics/windows';

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
  /** Code City look from the shop. */
  skin: SkinDef;
  style: StyleId;
}

const DARK = new THREE.Color('#0b1226');
// Explicit defaults: React Three Fiber keeps a previous value when a prop disappears, so a part that
// had a rotation/offset/scale in one view must be reset explicitly in the next.
const ORIGIN: [number, number, number] = [0, 0, 0];
const UNIT: [number, number, number] = [1, 1, 1];
const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

/** One file. Its geometry depends on its role (source, module, config, test, docs) and the view mode. */
export const FileShape = memo(function FileShape({ file, layout, mode, color, metric, emphasis, onSelect, onHover, skin, style }: Props) {
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
  // Building style follows complexity (bucketed so it doesn't rebuild on tiny changes) and concurrency.
  const cxBucket = Math.round(complexityLevel(file.complexity) * 8) / 8;
  const concurrent = file.concurrency > 0;
  const recipe = useMemo(
    () => shapeFor(file.kind, mode, h, s, footprint, { complexity: cxBucket, concurrent }, style),
    [file.kind, mode, h, s, footprint, cxBucket, concurrent, style],
  );
  useEffect(() => () => recipe.parts.forEach((p) => p.geometry.dispose()), [recipe]);

  // Two materials per file (a body and a solid accent glow), created once and kept for the file's
  // whole life. Views only swap the emissive texture and surface values: the shader features stay
  // identical, so three.js never has to recompile shaders when you switch views (that was the main
  // cause of freezes and audio stutter).
  const materials = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ emissiveMap: getWhiteTexture(), toneMapped: false }),
      accent: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.2, toneMapped: false }),
      glow: createGlowMaterial(),
    }),
    [],
  );
  useEffect(() => {
    const { body } = materials;
    body.emissiveMap = mode === 'city' ? windowTexture(skin.windows) : (bodyMapFor(file.kind, mode, cxBucket) ?? getWhiteTexture());
    body.roughness = mode === 'city' ? skin.roughness : mode === 'galaxy' ? 0.75 : 0.45;
    body.metalness = mode === 'city' ? skin.metalness : mode === 'galaxy' ? 0.05 : 0.2;
  }, [materials, mode, file.kind, cxBucket, skin]);
  const wall = useMemo(() => (skin.wall ? new THREE.Color(skin.wall) : null), [skin]);
  const matRef = useRef(materials);
  useEffect(() => {
    matRef.current = materials;
    return () => {
      materials.body.dispose();
      materials.accent.dispose();
      materials.glow.dispose();
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
    let live = livePositions.get(file.id);
    if (!live) livePositions.set(file.id, (live = [0, 0, 0]));
    live[0] = pos.current.x;
    live[1] = pos.current.y + recipe.anchorY;
    live[2] = pos.current.z;

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
    const { body, accent, glow: halo } = matRef.current;

    // City façades: dark walls, windows lit in the metric colour (they flash when the note plays).
    // Elsewhere: a darker body with an emissive glow.
    const city = mode === 'city';
    if (city && wall) tmpColor.copy(wall).lerp(DARK, dim ? 0.85 : 0);
    else tmpColor.copy(color).lerp(DARK, dim ? 0.9 : city ? 0.8 : 0.45);
    body.color.copy(tmpColor);
    body.emissive.copy(color);
    body.emissiveIntensity = city ? (glow * 2.2 + 0.25) * skin.glow : glow;
    accent.color.copy(color).lerp(DARK, dim ? 0.8 : 0.2);
    accent.emissive.copy(color);
    accent.emissiveIntensity = dim ? 0.1 : glow * 1.2 + 0.25;
    halo.uniforms.uColor.value.copy(color);
    halo.uniforms.uIntensity.value = dim ? 0.15 : 0.55 + pulse * 1.2 + extra * 0.6;
    // (Dimming is done with colour only: toggling transparency would force a shader recompile.)
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
      <group ref={inner} rotation={layout.rot ?? ORIGIN} {...handlers}>
        {recipe.parts.map((p, i) => (
          <mesh
            key={`${mode}-${file.kind}-${i}`}
            ref={(m) => {
              if (!m || !p.spin) return;
              const set = spinners.current;
              set.add(m);
              return () => void set.delete(m);
            }}
            geometry={p.geometry}
            material={materials[p.mat]}
            position={p.position ?? ORIGIN}
            rotation={p.rotation ?? ORIGIN}
            scale={p.scale ?? UNIT}
          />
        ))}
      </group>
    </group>
  );
});
