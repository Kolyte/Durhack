import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { submitRanking } from './api/rankings';
import { audioEngine, engineStore } from './audio/AudioEngine';
import { FileInspector } from './components/FileInspector';
import { HoverTooltip } from './components/HoverTooltip';
import { hoverStore } from './state/hover';
import { MetricsPanel } from './components/MetricsPanel';
import { PlaybackControls } from './components/PlaybackControls';
import { RepoInput } from './components/RepoInput';
import { TourGuide } from './components/TourGuide';
import { ViewControls } from './components/ViewControls';
import { computeCodeDna } from './model/codeDna';
import { buildRepoModel } from './model/repoModel';
import { useStoreSelector } from './state/store';
import { COMPACT_QUERY, useMediaQuery } from './state/useMediaQuery';
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
  const compact = useMediaQuery(COMPACT_QUERY);
  /** Phones: which control sheet is open above the bottom bar. */
  const [sheet, setSheet] = useState<'view' | 'music' | 'dna' | null>(null);
  const playing = useStoreSelector(engineStore, (e) => e.playing);
  const chord = useStoreSelector(engineStore, (e) => e.chord);
  const sectionTitle = useStoreSelector(engineStore, (e) =>
    e.mode === 'analysing' ? 'Listening to the analysis…' : (e.sections[e.sectionIndex]?.title ?? ''),
  );
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
    (url: string, fromGesture = true) => {
      composedFor.current = null;
      setSelectedId(null);
      setTour('off');
      setSheet(null);
      void compose(url, fromGesture);
    },
    [compose],
  );

  // Opened from the leaderboard or a shared link (?repo=owner/name): compose straight away.
  // Browsers only allow sound after a user gesture, so until the first click we show a hint
  // and the music starts on that click.
  const [needsSound, setNeedsSound] = useState(false);
  const autoComposed = useRef(false);
  useEffect(() => {
    const repo = new URLSearchParams(window.location.search).get('repo');
    if (!repo || autoComposed.current) return;
    autoComposed.current = true;
    onCompose(repo.startsWith('http') ? repo : `https://github.com/${repo}`, false);
    // Some browsers allow audio here (e.g. after interacting with the site); only hint if they don't.
    audioEngine.unlock().then(() => setNeedsSound(false), () => {});
    setTimeout(() => setNeedsSound(!engineStore.get().ready), 400);
  }, [onCompose]);

  useEffect(() => {
    if (!needsSound) return;
    const enable = async () => {
      await audioEngine.unlock();
      if (engineStore.get().mode === 'composition') audioEngine.start();
      setNeedsSound(false);
    };
    window.addEventListener('pointerdown', enable, { once: true });
    window.addEventListener('keydown', enable, { once: true });
    return () => {
      window.removeEventListener('pointerdown', enable);
      window.removeEventListener('keydown', enable);
    };
  }, [needsSound]);

  const onTour = useCallback(
    async (action: 'start' | 'pause' | 'resume' | 'exit') => {
      if (action === 'start') {
        await audioEngine.unlock();
        if (engineStore.get().mode !== 'composition') audioEngine.loadComposition(model, dna);
        else audioEngine.restartArrangement();
        audioEngine.start();
        setSelectedId(null);
        setSheet(null);
        setTour('running');
      } else if (action === 'pause') setTour('paused');
      else if (action === 'resume') {
        // The tour follows the music, so resuming it also restarts the music if it was paused.
        await audioEngine.unlock();
        audioEngine.start();
        setSelectedId(null);
        setTour('running');
      } else setTour('off');
    },
    [model, dna],
  );
  const onTourInterrupt = useCallback(() => setTour((t) => (t === 'running' ? 'paused' : t)), []);

  // Pausing the music freezes the tour on its current stop, so show the tour as paused too.
  useEffect(() => {
    const unsubscribe = engineStore.subscribe(() => {
      if (!engineStore.get().playing) setTour((t) => (t === 'running' ? 'paused' : t));
    });
    return () => void unsubscribe();
  }, []);

  // Inspecting a building mid-tour pauses the tour, so the camera doesn't fly away from it.
  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      setTour((t) => (t === 'running' ? 'paused' : t));
      setSheet(null);
    }
  }, []);
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
      else if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else if (tour !== 'off') void onTour('exit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [model.files.size, tour, onTour, selectedId]);

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
          onSelect={onSelect}
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
            Sonyx turns any public GitHub repository into a 3D architecture you can explore and an ambient
            composition generated from its structure: directories become instruments, imports become melodies,
            concurrency becomes rhythm.
          </p>
          <p className="hero__hint">Pick a preset above or paste a repo URL, then press Compose. Sound on 🎧</p>
        </div>
      )}

      {hasRepo && <HubLabelLayer groups={model.groups} activeKey={activeGroup ?? selected?.group ?? null} />}

      {needsSound && (
        <div className="sound-hint panel" role="status">
          🔊 Click anywhere to turn on the sound
        </div>
      )}

      <RepoInput
        phase={phase}
        status={status}
        progress={nodes.length ? analysed / nodes.length : null}
        onCompose={onCompose}
        collapsible={compact && hasRepo}
        repoName={meta?.repoName}
      />

      {/* One FileInspector for both layouts (on phones the CSS turns it into a bottom sheet). */}
      {hasRepo && (
        <>
          {!compact && <MetricsPanel dna={dna} meta={meta} />}
          <HoverTooltip model={model} />
          {selected && (
            <FileInspector file={selected} model={model} meta={meta} onSelect={setSelectedId} onClose={() => setSelectedId(null)} />
          )}
        </>
      )}

      {hasRepo && !compact && (
        <>
          {!selected && <TourGuide tour={tour} onTour={onTour} />}
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

      {hasRepo && compact && (
        <>
          {selected ? null : sheet ? (
            <div className="sheet panel" role="dialog" aria-label={`${sheet} controls`}>
              <button className="btn btn--icon sheet__close" onClick={() => setSheet(null)} aria-label="Close">
                ✕
              </button>
              {sheet === 'view' && (
                <ViewControls
                  embedded
                  mode={mode}
                  overlay={overlay}
                  tour={tour}
                  canTour={phase === 'ready'}
                  onMode={setMode}
                  onOverlay={setOverlay}
                  onTour={onTour}
                />
              )}
              {sheet === 'music' && <PlaybackControls embedded canPlay={hasRepo} />}
              {sheet === 'dna' && <MetricsPanel embedded dna={dna} meta={meta} />}
            </div>
          ) : (
            <TourGuide tour={tour} onTour={onTour} />
          )}
          <nav className="mobile-bar panel" aria-label="Controls">
            <div className="mobile-bar__row">
              <button
                className="btn btn--round"
                onClick={() => audioEngine.togglePlay()}
                aria-label={playing ? 'Pause music' : 'Play music'}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <div className="now-playing">
                <span className="now-playing__chord">{chord || '—'}</span>
                <span className="now-playing__section">{sectionTitle || 'Idle'}</span>
              </div>
              {tour === 'off' ? (
                <button className="btn btn--accent" disabled={phase !== 'ready'} onClick={() => onTour('start')}>
                  ▶ Tour
                </button>
              ) : (
                <button className="btn" onClick={() => onTour(tour === 'running' ? 'pause' : 'resume')}>
                  {tour === 'running' ? 'Pause tour' : 'Resume tour'}
                </button>
              )}
            </div>
            <div className="segmented mobile-bar__tabs" role="tablist" aria-label="Panels">
              {(
                [
                  ['view', 'View'],
                  ['music', 'Music'],
                  ['dna', 'Code DNA'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={sheet === id}
                  className={`segmented__item${sheet === id ? ' is-on' : ''}`}
                  onClick={() => {
                    setSelectedId(null);
                    setSheet(sheet === id ? null : id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
