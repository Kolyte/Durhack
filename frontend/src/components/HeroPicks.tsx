import { useEffect, useState } from 'react';
import { ArrowRight, Box, Clock, Disc3, Headphones, Loader2, MousePointerClick, Shuffle, Swords, Trophy } from 'lucide-react';
import { forgetRecent, readRecent, type RecentRepo } from '../state/recent';
import { fetchFeaturedRankings, type RankingEntry } from '../api/rankings';
import type { Phase } from '../state/useComposeStream';
import { normalizeRepoUrl } from './RepoInput';

/** GitHub's language colours, so examples are recognisable at a glance. */
const FEATURED = [
  { repo: 'facebook/react', lang: 'JavaScript', color: '#f1e05a' },
  { repo: 'microsoft/vscode', lang: 'TypeScript', color: '#3178c6' },
  { repo: 'pallets/flask', lang: 'Python', color: '#3572A5' },
  { repo: 'golang/go', lang: 'Go', color: '#00ADD8' },
  { repo: 'rust-lang/rust', lang: 'Rust', color: '#dea584' },
  { repo: 'torvalds/linux', lang: 'C', color: '#555555' },
  { repo: 'expressjs/express', lang: 'JavaScript', color: '#f1e05a' },
  { repo: 'spring-projects/spring-petclinic', lang: 'Java', color: '#b07219' },
];

const STEPS = [
  { icon: Box, title: 'Paste a repository', text: 'Any public GitHub repo. Sonyx reads its structure: files, folders, imports.' },
  { icon: MousePointerClick, title: 'Explore it in 3D', text: 'Folders become districts, files become buildings. Switch to a galaxy or a tree.' },
  { icon: Headphones, title: 'Listen to it', text: 'Folders play as instruments and imports as melodies, generated live.' },
];

const MORE = [
  { href: '/ranking.html', icon: Trophy, title: 'Leaderboard', text: 'Codebases ranked by their Code DNA.' },
  { href: '/battle.html', icon: Swords, title: 'Battles', text: 'Put two repos head to head and vote.' },
  { href: '/wrapped.html', icon: Disc3, title: 'Wrapped', text: 'Your GitHub year, told as a music story.' },
];

/** The landing page: one clear action (open a repo), examples, how it works, and the other sections. */
export function Landing({ phase, status, onOpen }: { phase: Phase; status: string; onOpen: (url: string) => void }) {
  const [value, setValue] = useState('');
  const [top, setTop] = useState<RankingEntry[]>([]);
  const [recent, setRecent] = useState<RecentRepo[]>(readRecent);
  useEffect(() => {
    let alive = true;
    fetchFeaturedRankings(3)
      .then((rows) => alive && setTop(rows.slice(0, 3)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const busy = phase === 'connecting' || phase === 'analysing';
  const open = (repo: string) => {
    const url = normalizeRepoUrl(repo);
    window.history.replaceState(null, '', `?repo=${encodeURIComponent(url.replace(/^https?:\/\/(www\.)?github\.com\//, ''))}`);
    onOpen(url);
  };
  const random = () => open(FEATURED[Math.floor(Math.random() * FEATURED.length)].repo);

  return (
    <div className="landing">
      <section className="landing__hero">
        <p className="eyebrow">Code, as a place and a piece of music</p>
        <h1>See and hear any codebase.</h1>
        <p className="landing__lead">
          Paste a GitHub repository. Sonyx builds it as a 3D city you can walk around and plays its structure as music.
        </p>
        <form
          className="landing__search"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) open(value);
          }}
        >
          <input
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="owner/repository or GitHub URL"
            aria-label="GitHub repository"
            spellCheck={false}
            autoCapitalize="none"
          />
          <button className="btn btn--primary" type="submit" disabled={busy || !value.trim()}>
            {busy ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
            {busy ? 'Reading' : 'Open'}
          </button>
        </form>
        {(busy || phase === 'error') && <p className={`landing__status${phase === 'error' ? ' is-error' : ''}`}>{status}</p>}

        {recent.length > 0 && (
          <div className="examples examples--recent">
            <span className="examples__label">
              <Clock size={13} /> Recent
            </span>
            <ul>
              {recent.map((r) => (
                <li key={r.repo}>
                  <button className="example" onClick={() => open(r.repo)} title={`Open ${r.repo} again`}>
                    <span className="example__name">{r.repo}</span>
                    <span className="example__lang">{r.score.toFixed(1)}</span>
                  </button>
                </li>
              ))}
              <li>
                <button className="link examples__clear" onClick={() => (forgetRecent(), setRecent([]))}>
                  Clear
                </button>
              </li>
            </ul>
          </div>
        )}
        <div className="examples">
          <span className="examples__label">Try one</span>
          <ul>
            {FEATURED.map((f) => (
              <li key={f.repo}>
                <button className="example" onClick={() => open(f.repo)} title={f.repo}>
                  <span className="example__dot" style={{ background: f.color }} aria-hidden />
                  <span className="example__name">{f.repo.split('/')[1]}</span>
                  <span className="example__lang">{f.lang}</span>
                </button>
              </li>
            ))}
            <li>
              <button className="example example--random" onClick={random}>
                <Shuffle size={14} />
                <span className="example__name">Random</span>
              </button>
            </li>
          </ul>
        </div>
        {top.length > 0 && (
          <p className="landing__top">
            <Trophy size={14} /> Top of the leaderboard:{' '}
            {top.map((t, i) => (
              <span key={t.repoName}>
                {i > 0 && ', '}
                <button className="link" onClick={() => open(t.repoName)}>
                  {t.repoName}
                </button>{' '}
                <span className="landing__score">{t.score.toFixed(1)}</span>
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="steps" aria-label="How it works">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <div key={title} className="step">
            <span className="step__num">{i + 1}</span>
            <Icon size={18} className="step__icon" />
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        ))}
      </section>

      <section className="more" aria-label="More">
        {MORE.map(({ href, icon: Icon, title, text }) => (
          <a key={href} className="more__card" href={href}>
            <Icon size={18} />
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
            <ArrowRight size={16} className="more__go" />
          </a>
        ))}
      </section>
    </div>
  );
}
