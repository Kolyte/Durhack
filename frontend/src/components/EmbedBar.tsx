import { audioEngine, engineStore } from '../audio/AudioEngine';
import { useStore } from '../state/store';
import type { ViewMode } from '../types';

/** Embedded player (?embed=1): only the scene plus this bar. No accounts, shop or payments in iframes. */
export const IS_EMBED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('embed');

const VIEWS: [ViewMode, string, string][] = [
  ['city', '🏙️', 'Code City'],
  ['galaxy', '🌌', 'Galaxy'],
  ['tree', '🌳', 'Code Tree'],
];

export function EmbedBar({ repoName, status, mode, onMode }: { repoName: string | undefined; status: string; mode: ViewMode; onMode: (m: ViewMode) => void }) {
  const { playing } = useStore(engineStore);
  const open = `/?repo=${encodeURIComponent(repoName ?? new URLSearchParams(window.location.search).get('repo') ?? '')}`;
  return (
    <div className="embedbar panel">
      <button className="btn btn--round" onClick={() => audioEngine.togglePlay()} aria-label={playing ? 'Pause music' : 'Play music'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="embedbar__title">
        <a href="/" target="_blank" rel="noopener" className="embedbar__brand">
          ◈ Sonyx
        </a>
        <span>{repoName ?? status}</span>
      </div>
      <div className="embedbar__views" role="group" aria-label="View">
        {VIEWS.map(([m, icon, label]) => (
          <button key={m} className={`chip${mode === m ? ' is-on' : ''}`} onClick={() => onMode(m)} aria-pressed={mode === m} title={label} aria-label={label}>
            {icon}
          </button>
        ))}
      </div>
      <a className="btn btn--ghost btn--sm" href={open} target="_blank" rel="noopener">
        Open ↗
      </a>
    </div>
  );
}
