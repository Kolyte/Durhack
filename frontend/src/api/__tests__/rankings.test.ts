import { describe, expect, it } from 'vitest';
import { composerHref, sortRankings, type RankingEntry } from '../rankings';

const entry = (repoName: string, over: Partial<RankingEntry>): RankingEntry => ({
  repoName,
  score: 50,
  complexity: 0.5,
  connectivity: 0.5,
  modularity: 0.5,
  concurrency: 0.5,
  size: 0.5,
  stars: 0,
  analyzedFiles: 10,
  totalCodeFiles: 10,
  runs: 1,
  analyzedAt: '2026-11-14T12:00:00Z',
  ...over,
});

describe('sortRankings', () => {
  const rows = [
    entry('a/low', { score: 20, complexity: 0.9, stars: 5, analyzedAt: '2026-11-14T12:03:00Z' }),
    entry('b/high', { score: 80, complexity: 0.1, stars: 500, analyzedAt: '2026-11-14T12:01:00Z' }),
    entry('c/mid', { score: 50, complexity: 0.5, stars: 50, analyzedAt: '2026-11-14T12:02:00Z' }),
  ];

  it('sorts by the chosen metric, highest first', () => {
    expect(sortRankings(rows, 'score').map((r) => r.repoName)).toEqual(['b/high', 'c/mid', 'a/low']);
    expect(sortRankings(rows, 'complexity').map((r) => r.repoName)).toEqual(['a/low', 'c/mid', 'b/high']);
    expect(sortRankings(rows, 'stars').map((r) => r.repoName)).toEqual(['b/high', 'c/mid', 'a/low']);
  });

  it('sorts by most recent analysis', () => {
    expect(sortRankings(rows, 'analyzedAt').map((r) => r.repoName)).toEqual(['a/low', 'c/mid', 'b/high']);
  });

  it('does not mutate its input', () => {
    sortRankings(rows, 'score');
    expect(rows[0].repoName).toBe('a/low');
  });
});

describe('composerHref', () => {
  it('links to the main page with the repo pre-filled', () => {
    expect(composerHref('expressjs/express')).toBe('/?repo=expressjs%2Fexpress');
  });
});
