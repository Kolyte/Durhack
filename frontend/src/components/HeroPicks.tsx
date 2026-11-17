import { useEffect, useState } from 'react';
import { fetchRankings, type RankingEntry } from '../api/rankings';

/** Famous repos worth hearing, chosen for variety of language and structure. */
const FEATURED = [
  { repo: 'facebook/react', icon: '⚛️', note: 'UI library' },
  { repo: 'microsoft/vscode', icon: '🧩', note: 'Code editor' },
  { repo: 'torvalds/linux', icon: '🐧', note: 'Kernel' },
  { repo: 'pallets/flask', icon: '🧪', note: 'Python web' },
  { repo: 'golang/go', icon: '🐹', note: 'Language' },
  { repo: 'rust-lang/rust', icon: '🦀', note: 'Compiler' },
  { repo: 'expressjs/express', icon: '🚂', note: 'Node server' },
  { repo: 'spring-projects/spring-petclinic', icon: '🐾', note: 'Java app' },
];

/** One click from landing to music: featured repos, the leaderboard's top three and a random pick. */
export function HeroPicks({ onPick }: { onPick: (url: string) => void }) {
  const [top, setTop] = useState<RankingEntry[]>([]);
  useEffect(() => {
    let alive = true;
    fetchRankings(3)
      .then((rows) => alive && setTop(rows.slice(0, 3)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const pick = (repo: string) => onPick(`https://github.com/${repo}`);
  const random = () => pick(FEATURED[Math.floor(Math.random() * FEATURED.length)].repo);

  return (
    <div className="picks">
      <p className="picks__label">Or hear a famous codebase:</p>
      <div className="picks__grid">
        {FEATURED.map((f) => (
          <button key={f.repo} className="pick" onClick={() => pick(f.repo)}>
            <span className="pick__icon" aria-hidden>
              {f.icon}
            </span>
            <span className="pick__name">{f.repo.split('/')[1]}</span>
            <span className="pick__note">{f.note}</span>
          </button>
        ))}
        <button className="pick pick--random" onClick={random}>
          <span className="pick__icon" aria-hidden>
            🎲
          </span>
          <span className="pick__name">Surprise me</span>
          <span className="pick__note">Random pick</span>
        </button>
      </div>
      {top.length > 0 && (
        <p className="picks__top">
          🏆 Top of the leaderboard:{' '}
          {top.map((t, i) => (
            <span key={t.repoName}>
              {i > 0 && ' · '}
              <button className="link" onClick={() => pick(t.repoName)}>
                {t.repoName} <b>{t.score.toFixed(1)}</b>
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
