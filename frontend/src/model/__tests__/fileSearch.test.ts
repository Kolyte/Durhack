import { describe, expect, it } from 'vitest';
import { matchScore } from '../fileSearch';

describe('matchScore', () => {
  const rank = (paths: string[], q: string) =>
    paths
      .map((p) => ({ p, s: matchScore(p, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p);

  it('needs every query character, in order', () => {
    expect(matchScore('src/router/index.ts', 'rtr')).toBeGreaterThan(0);
    expect(matchScore('src/router/index.ts', 'xyz')).toBe(-1);
    expect(matchScore('src/router/index.ts', 'tr')).toBeGreaterThanOrEqual(0);
  });

  it('prefers file names and word starts over scattered letters', () => {
    // Both real "router" files beat a path that only has the letters scattered (r…o…u…t…e…r).
    const routers = rank(['lib/application-registry/outer-tree.js', 'lib/router/index.js', 'test/app.router.js'], 'router');
    expect(routers.slice(0, 2).sort()).toEqual(['lib/router/index.js', 'test/app.router.js']);
    expect(rank(['src/components/AppHeader.tsx', 'src/app.tsx'], 'app')[0]).toBe('src/app.tsx');
  });

  it('ignores case and spaces; empty query matches everything', () => {
    expect(matchScore('README.md', 'read me')).toBeGreaterThan(0);
    expect(matchScore('anything', '')).toBe(0);
  });
});
