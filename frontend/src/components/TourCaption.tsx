import { audioEngine, engineStore } from '../audio/AudioEngine';
import { voiceForGroup } from '../audio/composer';
import { PRESETS } from '../audio/presets';
import type { CodeDna } from '../model/codeDna';
import { explainSection } from '../model/explain';
import type { RepoModel } from '../model/repoModel';
import { useStore } from '../state/store';
import type { RepoMeta } from '../types';

/** Caption card shown during the guided tour: what this part of the project is for, and what you're hearing. */
export function TourCaption({ model, meta, dna, onExit }: { model: RepoModel; meta: RepoMeta | null; dna: CodeDna; onExit: () => void }) {
  const s = useStore(engineStore);
  const section = s.sections[s.sectionIndex];
  if (!section) return null;
  const ex = explainSection(section, model, meta, dna);
  const groupIdx = section.groupKey ? (model.groupIndex.get(section.groupKey)?.index ?? 0) : -1;
  const voice = groupIdx >= 0 ? voiceForGroup(PRESETS[s.preset], groupIdx) : null;

  return (
    <section className="caption panel" aria-live="polite" aria-label="Tour explanation">
      <div className="caption__top">
        <span className="eyebrow">
          {ex.kicker} · {s.sectionIndex + 1}/{s.sections.length}
        </span>
        <div className="caption__nav">
          <button className="btn btn--icon" onClick={() => audioEngine.jumpToSection(s.sectionIndex - 1)} aria-label="Previous section">
            ‹
          </button>
          <button className="btn btn--icon" onClick={() => audioEngine.jumpToSection(s.sectionIndex + 1)} aria-label="Next section">
            ›
          </button>
          <button className="btn btn--icon" onClick={onExit} aria-label="Exit tour">
            ✕
          </button>
        </div>
      </div>
      <div key={s.sectionIndex} className="caption__body">
        <h2 className="caption__title">{ex.title}</h2>
        {ex.body && <p className="caption__text">{ex.body}</p>}
        {ex.facts.length > 0 && (
          <ul className="caption__facts">
            {ex.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <p className="caption__music">
          ♪ {s.chord || '…'}
          {voice ? ` · melody on the ${voice} voice` : ' · all areas together'}
        </p>
      </div>
      <div className="caption__dots" aria-hidden>
        {s.sections.map((sec, i) => (
          <span key={i} className={`caption__dot${i === s.sectionIndex ? ' is-on' : ''}`} title={sec.title} />
        ))}
      </div>
    </section>
  );
}
