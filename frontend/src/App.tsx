import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine, engineStore } from './audio/AudioEngine';
import { FileInspector } from './components/FileInspector';
import { MetricsPanel } from './components/MetricsPanel';
import { PlaybackControls } from './components/PlaybackControls';
import { RepoInput } from './components/RepoInput';
import { ViewControls } from './components/ViewControls';
import { computeCodeDna } from './model/codeDna';
import { buildRepoModel } from './model/repoModel';
import { useStore } from './state/store';
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
  const engine = useStore(engineStore);

  const model = useMemo(() => buildRepoModel(nodes, edges), [nodes, edges]);
  const dna = useMemo(() => computeCodeDna(model, meta), [model, meta]);
  // Layout only reacts to modularity in coarse steps so clusters don't shuffle while edges stream in.
  const modularityStep = Math.round(dna.modularity * 4) / 4;
  const layout = useMemo(
    () => computeLayout(model, mode, { ...dna, modularity: modularityStep }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, mode, modularityStep],
  );

  useEffect(() => audioEngine.setModel(model, dna), [model, dna]);

  // When analysis finishes, switch from the "listening" intro to the full composition.
  const composedFor = useRef<string | null>(null);
  useEffect(() => {
    if (phase === 'ready' && meta && composedFor.current !== meta.repoName && model.files.size > 0) {
      composedFor.current = meta.repoName;
      audioEngine.loadComposition(model, dna);
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

  const selected = selectedId ? model.files.get(selectedId) : undefined;
  const analysed = nodes.filter((n) => n.analyzed).length;
  const hasRepo = model.files.size > 0;
  const activeGroup = engine.mode === 'composition' ? (engine.sections[engine.sectionIndex]?.groupKey ?? null) : null;

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
          onTourInterrupt={onTourInterrupt}
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
          <p className="hero__hint">Pick a preset above or paste a repo URL, then press Compose. Sound on 🎧</p>
        </div>
      )}

      {hasRepo && <HubLabelLayer groups={model.groups} activeKey={activeGroup ?? selected?.group ?? null} />}

      <RepoInput phase={phase} status={status} progress={nodes.length ? analysed / nodes.length : null} onCompose={onCompose} />

      {hasRepo && (
        <>
          <MetricsPanel dna={dna} meta={meta} />
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
