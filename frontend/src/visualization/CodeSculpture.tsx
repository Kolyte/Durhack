import { useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { RepoModel } from '../model/repoModel';
import type { MetricOverlay, ViewMode } from '../types';
import { isTouchDevice } from '../state/useMediaQuery';
import { CameraRig, type TourState } from './CameraRig';
import { getWindowTexture } from './shapes/geometry';
import { CityScenery } from './CityScenery';
import { Ground } from './Ground';
import { Starfield } from './Starfield';
import { GalaxyWorld } from './worlds/GalaxyWorld';
import { TreeWorld } from './worlds/TreeWorld';
import { CityWorld } from './worlds/CityWorld';
import { skinDef, styleId, worldDef, type SkinDef } from '../cosmetics/catalog';
import { windowTexture } from '../cosmetics/windows';
import { activeLook, shopStore } from '../state/shop';
import { historyStore } from '../state/history';
import { useStoreSelector } from '../state/store';
import { ShootingStars } from './ShootingStars';
import { LabelProjector } from './HubLabels';
import type { CityPlan, Layout } from './layouts';
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
  /** The city's streets/parks/river, kept mounted (hidden) in other views so switching back is instant. */
  cityPlan: CityPlan | undefined;
}

// Phones and tablets: fewer background stars.
const LOW_POWER = isTouchDevice();

/**
 * Render quality steps, lowest first. We start at the best step this device is allowed and only step
 * down if the frame rate actually drops (and back up when it recovers). Phones have 3x screens, so a
 * fixed low pixel ratio with no anti-aliasing looked blurry and jagged there; most phones handle 2x
 * with MSAA fine.
 */
const QUALITY = [
  { dpr: 1, msaa: 0 },
  { dpr: 1.25, msaa: 0 },
  { dpr: 1.5, msaa: 2 },
  { dpr: 1.5, msaa: 4 },
  { dpr: 2, msaa: 4 },
] as const;
const deviceDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
// Desktops keep their previous ceiling (1.5x): big screens at 2x with bloom cost a lot of GPU.
// Touch devices may go to 2x, which is where their dense screens look sharp.
const MAX_QUALITY = LOW_POWER && deviceDpr >= 2 ? QUALITY.length - 1 : 3;

/** Maps 0–1 onto a list of colours (a skin's own ramp). */
function rampFrom(colors: THREE.Color[], t: number): THREE.Color {
  const x = Math.max(0, Math.min(1, t)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(x));
  return colors[i].clone().lerp(colors[i + 1], x - i);
}

/** Animated skins (the Matrix code rain scrolls down the façades). */
function SkinAnimator({ skin }: { skin: SkinDef }) {
  useFrame((_, delta) => {
    if (skin.scroll) windowTexture(skin.windows).offset.y += delta * skin.scroll;
  });
  return null;
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

export function CodeSculpture({ model, layout, mode, overlay, selectedId, activeGroup, tour, onSelect, onHover, onTourInterrupt, cityPlan }: Props) {
  const selected = selectedId ? model.files.get(selectedId) : undefined;
  const related = useMemo(
    () => new Set(selected ? [...selected.deps, ...selected.dependents] : []),
    [selected],
  );

  // The look from the shop (saved, or being tried on). Skins, styles and worlds apply to Code City.
  const skinId = useStoreSelector(shopStore, (s) => activeLook(s).skin);
  const style = styleId(useStoreSelector(shopStore, (s) => activeLook(s).style));
  const worldId = useStoreSelector(shopStore, (s) => activeLook(s).world);
  const skin = skinDef(skinId);
  // Cables are hidden during the time-lapse (their ends may not exist yet).
  const historyOn = useStoreSelector(historyStore, (s) => s.open && !!s.data);
  const world = worldDef(worldId);
  const city = mode === 'city';
  const ramp = city ? skin.ramp : null;

  const colors = useMemo(() => {
    const out = new Map<string, { color: THREE.Color; metric: number }>();
    const custom = ramp?.map((c) => new THREE.Color(c));
    for (const f of model.files.values()) {
      const metric = metricValue(f, overlay, model);
      const tint = !custom && overlay === 'complexity' ? ROLE_TINT[f.kind] : undefined;
      out.set(f.id, { color: tint ? new THREE.Color(tint) : custom ? rampFrom(custom, metric) : rampColor(metric), metric });
    }
    return out;
  }, [model, overlay, ramp]);
  const bg = city ? world.background : PALETTE.bg;
  const fogColor = city ? world.fog : PALETTE.bg;

  const [quality, setQuality] = useState(MAX_QUALITY);
  const q = QUALITY[quality];

  return (
    <Canvas
      camera={{ position: [14, 12, 18], fov: 48, near: 0.1, far: 600 }}
      // Pixel ratio and MSAA adapt to the frame rate (see QUALITY). The post-processing pass does the
      // anti-aliasing, so the default framebuffer doesn't need its own.
      dpr={Math.min(q.dpr, Math.max(1, deviceDpr))}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        // Querying shader logs forces the driver to finish compiling synchronously; skip it in production.
        gl.debug.checkShaderErrors = import.meta.env.DEV;
        // Sharp building windows at grazing angles (the usual phone viewing angle).
        getWindowTexture().anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      }}
      onPointerMissed={() => onSelect(null)}
      style={{ background: bg }}
    >
      <PerformanceMonitor
        flipflops={4}
        onDecline={() => setQuality((v) => Math.max(0, v - 1))}
        onIncline={() => setQuality((v) => Math.min(MAX_QUALITY, v + 1))}
      />
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[fogColor, layout.radius * 1.2, layout.radius * (city && world.sky ? 6 : 4.5)]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#7dd3fc', '#1e1b4b', 0.35]} />
      <pointLight position={[layout.radius, layout.radius, layout.radius]} intensity={60} distance={layout.radius * 5} color={PALETTE.teal} />
      <pointLight position={[-layout.radius, layout.radius * 0.6, -layout.radius]} intensity={45} distance={layout.radius * 5} color={PALETTE.pink} />

      <group visible={!city || world.stars}>
        <Starfield count={LOW_POWER ? 5000 : 12000} />
      </group>
      <CityWorld world={world} visible={city} radius={layout.mode === 'city' ? layout.radius : 12} lowPower={LOW_POWER} />
      <SkinAnimator skin={skin} />
      <ShootingStars />
      <Ground mode={mode} radius={layout.radius} />
      <CityScenery plan={cityPlan} visible={mode === 'city'} world={world} />
      <GalaxyWorld visible={mode === 'galaxy'} radius={layout.mode === 'galaxy' ? layout.radius : 12} lowPower={LOW_POWER} />
      <TreeWorld visible={mode === 'tree'} radius={layout.mode === 'tree' ? layout.radius : 10} height={layout.mode === 'tree' ? layout.center[1] * 2 : 8} lowPower={LOW_POWER} />
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
          <FileShape
            key={f.id}
            file={f}
            layout={l}
            mode={mode}
            color={c.color}
            metric={c.metric}
            emphasis={emphasis}
            onSelect={onSelect}
            onHover={onHover}
            skin={skin}
            style={style}
          />
        );
      })}

      {!historyOn && model.edges.map((e) => {
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
      <EffectComposer multisampling={q.msaa}>
        <Bloom intensity={0.75} luminanceThreshold={0.55} luminanceSmoothing={0.3} mipmapBlur />
        <Vignette offset={0.25} darkness={0.65} />
      </EffectComposer>
    </Canvas>
  );
}
