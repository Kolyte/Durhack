import type { MetricOverlay, ViewMode } from '../types';
import { OVERLAY_INFO } from '../visualization/palette';
import type { TourState } from '../visualization/CameraRig';

export function ViewControls({
  mode,
  overlay,
  tour,
  canTour,
  onMode,
  onOverlay,
  onTour,
}: {
  mode: ViewMode;
  overlay: MetricOverlay;
  tour: TourState;
  canTour: boolean;
  onMode: (m: ViewMode) => void;
  onOverlay: (o: MetricOverlay) => void;
  onTour: (action: 'start' | 'pause' | 'resume' | 'exit') => void;
}) {
  const info = OVERLAY_INFO[overlay];
  return (
    <section className="view-controls panel" aria-label="View controls">
      <div className="segmented" role="radiogroup" aria-label="Visualisation">
        {(
          [
            ['city', 'Code City'],
            ['galaxy', 'Galaxy'],
            ['tree', 'Code Tree'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="radio" aria-checked={mode === id} className={`segmented__item${mode === id ? ' is-on' : ''}`} onClick={() => onMode(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="overlay">
        <span className="dock__label">Colour by</span>
        <div className="chips">
          {(Object.keys(OVERLAY_INFO) as MetricOverlay[]).map((o) => (
            <button key={o} className={`chip${overlay === o ? ' is-on' : ''}`} aria-pressed={overlay === o} onClick={() => onOverlay(o)}>
              {OVERLAY_INFO[o].label}
            </button>
          ))}
        </div>
        <div className="legend" aria-hidden>
          <span>{info.low}</span>
          <span className="legend__ramp" />
          <span>{info.high}</span>
        </div>
      </div>

      <div className="tour">
        <span className="dock__label">Guided tour</span>
        {tour === 'off' ? (
          <button className="btn btn--accent" disabled={!canTour} onClick={() => onTour('start')}>
            ▶ Start tour
          </button>
        ) : (
          <div className="chips">
            {tour === 'running' ? (
              <button className="chip" onClick={() => onTour('pause')}>
                Pause
              </button>
            ) : (
              <button className="chip is-on" onClick={() => onTour('resume')}>
                Resume
              </button>
            )}
            <button className="chip" onClick={() => onTour('exit')}>
              Exit
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
