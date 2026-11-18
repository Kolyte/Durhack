import { useState } from 'react';
import { ArrowRight, FileSearch, Github, Keyboard, Loader2, Lock, Search } from 'lucide-react';
import type { Phase } from '../state/useComposeStream';
import { accountStore, connectPrivateRepos, openPricing, signIn } from '../state/account';
import { useStore } from '../state/store';

/** Shown when GitHub says "not found": usually a private repo. */
function PrivateReposHint() {
  const { me } = useStore(accountStore);
  if (!me.signInAvailable || me.privateRepos) return null;
  const go = () => (!me.signedIn ? signIn('upgrade') : me.canUsePro ? connectPrivateRepos() : openPricing());
  return (
    <button className="btn btn--ghost btn--sm status__action" onClick={go}>
      <Lock size={14} />
      {me.signedIn && me.canUsePro ? 'Connect private repos' : 'Private repos are in Pro'}
    </button>
  );
}

/** "github.com/a/b", "a/b" or a full URL → a full https URL the backend understands. */
export function normalizeRepoUrl(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(www\.)?github\.com\//i.test(t)) return `https://${t}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(t)) return `https://github.com/${t}`;
  return t;
}

const shortName = (url: string) => url.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$|\/+$/g, '');

/**
 * The repository search in the header (Explore). Accepts owner/name or a GitHub URL. While a repo is being
 * read, a thin progress line runs under the field; errors show right below it.
 */
export function RepoInput({
  phase,
  status,
  progress,
  onCompose,
  collapsible = false,
  repoName,
  onFind,
  onHelp,
}: {
  phase: Phase;
  status: string;
  progress: number | null;
  onCompose: (url: string) => void;
  /** Phones: once a repo is loaded, shrink to the repo name so the 3D view gets the screen. */
  collapsible?: boolean;
  repoName?: string;
  /** Opens the file finder (once a repo is loaded). */
  onFind?: () => void;
  onHelp?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [url, setUrl] = useState(() => new URLSearchParams(window.location.search).get('repo') ?? '');
  const go = (raw: string) => {
    const target = normalizeRepoUrl(raw);
    if (!target) return;
    window.history.replaceState(null, '', `?repo=${encodeURIComponent(shortName(target))}`);
    setExpanded(false);
    onCompose(target);
  };
  const busy = phase === 'connecting' || phase === 'analysing';
  const showProgress = progress !== null && phase === 'analysing';
  const progressBar = showProgress && (
    <div className="progress" aria-hidden>
      <div className="progress__bar" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
    </div>
  );

  if (collapsible && !expanded) {
    return (
      <div className="repo-search repo-search--collapsed">
        <div className="repo-pill__row">
          <button className="repo-pill" onClick={() => setExpanded(true)} aria-label="Change repository">
            {busy ? <Loader2 size={15} className="spin" /> : <Github size={15} />}
            <span>{phase === 'ready' && repoName ? repoName : status}</span>
            <Search size={15} className="repo-pill__edit" />
          </button>
          {onFind && (
            <button className="btn btn--icon" onClick={onFind} aria-label="Find a file">
              <FileSearch size={18} />
            </button>
          )}
        </div>
        {progressBar}
      </div>
    );
  }

  return (
    <div className="repo-search">
      <form
        className="repo-form"
        onSubmit={(e) => {
          e.preventDefault();
          go(url);
        }}
      >
        <Github size={16} className="repo-form__icon" aria-hidden />
        <input
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="owner/repository or GitHub URL"
          aria-label="GitHub repository"
          spellCheck={false}
          autoCapitalize="none"
          autoFocus={collapsible}
        />
        <button className="btn" type="submit" disabled={busy || !url.trim()}>
          {busy ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
          <span className="repo-form__label">{busy ? 'Reading' : 'Open'}</span>
        </button>
        {onFind && (
          <button type="button" className="btn btn--quiet repo-form__tool" onClick={onFind} title="Find a file (Ctrl+K)">
            <FileSearch size={16} />
            <span className="repo-form__label">Find file</span>
            <kbd className="repo-form__kbd">Ctrl K</kbd>
          </button>
        )}
        {onHelp && (
          <button type="button" className="btn btn--icon repo-form__tool repo-form__help" onClick={onHelp} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
            <Keyboard size={16} />
          </button>
        )}
      </form>
      {progressBar}
      {(busy || phase === 'error') && (
        <div className={`repo-status${phase === 'error' ? ' repo-status--error' : ''}`} role="status">
          {status}
          {phase === 'error' && /private repos/i.test(status) && <PrivateReposHint />}
        </div>
      )}
    </div>
  );
}
