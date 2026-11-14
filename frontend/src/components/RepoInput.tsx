import { useState } from 'react';
import type { Phase } from '../state/useComposeStream';

/** Pre-filled so first-time visitors can just press Compose. */
const DEFAULT_REPO_URL = 'https://github.com/expressjs/express';

export function RepoInput({
  phase,
  status,
  progress,
  onCompose,
  collapsible = false,
  repoName,
}: {
  phase: Phase;
  status: string;
  progress: number | null;
  onCompose: (url: string) => void;
  /** Phones: once a repo is loaded, shrink to one line so the 3D view gets the screen. */
  collapsible?: boolean;
  repoName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // A shared link like ?repo=owner/name pre-fills the box (audio still needs a click to start).
  const [url, setUrl] = useState(() => {
    const repo = new URLSearchParams(window.location.search).get('repo');
    return repo ? (repo.startsWith('http') ? repo : `https://github.com/${repo}`) : DEFAULT_REPO_URL;
  });
  const go = (target: string) => {
    const short = target.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$|\/+$/g, '');
    window.history.replaceState(null, '', `?repo=${encodeURIComponent(short)}`);
    setExpanded(false);
    onCompose(target);
  };
  const busy = phase === 'connecting' || phase === 'analysing';
  const showProgress = progress !== null && phase === 'analysing';

  if (collapsible && !expanded) {
    return (
      <header className="topbar topbar--collapsed panel">
        <div className="brand">
          <span className="brand__mark" aria-hidden>
            ◈
          </span>
          Sonyx
        </div>
        <div className={`topbar__repo${phase === 'error' ? ' status--error' : ''}`} role="status">
          {phase === 'ready' && repoName ? repoName : status}
          {showProgress && (
            <div className="progress" aria-hidden>
              <div className="progress__bar" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            </div>
          )}
        </div>
        <a className="chip nav-button" href="/ranking.html" aria-label="Leaderboard" title="Leaderboard">
          🏆
        </a>
        <button className="chip" onClick={() => setExpanded(true)} aria-label="Change repository">
          Change
        </button>
      </header>
    );
  }

  return (
    <header className="topbar panel">
      <div className="brand">
        <span className="brand__mark" aria-hidden>
          ◈
        </span>
        Sonyx
      </div>
      {collapsible && (
        <button className="btn btn--icon topbar__close" onClick={() => setExpanded(false)} aria-label="Collapse">
          ✕
        </button>
      )}
      <form
        className="repo-form"
        onSubmit={(e) => {
          e.preventDefault();
          go(url);
        }}
      >
        <input
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          aria-label="GitHub repository URL"
          spellCheck={false}
        />
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? 'Composing…' : 'Compose'}
        </button>
        <a className="btn btn--accent nav-button" href="/ranking.html" aria-label="Leaderboard" title="Leaderboard">
          🏆<span className="nav-button__label"> Leaderboard</span>
        </a>
      </form>
      <div className={`status${phase === 'error' ? ' status--error' : ''}`} role="status">
        {status}
        {showProgress && (
          <div className="progress" aria-hidden>
            <div className="progress__bar" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        )}
      </div>
    </header>
  );
}
