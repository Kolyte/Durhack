import { apiFetch } from '../api/http';
import type { RepoMeta } from '../types';
import { createStore } from './store';

/** POST /api/history: the size of each tracked file at sampled points in the repo's history (−1 = absent). */
export interface HistoryData {
  repo: string;
  branch: string;
  totalCommits: number;
  paths: string[];
  snapshots: { sha: string; date: string; message: string; files: number; sizes: number[] }[];
}

export const historyStore = createStore<{
  open: boolean;
  loading: boolean;
  error: string | null;
  data: HistoryData | null;
  /** Position in the timeline, 0 … snapshots-1 (fractional while playing, for smooth growth). */
  position: number;
  playing: boolean;
}>({ open: false, loading: false, error: null, data: null, position: 0, playing: false });

/**
 * File id → growth (0 = not created yet, 1 = today's size). Read by the 3D scene every frame, so scrubbing
 * and playback never re-render React components. Empty when the time-lapse is closed.
 */
export const historyGrowth = new Map<string, number>();
export const historyState = { active: false };

const SECONDS_PER_SNAPSHOT = 1.4;
let raf = 0;

export async function openHistory(meta: RepoMeta, paths: string[]) {
  historyStore.set({ open: true, loading: true, error: null, data: null, position: 0, playing: false });
  try {
    const res = await apiFetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: meta.repoName, paths, points: 12, privateRepo: !!meta.privateRepo }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { message?: string }).message ?? 'Could not load the history');
    const data = body as HistoryData;
    if (!data.snapshots.length) throw new Error('No history found');
    historyStore.set({ loading: false, data });
    historyState.active = true;
    applyPosition(0);
    play();
  } catch (e) {
    historyStore.set({ loading: false, error: e instanceof Error ? e.message : 'Could not load the history' });
  }
}

export function closeHistory() {
  pause();
  historyState.active = false;
  historyGrowth.clear();
  historyStore.set({ open: false, data: null, position: 0 });
}

/** Sets the timeline position and recomputes every file's growth (interpolated between snapshots). */
export function applyPosition(position: number) {
  const data = historyStore.get().data;
  if (!data) return;
  const last = data.snapshots.length - 1;
  const p = Math.max(0, Math.min(last, position));
  const i = Math.floor(p);
  const t = p - i;
  const a = data.snapshots[i].sizes;
  const b = data.snapshots[Math.min(last, i + 1)].sizes;
  const now = data.snapshots[last].sizes;
  data.paths.forEach((path, k) => {
    const final = Math.max(1, now[k] > 0 ? now[k] : Math.max(a[k], b[k], 1));
    const ga = a[k] < 0 ? 0 : 0.2 + 0.8 * Math.min(1, a[k] / final);
    const gb = b[k] < 0 ? 0 : 0.2 + 0.8 * Math.min(1, b[k] / final);
    historyGrowth.set(path, ga + (gb - ga) * t);
  });
  historyStore.set({ position: p });
}

export function play() {
  const data = historyStore.get().data;
  if (!data) return;
  if (historyStore.get().position >= data.snapshots.length - 1) applyPosition(0);
  historyStore.set({ playing: true });
  let prev = performance.now();
  const tick = (now: number) => {
    const s = historyStore.get();
    if (!s.playing || !s.data) return;
    const next = s.position + (now - prev) / 1000 / SECONDS_PER_SNAPSHOT;
    prev = now;
    applyPosition(next);
    if (next >= s.data.snapshots.length - 1) return void historyStore.set({ playing: false });
    raf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

export function pause() {
  cancelAnimationFrame(raf);
  historyStore.set({ playing: false });
}
