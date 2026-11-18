/** Repositories you opened recently (this browser only), shown on the landing page. */
export interface RecentRepo {
  repo: string;
  score: number;
  at: number;
}

const KEY = 'sonyx.recent';
const MAX = 6;

export function readRecent(): RecentRepo[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentRepo[];
    return Array.isArray(list) ? list.filter((r) => typeof r.repo === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberRepo(repo: string, score: number) {
  try {
    const list = [{ repo, score, at: Date.now() }, ...readRecent().filter((r) => r.repo.toLowerCase() !== repo.toLowerCase())];
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* private mode */
  }
}

export function forgetRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
