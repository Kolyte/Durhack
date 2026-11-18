import { ArrowDownWideNarrow, Search, Star, Swords, X } from 'lucide-react';
import { SiteHeader } from '../components/SiteHeader';
import '../components/siteShell.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  composerHref,
  fetchRankings,
  filterRankings,
  isFiltered,
  NO_FILTER,
  overallRanks,
  sortRankings,
  type RankingFilter,
  type RankingPeriod,
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

const PERIODS: { key: RankingPeriod; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '30d', label: '30 days' },
  { key: '7d', label: '7 days' },
  { key: '24h', label: '24 hours' },
];
const STAR_STEPS = [0, 100, 1000, 10000, 50000];

/** Filters and sort live in the URL, so a filtered leaderboard can be shared or bookmarked. */
function readUrl(): { filter: RankingFilter; sort: RankingSortKey } {
  const p = new URLSearchParams(window.location.search);
  const period = p.get('since') as RankingPeriod | null;
  const sort = p.get('sort') as RankingSortKey | null;
  return {
    filter: {
      query: p.get('q') ?? '',
      period: period && PERIODS.some((x) => x.key === period) ? period : 'all',
      minStars: Math.max(0, Number(p.get('stars')) || 0),
    },
    sort: sort && SORTS.some((x) => x.key === sort) ? sort : 'score',
  };
}

function writeUrl(filter: RankingFilter, sort: RankingSortKey) {
  const p = new URLSearchParams();
  if (filter.query.trim()) p.set('q', filter.query.trim());
  if (filter.period !== 'all') p.set('since', filter.period);
  if (filter.minStars) p.set('stars', String(filter.minStars));
  if (sort !== 'score') p.set('sort', sort);
  const qs = p.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
}

/** Bold the parts of a name that match the search words. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const marks = new Array(text.length).fill(false);
  const lower = text.toLowerCase();
  for (const w of words) {
    for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) marks.fill(true, i, i + w.length);
  }
  const parts: React.ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      const chunk = text.slice(start, i);
      parts.push(marks[start] ? <mark key={start}>{chunk}</mark> : chunk);
      start = i;
    }
  }
  return <>{parts}</>;
}

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
  const initial = useMemo(readUrl, []);
  const [sort, setSort] = useState<RankingSortKey>(initial.sort);
  const [filter, setFilter] = useState<RankingFilter>(initial.filter);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => writeUrl(filter, sort), [filter, sort]);
  // "/" focuses the search, like on GitHub.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const previous = useRef<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    try {
      const data = await fetchRankings(500);
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

  const ranks = useMemo(() => overallRanks(rows), [rows]);
  const sorted = useMemo(() => sortRankings(filterRankings(rows, filter, now), sort), [rows, filter, sort, now]);
  const filtered = isFiltered(filter);
  const set = (patch: Partial<RankingFilter>) => setFilter((f) => ({ ...f, ...patch }));

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

        <div className="ranking__toolbar">
          <label className="ranking__search">
            <Search size={16} aria-hidden />
            <input
              ref={searchRef}
              className="input"
              value={filter.query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder="Search repositories or owners"
              aria-label="Search repositories"
              spellCheck={false}
            />
            {filter.query ? (
              <button className="btn btn--icon" onClick={() => set({ query: '' })} aria-label="Clear search">
                <X size={15} />
              </button>
            ) : (
              <kbd className="ranking__kbd" aria-hidden>/</kbd>
            )}
          </label>
          <div className="segmented" role="radiogroup" aria-label="Analysed">
            {PERIODS.map((p) => (
              <button key={p.key} role="radio" aria-checked={filter.period === p.key} className={`segmented__item${filter.period === p.key ? ' is-on' : ''}`} onClick={() => set({ period: p.key })}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="ranking__select ranking__select--sort">
            <ArrowDownWideNarrow size={14} aria-hidden />
            <select value={sort} onChange={(e) => setSort(e.target.value as RankingSortKey)} aria-label="Sort by">
              {SORTS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ranking__select">
            <Star size={14} aria-hidden />
            <select value={filter.minStars} onChange={(e) => set({ minStars: Number(e.target.value) })} aria-label="Minimum stars">
              {STAR_STEPS.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'Any stars' : `${compact.format(n)}+ stars`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ranking__sortbar">
          <div className="chips ranking__sorts" role="tablist" aria-label="Sort by">
            <span className="ranking__sort-label">Sort by</span>
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
          {!loading && !error && (
            <span className="ranking__count">
              {filtered ? `${sorted.length} of ${rows.length}` : rows.length} {rows.length === 1 ? 'repository' : 'repositories'}
              {filtered && (
                <button className="link" onClick={() => setFilter(NO_FILTER)}>
                  Clear filters
                </button>
              )}
            </span>
          )}
        </div>

        {error && <div className="ranking__notice ranking__notice--error panel">{error}</div>}
        {!error && loading && <div className="ranking__notice panel">Loading…</div>}
        {!error && !loading && rows.length === 0 && (
          <div className="ranking__notice panel">
            No repositories yet. <a href="/">Open one</a> and it will appear here instantly.
          </div>
        )}
        {!error && !loading && rows.length > 0 && sorted.length === 0 && (
          <div className="ranking__notice panel">
            Nothing matches these filters.{' '}
            <button className="link" onClick={() => setFilter(NO_FILTER)}>
              Clear filters
            </button>
            {filter.query.trim().includes('/') && (
              <>
                {' '}or <a href={composerHref(filter.query.trim())}>open {filter.query.trim()}</a> to add it.
              </>
            )}
          </div>
        )}

        {sorted.length > 0 && (
          <ol className="ranking__list">
            {sorted.map((r, i) => (
              <li key={r.repoName} className={`rank-row panel${flash.has(r.repoName) ? ' rank-row--flash' : ''}`}>
                {(() => {
                  // With sort = score, show the real leaderboard position even when filtered.
                  const pos = sort === 'score' ? (ranks.get(r.repoName) ?? i + 1) : i + 1;
                  return <span className={`rank-row__pos${pos <= 3 ? ` rank-row__pos--${pos}` : ''}`}>{pos}</span>;
                })()}
                <div className="rank-row__repo">
                  <a href={composerHref(r.repoName)} className="rank-row__link" title={`Open ${r.repoName} in the composer`}>
                    <Highlight text={r.repoName} query={filter.query} />
                  </a>
                  <span className="rank-row__meta">
                    <span className="rank-row__stars"><Star size={12} className="rank-row__star" /> {compact.format(r.stars)}</span> · {r.analyzedFiles}/{r.totalCodeFiles} files ·{' '}
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
                <a className="btn btn--icon rank-row__battle" href={`/battle.html?a=${encodeURIComponent(r.repoName)}`} title={`Battle ${r.repoName} against another repo`} aria-label={`Battle ${r.repoName}`}>
                  <Swords size={16} />
                </a>
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
