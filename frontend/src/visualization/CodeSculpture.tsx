import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
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

const WARM_BRANCH: Layout['branches'] = [{ start: [0, -50, 0], end: [0, -49, 0], radius: 0.01, depth: 0 }];

/**
 * Compiles every material in the scene (hidden ones included) in the background as soon as a repo is
 * loaded, using the browser's parallel shader compilation. The first switch to another view is then
 * instant instead of freezing the page (and the music) while shaders compile.
 */
function ShaderWarmup({ token }: { token: string }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const id = window.setTimeout(() => {
      // The scene renders through the bloom pass into an offscreen (linear) buffer, so compile against
      // one too: compiling for the screen would build a different shader variant than the one used.
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
      const previous = gl.getRenderTarget();
      gl.setRenderTarget(target);
      const done = gl.compileAsync(scene, camera);
      gl.setRenderTarget(previous);
      void done
        .catch(() => undefined)
        .finally(() => {
          target.dispose();
          // Some drivers only finish compiling when a program is first used. Touch each program in
          // an idle moment, one at a time, so that cost lands while nothing is happening rather than
          // on your first view switch.
          const programs = [...(gl.info.programs ?? [])] as { getUniforms?: () => unknown }[];
          const idle = (fn: () => void) =>
            typeof window.requestIdleCallback === 'function'
              ? window.requestIdleCallback(fn, { timeout: 1000 })
              : setTimeout(fn, 32);
          const next = () => {
            const prog = programs.shift();
            if (!prog) return;
            prog.getUniforms?.();
            idle(next);
          };
          idle(next);
        });
    }, 300);
    return () => window.clearTimeout(id);
  }, [gl, scene, camera, token]);
  return null;
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
      // Capped pixel ratio + modest MSAA: bloom on a full Retina buffer was the biggest GPU cost.
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        // Querying shader logs forces the driver to finish compiling synchronously; skip it in production.
        gl.debug.checkShaderErrors = import.meta.env.DEV;
      }}
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
      {/* Always mounted (one hidden twig outside the tree view) so the bark shader stays compiled. */}
      <TreeBranches key={mode === 'tree' ? layout.branches.length : 0} branches={mode === 'tree' ? layout.branches : WARM_BRANCH} visible={mode === 'tree'} />
      <ShaderWarmup token={`${model.files.size}-${model.groups.length}`} />

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
      <EffectComposer multisampling={4}>
        <Bloom intensity={0.75} luminanceThreshold={0.55} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette offset={0.25} darkness={0.65} />
      </EffectComposer>
    </Canvas>
  );
}
