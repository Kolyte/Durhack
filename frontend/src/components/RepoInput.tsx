import { useState } from 'react';
import type { Phase } from '../state/useComposeStream';

const PRESET_REPOS = [
  { label: 'Express', url: 'https://github.com/expressjs/express' },
  { label: 'PetClinic', url: 'https://github.com/spring-projects/spring-petclinic' },
  { label: 'Flask', url: 'https://github.com/pallets/flask' },
];

export function RepoInput({
  phase,
  status,
  progress,
  onCompose,
}: {
  phase: Phase;
  status: string;
  progress: number | null;
  onCompose: (url: string) => void;
}) {
  const [url, setUrl] = useState(PRESET_REPOS[0].url);
  const busy = phase === 'connecting' || phase === 'analysing';

  return (
    <header className="topbar panel">
      <div className="brand">
        <span className="brand__mark" aria-hidden>
          ◈
        </span>
        CodeFugue
      </div>
      <form
        className="repo-form"
        onSubmit={(e) => {
          e.preventDefault();
          onCompose(url);
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
      </form>
      <div className="chips">
        {PRESET_REPOS.map((p) => (
          <button
            key={p.label}
            className="chip"
            disabled={busy}
            onClick={() => {
              setUrl(p.url);
              onCompose(p.url);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className={`status${phase === 'error' ? ' status--error' : ''}`} role="status">
        {status}
        {progress !== null && phase === 'analysing' && (
          <div className="progress" aria-hidden>
            <div className="progress__bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
    </header>
  );
}
