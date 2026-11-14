import type { CodeDna } from '../model/codeDna';
import type { RepoModel } from '../model/repoModel';
import type { ViewMode } from '../types';

export type Vec3 = [number, number, number];

export interface FileLayout {
  pos: Vec3;
  /** City: building height. */
  height: number;
  /** Galaxy: planet radius. */
  size: number;
  /** Galaxy: files slowly orbit their directory's star. */
  orbit?: { center: Vec3; radius: number; angle: number; y: number };
}

export interface HubLayout {
  pos: Vec3;
  /** City: block footprint; galaxy: star radius in `width`. */
  width: number;
  depth: number;
}

export interface Layout {
  mode: ViewMode;
  files: Map<string, FileLayout>;
  hubs: Map<string, HubLayout>;
  center: Vec3;
  radius: number;
}

const GOLDEN = 2.39996;

export function buildingHeight(loc: number, kind: string): number {
  const h = Math.min(6, 0.5 + Math.log2(1 + loc / 25) * 0.75);
  if (kind === 'config') return h * 0.6;
  if (kind === 'docs') return 0.6;
  if (kind === 'test') return 0.3;
  return h;
}

export function planetSize(loc: number, degree: number): number {
  return 0.2 + 0.09 * Math.sqrt(degree) + 0.06 * Math.log2(1 + loc / 100);
}

export function computeLayout(model: RepoModel, mode: ViewMode, dna: CodeDna | null): Layout {
  return mode === 'city' ? cityLayout(model, dna) : galaxyLayout(model, dna);
}

function cityLayout(model: RepoModel, dna: CodeDna | null): Layout {
  const files = new Map<string, FileLayout>();
  const hubs = new Map<string, HubLayout>();
  const spacing = 1.35;
  const gap = 1.6 + (dna?.modularity ?? 0.5) * 2.4; // modular repos get clearly separated neighbourhoods

  const blocks = model.groups.map((g) => {
    const cols = Math.ceil(Math.sqrt(g.files.length));
    const rows = Math.ceil(g.files.length / cols);
    return { g, cols, rows, w: cols * spacing + 0.8, d: rows * spacing + 0.8 };
  });
  const perRow = Math.max(1, Math.ceil(Math.sqrt(blocks.length)));

  let z = 0;
  let maxX = 0;
  for (let r = 0; r * perRow < blocks.length; r++) {
    const row = blocks.slice(r * perRow, (r + 1) * perRow);
    const rowDepth = Math.max(...row.map((b) => b.d));
    let x = 0;
    for (const b of row) {
      const cx = x + b.w / 2;
      const cz = z + rowDepth / 2;
      hubs.set(b.g.key, { pos: [cx, 0, cz], width: b.w, depth: b.d });
      // Largest files nearest the middle of the block.
      const sorted = [...b.g.files].sort((a, c) => model.files.get(c)!.loc - model.files.get(a)!.loc);
      const cells: [number, number][] = [];
      for (let i = 0; i < b.cols; i++) for (let j = 0; j < b.rows; j++) cells.push([i, j]);
      const mid = [(b.cols - 1) / 2, (b.rows - 1) / 2];
      cells.sort((p, q) => Math.hypot(p[0] - mid[0], p[1] - mid[1]) - Math.hypot(q[0] - mid[0], q[1] - mid[1]));
      sorted.forEach((id, k) => {
        const f = model.files.get(id)!;
        const [i, j] = cells[k];
        files.set(id, {
          pos: [cx + (i - mid[0]) * spacing, 0, cz + (j - mid[1]) * spacing],
          height: buildingHeight(f.loc, f.kind),
          size: 0.4,
        });
      });
      x += b.w + gap;
    }
    maxX = Math.max(maxX, x - gap);
    z += rowDepth + gap;
  }

  // Centre the city on the origin.
  const ox = maxX / 2;
  const oz = (z - gap) / 2;
  for (const f of files.values()) f.pos = [f.pos[0] - ox, 0, f.pos[2] - oz];
  for (const h of hubs.values()) h.pos = [h.pos[0] - ox, 0, h.pos[2] - oz];
  return { mode: 'city', files, hubs, center: [0, 0, 0], radius: Math.max(8, Math.hypot(ox, oz)) };
}

function galaxyLayout(model: RepoModel, dna: CodeDna | null): Layout {
  const files = new Map<string, FileLayout>();
  const hubs = new Map<string, HubLayout>();
  const spread = 0.8 + (dna?.modularity ?? 0.5) * 0.5;
  let radius = 8;

  model.groups.forEach((g, i) => {
    const r = i === 0 ? 0 : (6 + 5 * Math.sqrt(i)) * spread;
    const a = i * GOLDEN;
    const center: [number, number, number] = [Math.cos(a) * r, Math.sin(i * 1.3) * 1.2, Math.sin(a) * r];
    const starR = 0.45 + 0.1 * Math.sqrt(g.files.length);
    hubs.set(g.key, { pos: center, width: starR, depth: starR });

    // Most connected files orbit closest to their star.
    const sorted = [...g.files].sort((x, y) => model.files.get(y)!.degree - model.files.get(x)!.degree);
    sorted.forEach((id, j) => {
      const f = model.files.get(id)!;
      const orbitR = starR + 1.1 + 0.62 * Math.sqrt(j + 1) * 1.25;
      const angle = j * GOLDEN + i;
      const y = Math.sin(j * 2.1) * 0.35;
      files.set(id, {
        pos: [center[0] + Math.cos(angle) * orbitR, center[1] + y, center[2] + Math.sin(angle) * orbitR],
        height: 1,
        size: planetSize(f.loc, f.degree),
        orbit: { center, radius: orbitR, angle, y },
      });
      radius = Math.max(radius, Math.hypot(center[0], center[2]) + orbitR);
    });
  });
  return { mode: 'galaxy', files, hubs, center: [0, 0, 0], radius };
}
