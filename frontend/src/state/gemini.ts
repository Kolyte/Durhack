import type { FileExplanation } from '../model/explain';
import type { FileInfo } from '../model/repoModel';
import type { RepoMeta } from '../types';

/**
 * Talks to our backend's /api/explain endpoint. The backend holds the Gemini API key and fetches the
 * file's code itself; the browser never sees the key.
 */

export interface GeminiStatus {
  enabled: boolean;
  model: string;
}

export interface GeminiExplanation extends FileExplanation {
  model: string;
}

let statusPromise: Promise<GeminiStatus> | null = null;

/** Whether the server has Gemini configured (asked once per page load). */
export function geminiStatus(): Promise<GeminiStatus> {
  statusPromise ??= fetch('/api/explain/status')
    .then((r) => (r.ok ? (r.json() as Promise<GeminiStatus>) : { enabled: false, model: '' }))
    .catch(() => ({ enabled: false, model: '' }));
  return statusPromise;
}

/** Answers already fetched in this session (the server caches too, but this avoids the round trip). */
const answers = new Map<string, GeminiExplanation>();
const keyFor = (meta: RepoMeta, file: FileInfo) => `${meta.repoName}@${meta.branch}:${file.path}`;

export const cachedExplanation = (meta: RepoMeta, file: FileInfo) => answers.get(keyFor(meta, file));

export async function explainWithGemini(meta: RepoMeta, file: FileInfo): Promise<GeminiExplanation> {
  const key = keyFor(meta, file);
  const cached = answers.get(key);
  if (cached) return cached;

  const [owner, repo] = meta.repoName.split('/');
  const res = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner,
      repo,
      branch: meta.branch,
      path: file.path,
      role: file.kind,
      loc: file.loc,
      complexity: file.complexity,
      concurrency: file.concurrency,
      imports: file.imports,
      importedBy: file.dependents.length,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { purpose?: string; details?: string[]; model?: string; message?: string };
  if (!res.ok || !data.purpose) throw new Error(data.message ?? `Gemini request failed (${res.status})`);
  const out = { purpose: data.purpose, details: data.details ?? [], model: data.model ?? '' };
  answers.set(key, out);
  return out;
}
