/** GET /api/wrapped/{login} */
export interface Wrapped {
  login: string;
  name: string;
  avatarUrl: string;
  year: number;
  followers: number;
  memberYears: number;
  repos: number;
  stars: number;
  forks: number;
  linesEstimate: number;
  activeThisYear: number;
  newThisYear: number;
  busiestMonth: string | null;
  languages: { name: string; repos: number; share: number; genre: string }[];
  genre: string;
  instrument: string;
  preset: string;
  bpm: number;
  key: string;
  topRepo: RepoSummary | null;
  latestRepo: RepoSummary | null;
  persona: { title: string; line: string };
  score: number;
}

export interface RepoSummary {
  name: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
}
