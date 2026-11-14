import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { submitRanking } from './api/rankings';
import { audioEngine, engineStore } from './audio/AudioEngine';
import { FileInspector } from './components/FileInspector';
import { HoverTooltip } from './components/HoverTooltip';
import { hoverStore } from './state/hover';
import { MetricsPanel } from './components/MetricsPanel';
import { PlaybackControls } from './components/PlaybackControls';
import { RepoInput } from './components/RepoInput';
import { ViewControls } from './components/ViewControls';
import { computeCodeDna } from './model/codeDna';
import { buildRepoModel } from './model/repoModel';
import { useStoreSelector } from './state/store';
import { useComposeStream } from './state/useComposeStream';
import type { MetricOverlay, ViewMode } from './types';
import type { TourState } from './visualization/CameraRig';
import { CodeSculpture } from './visualization/CodeSculpture';
import { computeLayout } from './visualization/layouts';
import { HubLabelLayer } from './visualization/HubLabels';

export default function App() {
  const { nodes, edges, meta, phase, status, compose } = useComposeStream();
  const [mode, setMode] = useState<ViewMode>('city');
  const [overlay, setOverlay] = useState<MetricOverlay>('complexity');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tour, setTour] = useState<TourState>('off');
  // Only re-render App when the active directory changes, not on every bar/chord (that blocked audio).
  const activeGroup = useStoreSelector(engineStore, (e) =>
    e.mode === 'composition' ? (e.sections[e.sectionIndex]?.groupKey ?? null) : null,
  );

  const model = useMemo(() => buildRepoModel(nodes, edges), [nodes, edges]);
  const dna = useMemo(() => computeCodeDna(model, meta), [model, meta]);
  // Layout only reacts to modularity in coarse steps so clusters don't shuffle while edges stream in.
  const modularityStep = Math.round(dna.modularity * 4) / 4;
  // The city plan is always computed (cheap) so its scenery can stay mounted while other views show.
  const cityLayout = useMemo(() => computeLayout(model, 'city', null), [model]);
  const otherLayout = useMemo(
    () => (mode === 'city' ? null : computeLayout(model, mode, { ...dna, modularity: modularityStep })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, mode, modularityStep],
  );
  const layout = otherLayout ?? cityLayout;

  useEffect(() => audioEngine.setModel(model, dna), [model, dna]);

  // When analysis finishes, switch from the "listening" intro to the full composition.
  const composedFor = useRef<string | null>(null);
  useEffect(() => {
    if (phase === 'ready' && meta && composedFor.current !== meta.repoName && model.files.size > 0) {
      composedFor.current = meta.repoName;
      audioEngine.loadComposition(model, dna);
      void submitRanking(meta, dna);
    }
  }, [phase, meta, model, dna]);

  const onCompose = useCallback(
    (url: string) => {
      composedFor.current = null;
      setSelectedId(null);
      setTour('off');
      void compose(url);
    },
    [compose],
  );

  const onTour = useCallback(
    async (action: 'start' | 'pause' | 'resume' | 'exit') => {
      if (action === 'start') {
        await audioEngine.unlock();
        if (engineStore.get().mode !== 'composition') audioEngine.loadComposition(model, dna);
        else audioEngine.restartArrangement();
        audioEngine.start();
        setSelectedId(null);
        setTour('running');
      } else if (action === 'pause') setTour('paused');
      else if (action === 'resume') setTour('running');
      else setTour('off');
    },
    [model, dna],
  );
  const onTourInterrupt = useCallback(() => setTour((t) => (t === 'running' ? 'paused' : t)), []);
  const onHover = useCallback((id: string | null, x: number, y: number) => hoverStore.set({ id, x, y }), []);

  // Keyboard shortcuts: Space play/pause · 1/2/3 views · T tour · ←/→ tour sections · Esc deselect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (model.files.size === 0) return;
      const views: Record<string, ViewMode> = { '1': 'city', '2': 'galaxy', '3': 'tree' };
      if (e.key === ' ' && el.tagName !== 'BUTTON') {
        e.preventDefault();
        void audioEngine.togglePlay();
      } else if (views[e.key]) setMode(views[e.key]);
      else if (e.key === 't' || e.key === 'T') {
        if (tour === 'off') void onTour('start');
        else onTour(tour === 'running' ? 'pause' : 'resume');
      } else if (e.key === 'ArrowRight' && tour !== 'off') audioEngine.jumpToSection(engineStore.get().sectionIndex + 1);
      else if (e.key === 'ArrowLeft' && tour !== 'off') audioEngine.jumpToSection(engineStore.get().sectionIndex - 1);
      else if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [model.files.size, tour, onTour]);

  // Opened from a leaderboard / shared link (?repo=owner/name): offer a one-click start.
  // Audio needs a user gesture, so the composition can't start by itself on page load.
  const [linkedRepo] = useState(() => new URLSearchParams(window.location.search).get('repo'));

  const selected = selectedId ? model.files.get(selectedId) : undefined;
  const analysed = nodes.filter((n) => n.analyzed).length;
  const hasRepo = model.files.size > 0;

  return (
    <div className="app">
      {hasRepo ? (
        <CodeSculpture
          model={model}
          layout={layout}
          mode={mode}
          overlay={overlay}
          selectedId={selectedId}
          activeGroup={activeGroup}
          tour={tour}
          onSelect={setSelectedId}
          onHover={onHover}
          onTourInterrupt={onTourInterrupt}
          cityPlan={cityLayout.city}
        />
      ) : (
        <div className="hero">
          <h1>
            Hear your code<span className="hero__accent">.</span>
          </h1>
          <p>
            CodeFugue turns any public GitHub repository into a 3D architecture you can explore and an ambient
            composition generated from its structure: directories become instruments, imports become melodies,
            concurrency becomes rhythm.
          </p>
          {linkedRepo && phase === 'idle' ? (
            <button
              className="btn btn--primary hero__cta"
              onClick={() => onCompose(linkedRepo.startsWith('http') ? linkedRepo : `https://github.com/${linkedRepo}`)}
            >
              ▶ Compose {linkedRepo.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
            </button>
          ) : (
            <p className="hero__hint">Pick a preset above or paste a repo URL, then press Compose. Sound on 🎧</p>
          )}
        </div>
      )}

      {hasRepo && <HubLabelLayer groups={model.groups} activeKey={activeGroup ?? selected?.group ?? null} />}

      <RepoInput phase={phase} status={status} progress={nodes.length ? analysed / nodes.length : null} onCompose={onCompose} />

      {hasRepo && (
        <>
          <MetricsPanel dna={dna} meta={meta} />
          <HoverTooltip model={model} />
          {selected && (
            <FileInspector file={selected} model={model} onSelect={setSelectedId} onClose={() => setSelectedId(null)} />
          )}
          <div className="bottom">
            <ViewControls
              mode={mode}
              overlay={overlay}
              tour={tour}
              canTour={phase === 'ready'}
              onMode={setMode}
              onOverlay={setOverlay}
              onTour={onTour}
            />
            <PlaybackControls canPlay={hasRepo} />
          </div>
        </>
      )}
    </div>
  );
}
