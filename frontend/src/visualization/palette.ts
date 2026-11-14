import * as THREE from 'three';
import type { FileInfo, RepoModel } from '../model/repoModel';
import type { MetricOverlay } from '../types';
import { complexityLevel } from '../audio/composer';

export const PALETTE = {
  bg: '#060914',
  navy: '#0b1226',
  grid: '#16224a',
  teal: '#2dd4bf',
  cyan: '#38bdf8',
  lavender: '#a78bfa',
  purple: '#7c3aed',
  pink: '#f472b6',
  text: '#e2e8f0',
  muted: '#94a3b8',
};

const RAMP = [PALETTE.teal, PALETTE.cyan, PALETTE.lavender, PALETTE.pink].map((c) => new THREE.Color(c));

/** Teal → sky → lavender → pink. */
export function rampColor(t: number, out = new THREE.Color()): THREE.Color {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return out.copy(RAMP[i]).lerp(RAMP[i + 1], x - i);
}

/** 0–1 value of the selected metric for one file. */
export function metricValue(file: FileInfo, overlay: MetricOverlay, model: RepoModel): number {
  switch (overlay) {
    case 'complexity':
      return complexityLevel(file.complexity);
    case 'size':
      return Math.log(1 + file.loc) / Math.log(1 + model.maxLoc);
    case 'dependencies':
      return file.degree / model.maxDegree;
    case 'concurrency':
      return file.concurrency > 0 ? 0.45 + 0.55 * Math.min(1, file.concurrency / 10) : 0;
  }
}

export const OVERLAY_INFO: Record<MetricOverlay, { label: string; low: string; high: string }> = {
  complexity: { label: 'Complexity', low: 'simple', high: 'branch-heavy' },
  size: { label: 'File size', low: 'small', high: 'large' },
  dependencies: { label: 'Dependencies', low: 'isolated', high: 'hub' },
  concurrency: { label: 'Concurrency', low: 'none', high: 'async-heavy' },
};

export const ROLE_TINT: Partial<Record<FileInfo['kind'], string>> = {
  docs: '#c4b5fd',
  config: '#7dd3fc',
};
