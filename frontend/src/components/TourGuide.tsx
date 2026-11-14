import { audioEngine, engineStore } from '../audio/AudioEngine';
import { voiceForGroup } from '../audio/composer';
import { PRESETS } from '../audio/presets';
import type { RepoModel } from '../model/repoModel';
import { useStore } from '../state/store';
import type { TourState } from '../visualization/CameraRig';

type Action = 'pause' | 'resume' | 'exit';

/**
 * On-screen guide for the tour: where you are, what you are hearing, how far through this stop the
 * music is, and touch-friendly controls (prev / next / jump to any stop), so the tour does not depend
 * on a keyboard.
 */
export function TourGuide({ tour, model, onTour }: { tour: TourState; model: RepoModel; onTour: (a: Action) => void }) {
  const s = useStore(engineStore);
  const section = s.sections[s.sectionIndex];
  if (tour === 'off' || !section) return null;

  const n = s.sections.length;
  const progress = Math.min(1, (s.barInSection + 1) / Math.max(1, section.bars));
  const group = section.groupKey ? model.groupIndex.get(section.groupKey) : undefined;
  const voice = group ? voiceForGroup(PRESETS[s.preset], group.index, s.variant, s.rotation) : null;

  let detail: string;
  if (section.kind === 'overview') {
    detail = `${model.files.size} files in ${model.groups.length} districts. The most connected files carry the opening melody.`;
  } else if (section.kind === 'hub') {
    const hub = section.fileId ? model.files.get(section.fileId) : undefined;
    detail = hub
      ? `The most connected file (${hub.degree} import links). The melody bounces between it and its neighbours.`
      : 'The most connected file in the repository.';
  } else {
    const top = group
      ? group.files.map((id) => model.files.get(id)!).sort((a, b) => b.degree - a.degree || b.loc - a.loc)[0]
      : undefined;
    detail = `${group?.files.length ?? 0} files, played by the ${voice} voice${top ? `. Busiest: ${top.path.split('/').pop()}` : ''}.`;
  }

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
      <p className="tour-guide__detail">{detail}</p>
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
