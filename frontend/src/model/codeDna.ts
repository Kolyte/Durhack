import type { RepoMeta } from '../types';
import type { RepoModel } from './repoModel';

export interface CodeDna {
  complexity: number;
  connectivity: number;
  modularity: number;
  concurrency: number;
  size: number;
  /** Plain-language notes about what the scores are based on. */
  caveats: string[];
  analyzedCodeFiles: number;
}

export const DNA_LABELS: Record<keyof Omit<CodeDna, 'caveats' | 'analyzedCodeFiles'>, string> = {
  complexity: 'Complexity',
  connectivity: 'Connectivity',
  modularity: 'Modularity',
  concurrency: 'Concurrency',
  size: 'Size',
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Normalised 0–1 repository profile. Every score comes from data we actually have:
 * the sampled, analysed files and the import edges resolved between them.
 */
export function computeCodeDna(model: RepoModel, meta: RepoMeta | null): CodeDna {
  const code = [...model.files.values()].filter((f) => f.analyzed && (f.role === 'source' || f.role === 'test'));
  const caveats: string[] = [];
  const n = code.length;

  const loc = code.reduce((s, f) => s + f.loc, 0);
  const decisions = code.reduce((s, f) => s + (f.complexity - 1), 0);
  // Decision points per 100 lines: ~5 is simple glue code, ~20+ is branch-heavy logic.
  const complexity = loc > 0 ? clamp01((decisions / loc) * 100 / 20) : 0;

  const codeIds = new Set(code.map((f) => f.id));
  const codeEdges = model.edges.filter((e) => codeIds.has(e.sourceId) && codeIds.has(e.targetId));
  // Average resolved imports per file, saturating at 3.
  const connectivity = n > 0 ? clamp01(codeEdges.length / n / 3) : 0;

  const codeGroups = new Set(code.map((f) => f.group));
  const intra = codeEdges.filter((e) => model.files.get(e.sourceId)?.group === model.files.get(e.targetId)?.group).length;
  const groupScore = clamp01((codeGroups.size - 1) / 7);
  let modularity: number;
  if (codeEdges.length >= 3) {
    modularity = 0.6 * (intra / codeEdges.length) + 0.4 * groupScore;
  } else {
    modularity = groupScore;
    if (n > 0) caveats.push('Too few resolved imports to measure cohesion; modularity uses directory count only.');
  }

  const withConc = code.filter((f) => f.concurrency > 0).length;
  const concDensity = loc > 0 ? code.reduce((s, f) => s + f.concurrency, 0) / loc * 1000 : 0;
  const concurrency = n > 0 ? clamp01(0.7 * (withConc / n) + 0.3 * clamp01(concDensity / 10)) : 0;

  const total = meta?.totalCodeFiles ?? n;
  const size = clamp01(Math.log10(Math.max(1, total)) / Math.log10(3000));

  if (meta && meta.totalCodeFiles > meta.sampledCodeFiles) {
    caveats.push(
      `Sampled the ${meta.sampledCodeFiles} largest of ${meta.totalCodeFiles} source files; ` +
        'complexity, connectivity and concurrency describe that sample.',
    );
  }
  if (meta?.treeTruncated) caveats.push('GitHub truncated the file tree, so the total file count is a lower bound.');
  if (meta && n < meta.sampledCodeFiles) caveats.push(`${meta.sampledCodeFiles - n} sampled files are not analysed yet.`);
  caveats.push('Imports are only resolved between sampled files, by file name.');

  return { complexity, connectivity, modularity, concurrency, size, caveats, analyzedCodeFiles: n };
}

/**
 * Overall Sonyx score, 0–100: the mean of the five Code DNA axes, rounded to one decimal.
 * Must match RankingSubmission.score() on the backend, so the panel and the leaderboard agree.
 */
export function sonyxScore(dna: Pick<CodeDna, 'complexity' | 'connectivity' | 'modularity' | 'concurrency' | 'size'>): number {
  const mean = (dna.complexity + dna.connectivity + dna.modularity + dna.concurrency + dna.size) / 5;
  return Math.round(mean * 1000) / 10;
}
