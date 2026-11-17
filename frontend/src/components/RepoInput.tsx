import { useState } from 'react';
import { COMPACT_QUERY, useMediaQuery } from '../state/useMediaQuery';
import type { Phase } from '../state/useComposeStream';
import { AccountMenu } from './AccountMenu';
import { openShop } from '../state/shop';
import { accountStore, connectPrivateRepos, openPricing, signIn } from '../state/account';
import { useStore } from '../state/store';

/** Shown when GitHub says "not found": usually a private repo. */
function PrivateReposHint() {
  const { me } = useStore(accountStore);
  if (!me.signInAvailable || me.privateRepos) return null;
  const go = () => (!me.signedIn ? signIn('upgrade') : me.canUsePro ? connectPrivateRepos() : openPricing());
  return (
    <button className="btn btn--accent btn--sm status__action" onClick={go}>
      🔒 {me.signedIn && me.canUsePro ? 'Connect private repos' : 'Private repos are in Pro'}
    </button>
  );
}

/** "github.com/a/b", "a/b" or a full URL → a full https URL the backend understands. */
function normalizeRepoUrl(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(www\.)?github\.com\//i.test(t)) return `https://${t}`;
  return t;
}

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
  // Shorter hint on phones so it isn't cut off in the narrow box.
  const placeholder = useMediaQuery(COMPACT_QUERY) ? 'Paste GitHub link…' : 'Paste your GitHub repo link here…';
  // A shared link like ?repo=owner/name pre-fills the box (audio still needs a click to start).
  const [url, setUrl] = useState(() => {
    const repo = new URLSearchParams(window.location.search).get('repo');
    // Otherwise empty, so the placeholder tells first-time visitors what to do.
    return repo ? (repo.startsWith('http') ? repo : `https://github.com/${repo}`) : '';
  });
  const go = (raw: string) => {
    const target = normalizeRepoUrl(raw);
    if (!target) return;
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
        <button className="chip nav-button" onClick={openShop} aria-label="Shop" title="Shop">
          🛍️
        </button>
        <AccountMenu compact />
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
          placeholder={placeholder}
          aria-label="GitHub repository URL"
          spellCheck={false}
        />
        <button className="btn btn--primary" type="submit" disabled={busy || !url.trim()}>
          {busy ? 'Composing…' : 'Compose'}
        </button>
      </form>
      <div className={`status${phase === 'error' ? ' status--error' : ''}`} role="status">
        {status}
        {phase === 'error' && /private repos/i.test(status) && <PrivateReposHint />}
        {showProgress && (
          <div className="progress" aria-hidden>
            <div className="progress__bar" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        )}
      </div>
      {/* Page navigation, kept apart from the compose controls (input → Compose → status). */}
      <a className="btn btn--accent nav-button" href="/ranking.html" aria-label="Leaderboard" title="Leaderboard">
        🏆<span className="nav-button__label"> Leaderboard</span>
      </a>
      <button className="btn btn--ghost nav-button shop-button" onClick={openShop} aria-label="Shop" title="Shop">
        🛍️<span className="nav-button__label"> Shop</span>
      </button>
      <AccountMenu />
    </header>
  );
}
