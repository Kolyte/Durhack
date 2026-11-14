import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { RepoModel } from '../model/repoModel';
import type { MetricOverlay, ViewMode } from '../types';
import { CameraRig, type TourState } from './CameraRig';
import { Ground } from './Ground';
import { LabelProjector } from './HubLabels';
import type { Layout } from './layouts';
import { metricValue, PALETTE, rampColor, ROLE_TINT } from './palette';
import { DependencyCable } from './shapes/DependencyCable';
import { DirectoryHub } from './shapes/DirectoryHub';
import { FileShape } from './shapes/FileShape';
import { TreeBranches } from './shapes/TreeBranches';

interface Props {
  model: RepoModel;
  layout: Layout;
  mode: ViewMode;
  overlay: MetricOverlay;
  selectedId: string | null;
  activeGroup: string | null;
  tour: TourState;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null, x: number, y: number) => void;
  onTourInterrupt: () => void;
}

export function CodeSculpture({ model, layout, mode, overlay, selectedId, activeGroup, tour, onSelect, onHover, onTourInterrupt }: Props) {
  const selected = selectedId ? model.files.get(selectedId) : undefined;
  const related = useMemo(
    () => new Set(selected ? [...selected.deps, ...selected.dependents] : []),
    [selected],
  );

  const colors = useMemo(() => {
    const out = new Map<string, { color: THREE.Color; metric: number }>();
    for (const f of model.files.values()) {
      const metric = metricValue(f, overlay, model);
      const tint = overlay === 'complexity' ? ROLE_TINT[f.kind] : undefined;
      out.set(f.id, { color: tint ? new THREE.Color(tint) : rampColor(metric), metric });
    }
    return out;
  }, [model, overlay]);

  return (
    <Canvas
      camera={{ position: [14, 12, 18], fov: 48, near: 0.1, far: 600 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => onSelect(null)}
      style={{ background: PALETTE.bg }}
    >
      <color attach="background" args={[PALETTE.bg]} />
      <fog attach="fog" args={[PALETTE.bg, layout.radius * 1.2, layout.radius * 4.5]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#7dd3fc', '#1e1b4b', 0.35]} />
      <pointLight position={[layout.radius, layout.radius, layout.radius]} intensity={60} distance={layout.radius * 5} color={PALETTE.teal} />
      <pointLight position={[-layout.radius, layout.radius * 0.6, -layout.radius]} intensity={45} distance={layout.radius * 5} color={PALETTE.pink} />

      <Ground mode={mode} radius={layout.radius} />
      {mode === 'tree' && <TreeBranches key={layout.branches.length} branches={layout.branches} />}

      {model.groups.map((g) => {
        const h = layout.hubs.get(g.key);
        return h ? (
          <DirectoryHub
            key={g.key}
            group={g}
            layout={h}
            mode={mode}
            active={g.key === activeGroup || g.key === selected?.group}
          />
        ) : null;
      })}

      {[...model.files.values()].map((f) => {
        const l = layout.files.get(f.id);
        const c = colors.get(f.id);
        if (!l || !c) return null;
        const emphasis = !selected
          ? 'normal'
          : f.id === selected.id
            ? 'selected'
            : related.has(f.id)
              ? 'related'
              : 'dim';
        return (
          <FileShape key={f.id} file={f} layout={l} mode={mode} color={c.color} metric={c.metric} emphasis={emphasis} onSelect={onSelect} onHover={onHover} />
        );
      })}

      {model.edges.map((e) => {
        const touches = !!selected && (e.sourceId === selected.id || e.targetId === selected.id);
        return (
          <DependencyCable
            key={`${e.sourceId}->${e.targetId}`}
            sourceId={e.sourceId}
            targetId={e.targetId}
            mode={mode}
            highlight={touches}
            dimmed={!!selected && !touches}
          />
        );
      })}

      <LabelProjector layout={layout} mode={mode} />
      <CameraRig layout={layout} tour={tour} selectedId={selectedId} onInterrupt={onTourInterrupt} />
      <EffectComposer>
        <Bloom intensity={0.75} luminanceThreshold={0.55} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette offset={0.25} darkness={0.65} />
      </EffectComposer>
    </Canvas>
  );
}
