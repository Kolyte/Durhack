import { apiFetch } from './http';
import type { CodeDna } from '../model/codeDna';
import type { RepoMeta } from '../types';

export interface RankingEntry {
  repoName: string;
  /** Overall Sonyx score, 0–100 (mean of the five Code DNA axes). */
  score: number;
  complexity: number;
  connectivity: number;
  modularity: number;
  concurrency: number;
  size: number;
  stars: number;
  analyzedFiles: number;
  totalCodeFiles: number;
  /** How many times this repo has been composed. */
  runs: number;
  analyzedAt: string;
}

export type RankingSortKey =
  | 'score'
  | 'complexity'
  | 'connectivity'
  | 'modularity'
  | 'concurrency'
  | 'size'
  | 'stars'
  | 'analyzedAt';

export async function fetchRankings(limit = 200): Promise<RankingEntry[]> {
  const res = await fetch(`/api/rankings?limit=${limit}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Ranking request failed (${res.status})`);
  }
  return (await res.json()) as RankingEntry[];
}

/** Records a finished composition. Best effort: the music never waits on (or breaks because of) the ranking. */
/** Top entries for the landing page; empty (not an error) when the leaderboard database is offline. */
export async function fetchFeaturedRankings(limit = 3): Promise<RankingEntry[]> {
  const res = await fetch(`/api/rankings/featured?limit=${limit}`);
  return res.ok ? ((await res.json()) as RankingEntry[]) : [];
}

export async function submitRanking(meta: RepoMeta, dna: CodeDna): Promise<void> {
  try {
    await apiFetch('/api/rankings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoName: meta.repoName,
        complexity: dna.complexity,
        connectivity: dna.connectivity,
        modularity: dna.modularity,
        concurrency: dna.concurrency,
        size: dna.size,
        analyzedFiles: dna.analyzedCodeFiles,
      }),
    });
  } catch {
    // Offline or no database: the ranking simply misses this run.
  }
}

/** Calls `onChange` whenever someone, anywhere, adds a result. Returns an unsubscribe function. */
export function subscribeRankings(onChange: () => void, onConnection: (live: boolean) => void): () => void {
  const source = new EventSource('/api/rankings/stream');
  source.addEventListener('hello', () => onConnection(true));
  source.addEventListener('ranking', () => onChange());
  source.onerror = () => onConnection(false);
  return () => source.close();
}

export function sortRankings(entries: RankingEntry[], key: RankingSortKey): RankingEntry[] {
  const value = (e: RankingEntry) => (key === 'analyzedAt' ? Date.parse(e.analyzedAt) : e[key]);
  return [...entries].sort((a, b) => value(b) - value(a) || a.repoName.localeCompare(b.repoName));
}

/** Link that opens a repo on the main page. */
export function composerHref(repoName: string): string {
  return `/?repo=${encodeURIComponent(repoName)}`;
}

export type RankingPeriod = 'all' | '30d' | '7d' | '24h';

export interface RankingFilter {
  /** Words that must all appear in "owner/name" (case-insensitive). */
  query: string;
  period: RankingPeriod;
  minStars: number;
}

export const NO_FILTER: RankingFilter = { query: '', period: 'all', minStars: 0 };

const PERIOD_MS: Record<RankingPeriod, number> = { all: Infinity, '30d': 30 * 864e5, '7d': 7 * 864e5, '24h': 864e5 };

export function isFiltered(f: RankingFilter): boolean {
  return f.query.trim() !== '' || f.period !== 'all' || f.minStars > 0;
}

/** Applies search and filters (sorting is separate, see sortRankings). */
export function filterRankings(entries: RankingEntry[], f: RankingFilter, now = Date.now()): RankingEntry[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const oldest = now - PERIOD_MS[f.period];
  return entries.filter(
    (e) =>
      words.every((w) => e.repoName.toLowerCase().includes(w)) &&
      e.stars >= f.minStars &&
      (f.period === 'all' || Date.parse(e.analyzedAt) >= oldest),
  );
}

/** Each repository's position on the overall leaderboard (by score), so filtered lists keep real ranks. */
export function overallRanks(entries: RankingEntry[]): Map<string, number> {
  return new Map(sortRankings(entries, 'score').map((e, i) => [e.repoName, i + 1]));
}
