import { Star } from 'lucide-react';
import { SiteHeader } from '../components/SiteHeader';
import '../components/siteShell.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  composerHref,
  fetchRankings,
  sortRankings,
  subscribeRankings,
  type RankingEntry,
  type RankingSortKey,
} from '../api/rankings';

const SORTS: { key: RankingSortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'complexity', label: 'Complexity' },
  { key: 'connectivity', label: 'Connectivity' },
  { key: 'modularity', label: 'Modularity' },
  { key: 'concurrency', label: 'Concurrency' },
  { key: 'size', label: 'Size' },
  { key: 'stars', label: 'Stars' },
  { key: 'analyzedAt', label: 'Newest' },
];

const AXES = ['complexity', 'connectivity', 'modularity', 'concurrency', 'size'] as const;

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function RankingPage() {
  const [rows, setRows] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [sort, setSort] = useState<RankingSortKey>('score');
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const previous = useRef<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    try {
      const data = await fetchRankings();
      // Highlight rows that are new or were re-analysed since the last load.
      const changed = new Set<string>();
      if (previous.current.size > 0) {
        for (const r of data) if (previous.current.get(r.repoName) !== r.analyzedAt) changed.add(r.repoName);
      }
      previous.current = new Map(data.map((r) => [r.repoName, r.analyzedAt]));
      setRows(data);
      setError(null);
      if (changed.size) {
        setFlash(changed);
        setTimeout(() => setFlash(new Set()), 2400);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the ranking');
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeRankings(() => void load(), setLive);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      unsubscribe();
      clearInterval(tick);
    };
  }, [load]);

  const sorted = useMemo(() => sortRankings(rows, sort), [rows, sort]);

  return (
    <>
    <SiteHeader active="leaderboard">
      <span className={`live${live ? ' live--on' : ''}`} title={live ? 'Updates arrive in real time' : 'Reconnecting…'}>
        <span className="live__dot" aria-hidden />
        {live ? 'Live' : 'Offline'}
      </span>
    </SiteHeader>
    <div className="ranking">

      <main className="ranking__main">
        <div className="ranking__intro">
          <h1>Leaderboard</h1>
          <p>
            Every repository composed on Sonyx, ranked by its Code DNA. The score is the average of the five axes
            (0–100). Click a repository to open it.
          </p>
        </div>

        <div className="chips ranking__sorts" role="tablist" aria-label="Sort by">
          {SORTS.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={sort === s.key}
              className={`chip${sort === s.key ? ' is-on' : ''}`}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && <div className="ranking__notice ranking__notice--error panel">{error}</div>}
        {!error && loading && <div className="ranking__notice panel">Loading…</div>}
        {!error && !loading && sorted.length === 0 && (
          <div className="ranking__notice panel">
            No repositories yet. <a href="/">Open one</a> and it will appear here instantly.
          </div>
        )}

        {sorted.length > 0 && (
          <ol className="ranking__list">
            {sorted.map((r, i) => (
              <li key={r.repoName} className={`rank-row panel${flash.has(r.repoName) ? ' rank-row--flash' : ''}`}>
                <span className={`rank-row__pos${i < 3 ? ` rank-row__pos--${i + 1}` : ''}`}>{i + 1}</span>
                <div className="rank-row__repo">
                  <a href={composerHref(r.repoName)} className="rank-row__link" title={`Open ${r.repoName} in the composer`}>
                    {r.repoName}
                  </a>
                  <span className="rank-row__meta">
                    <Star size={12} className="rank-row__star" /> {compact.format(r.stars)} · {r.analyzedFiles}/{r.totalCodeFiles} files ·{' '}
                    {r.runs > 1 ? `${r.runs} runs · ` : ''}
                    {timeAgo(r.analyzedAt, now)}
                  </span>
                </div>
                <div className="rank-row__axes">
                  {AXES.map((axis) => (
                    <div key={axis} className={`axis${sort === axis ? ' axis--active' : ''}`} title={`${axis}: ${Math.round(r[axis] * 100)}`}>
                      <span className="axis__label">{axis.slice(0, 4)}</span>
                      <span className="axis__track">
                        <span className={`axis__bar axis__bar--${axis}`} style={{ width: `${Math.round(r[axis] * 100)}%` }} />
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rank-row__score">
                  <span className="rank-row__score-value">{r.score.toFixed(1)}</span>
                  <span className="rank-row__score-label">score</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
    </>
  );
}
