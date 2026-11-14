import { audioEngine, engineStore } from '../audio/AudioEngine';
import { useStore } from '../state/store';
import type { TourState } from '../visualization/CameraRig';

type Action = 'pause' | 'resume' | 'exit';

/**
 * On-screen guide for the tour: which stop you are on, how far through it the music is, and
 * touch-friendly controls (prev / next / jump to any stop), so the tour does not depend
 * on a keyboard.
 */
export function TourGuide({ tour, onTour }: { tour: TourState; onTour: (a: Action) => void }) {
  const s = useStore(engineStore);
  const section = s.sections[s.sectionIndex];
  if (tour === 'off' || !section) return null;

  const n = s.sections.length;
  const progress = Math.min(1, (s.barInSection + 1) / Math.max(1, section.bars));
  // Picking a stop while paused means "take me there", so the tour carries on from it.
  const go = (i: number) => {
    audioEngine.jumpToSection(i);
    if (tour === 'paused') onTour('resume');
  };

  return (
    <section className="tour-guide panel" aria-label="Guided tour" aria-live="polite">
      <div className="tour-guide__head">
        <span className="eyebrow">
          Tour · stop {s.sectionIndex + 1} of {n}
          {tour === 'paused' && <span className="tour-guide__paused"> · paused</span>}
        </span>
        <button className="btn btn--icon" onClick={() => onTour('exit')} aria-label="Exit tour">
          ✕
        </button>
      </div>
      <h2 className="tour-guide__title">{section.title}</h2>
      <div className="tour-guide__progress" aria-hidden>
        <div className="tour-guide__progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="tour-guide__nav">
        <button className="btn btn--nav" onClick={() => go(s.sectionIndex - 1)} aria-label="Previous stop">
          ‹
        </button>
        <div className="tour-guide__dots" role="tablist" aria-label="Tour stops">
          {s.sections.map((sec, i) => (
            <button
              key={`${sec.kind}-${sec.groupKey ?? i}`}
              role="tab"
              aria-selected={i === s.sectionIndex}
              aria-label={`Stop ${i + 1}: ${sec.title}`}
              title={sec.title}
              className={`tour-dot${i === s.sectionIndex ? ' is-on' : ''}${sec.kind !== 'directory' ? ' tour-dot--special' : ''}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button className="btn btn--nav" onClick={() => go(s.sectionIndex + 1)} aria-label="Next stop">
          ›
        </button>
        {tour === 'running' ? (
          <button className="chip" onClick={() => onTour('pause')}>
            Pause
          </button>
        ) : (
          <button className="chip is-on" onClick={() => onTour('resume')}>
            Resume
          </button>
        )}
      </div>
    </section>
  );
}
