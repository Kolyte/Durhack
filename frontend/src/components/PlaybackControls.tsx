import { audioEngine, engineStore } from '../audio/AudioEngine';
import { LAYERS, PRESETS, type LayerId, type PresetId } from '../audio/presets';
import { useStore } from '../state/store';

const LAYER_LABELS: Record<LayerId, string> = { pad: 'Pad', lead: 'Lead', arp: 'Arp', bass: 'Bass', drums: 'Drums' };

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span className="slider__label">
        {label} <span className="slider__value">{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function PlaybackControls({ canPlay }: { canPlay: boolean }) {
  const s = useStore(engineStore);
  const section = s.sections[s.sectionIndex];

  return (
    <section className="dock panel" aria-label="Music controls">
      <div className="dock__row">
        <button
          className="btn btn--round"
          onClick={() => audioEngine.togglePlay()}
          disabled={!canPlay}
          aria-label={s.playing ? 'Pause music' : 'Play music'}
        >
          {s.playing ? '❚❚' : '▶'}
        </button>
        <button className="btn btn--ghost" onClick={() => audioEngine.setMuted(!s.muted)} aria-pressed={s.muted}>
          {s.muted ? 'Unmute' : 'Mute'}
        </button>
        <div className="now-playing">
          <span className="now-playing__chord">
            {s.chord || '—'}
            {s.phase !== 'normal' && <span className={`phase phase--${s.phase}`}>{s.phase === 'drop' ? 'Drop' : 'Breakdown'}</span>}
          </span>
          <span className="now-playing__section">
            {s.mode === 'analysing' ? 'Listening to the analysis…' : section ? section.title : 'Idle'}
          </span>
        </div>
        <div className="segmented segmented--wrap" role="radiogroup" aria-label="Music preset">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={s.preset === id}
              className={`segmented__item${s.preset === id ? ' is-on' : ''}`}
              title={PRESETS[id].description}
              onClick={() => audioEngine.setPreset(id)}
            >
              {PRESETS[id].label}
            </button>
          ))}
        </div>
      </div>
      <div className="dock__row dock__row--sliders">
        <Slider label="Volume" value={s.volume} min={0} max={1} step={0.01} display={`${Math.round(s.volume * 100)}%`} onChange={(v) => audioEngine.setVolume(v)} />
        <Slider label="Tempo" value={s.tempo} min={60} max={130} step={1} display={`${s.tempo} bpm`} onChange={(v) => audioEngine.setTempo(v)} />
        <Slider label="Reverb" value={s.reverb} min={0} max={1} step={0.01} display={`${Math.round(s.reverb * 100)}%`} onChange={(v) => audioEngine.setReverb(v)} />
        <Slider label="Energy" value={s.energy} min={0} max={1} step={0.01} display={`${Math.round(s.energy * 100)}%`} onChange={(v) => audioEngine.setEnergy(v)} />
      </div>
      <div className="dock__row">
        <span className="dock__label">Instruments</span>
        <div className="chips">
          {LAYERS.map((l) => {
            const entered = s.activeLayers.includes(l);
            return (
              <button
                key={l}
                className={`chip chip--toggle${s.layers[l] ? ' is-on' : ''}${entered ? ' is-live' : ''}`}
                aria-pressed={s.layers[l]}
                title={entered ? 'Playing' : 'Joins as the arrangement builds'}
                onClick={() => audioEngine.setLayer(l, !s.layers[l])}
              >
                <span className="chip__dot" aria-hidden />
                {LAYER_LABELS[l]}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
