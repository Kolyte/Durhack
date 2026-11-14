import type { CodeDna } from '../model/codeDna';
import type { RepoModel } from '../model/repoModel';
import type { ViewMode } from '../types';

export type Vec3 = [number, number, number];

export interface FileLayout {
  pos: Vec3;
  /** City: building height. */
  height: number;
  /** City: building width/depth. */
  footprint: number;
  /** Tree: leaf orientation. */
  rot?: Vec3;
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

export interface Branch {
  start: Vec3;
  end: Vec3;
  radius: number;
  depth: number;
}

export interface Layout {
  mode: ViewMode;
  files: Map<string, FileLayout>;
  hubs: Map<string, HubLayout>;
  /** Tree only: trunk and branches. */
  branches: Branch[];
  center: Vec3;
  radius: number;
  /** Bounding sphere of everything drawn: used to frame the camera. */
  bounds: { center: Vec3; radius: number };
}

const GOLDEN = 2.39996;
const NO_BOUNDS = { center: [0, 0, 0] as Vec3, radius: 1 }; // filled in by computeLayout

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
  const layout =
    mode === 'city' ? cityLayout(model, dna) : mode === 'tree' ? treeLayout(model) : galaxyLayout(model, dna);
  layout.bounds = boundingSphere(layout);
  return layout;
}

function boundingSphere(layout: Layout): { center: Vec3; radius: number } {
  const pts: Vec3[] = [];
  for (const f of layout.files.values()) {
    pts.push(f.pos);
    if (layout.mode === 'city') pts.push([f.pos[0], f.pos[1] + f.height, f.pos[2]]);
  }
  for (const h of layout.hubs.values()) pts.push(h.pos);
  for (const b of layout.branches) pts.push(b.end);
  if (pts.length === 0) return { center: layout.center, radius: layout.radius };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(3, ...pts.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]))) + 1;
  return { center, radius };
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
          // Bigger files get wider footprints (within the street grid).
          footprint: 0.55 + 0.35 * Math.min(1, Math.log(1 + f.loc) / Math.log(1 + model.maxLoc)),
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
  return { mode: 'city', files, hubs, branches: [], center: [0, 0, 0], radius: Math.max(8, Math.hypot(ox, oz)), bounds: NO_BOUNDS };
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
        footprint: 1,
        size: planetSize(f.loc, f.degree),
        orbit: { center, radius: orbitR, angle, y },
      });
      radius = Math.max(radius, Math.hypot(center[0], center[2]) + orbitR);
    });
  });
  return { mode: 'galaxy', files, hubs, branches: [], center: [0, 0, 0], radius, bounds: NO_BOUNDS };
}

interface TreeNode {
  key: string;
  children: TreeNode[];
  weight: number;
  groupKey: string | null;
}

/**
 * Code Tree: the trunk is the repository, directories branch off it (sub-directories branch off
 * those), and files grow as leaves at the tip of their directory's branch. Root-level files
 * (configs, README…) sit around the base like roots.
 */
function treeLayout(model: RepoModel): Layout {
  const files = new Map<string, FileLayout>();
  const hubs = new Map<string, HubLayout>();
  const branches: Branch[] = [];

  const root: TreeNode = { key: '', children: [], weight: 0, groupKey: null };
  const nodes = new Map<string, TreeNode>([['', root]]);
  for (const g of model.groups) {
    if (g.key === '(root)') continue;
    const segs = g.key.split('/');
    let parent = root;
    parent.weight += g.files.length;
    segs.forEach((_, i) => {
      const key = segs.slice(0, i + 1).join('/');
      let n = nodes.get(key);
      if (!n) {
        n = { key, children: [], weight: 0, groupKey: null };
        nodes.set(key, n);
        parent.children.push(n);
      }
      n.weight += g.files.length;
      parent = n;
    });
    parent.groupKey = g.key;
  }

  const maxW = Math.max(1, ...root.children.map((c) => c.weight));
  const trunkH = 3.5 + Math.log2(1 + model.groups.length) * 1.3;
  branches.push({ start: [0, 0, 0], end: [0, trunkH, 0], radius: 0.16 + 0.025 * Math.sqrt(model.files.size), depth: 0 });
  let extent = 0;
  let topY = trunkH;

  const placeLeaves = (ids: string[], tip: Vec3, upward: boolean) => {
    const sorted = [...ids].sort((a, b) => model.files.get(b)!.degree - model.files.get(a)!.degree);
    const n = sorted.length;
    const r = 0.5 + 0.17 * Math.sqrt(n);
    sorted.forEach((id, j) => {
      const f = model.files.get(id)!;
      const theta = j * GOLDEN;
      // Spread over the upper ~2/3 of a sphere for a canopy, or a flat ring for roots.
      const phi = upward ? Math.acos(1 - ((j + 0.5) / n) * 1.5) : Math.PI / 2;
      const rr = upward ? r : 1.2 + 0.45 * Math.sqrt(j);
      const pos: Vec3 = [
        tip[0] + Math.sin(phi) * Math.cos(theta) * rr,
        tip[1] + (upward ? Math.cos(phi) * rr * 0.8 + 0.15 : 0),
        tip[2] + Math.sin(phi) * Math.sin(theta) * rr,
      ];
      files.set(id, {
        pos,
        height: 1,
        footprint: 1,
        size: planetSize(f.loc, f.degree) * 0.85,
        rot: [0, -theta, (Math.PI / 2 - phi) * 0.7],
      });
      extent = Math.max(extent, Math.hypot(pos[0], pos[2]));
      topY = Math.max(topY, pos[1]);
    });
  };

  const place = (node: TreeNode, start: Vec3, az: number, tilt: number, depth: number) => {
    const len = (2.6 + 2.4 * Math.sqrt(node.weight / maxW)) * Math.pow(0.74, depth - 1);
    const dir: Vec3 = [Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)];
    const end: Vec3 = [start[0] + dir[0] * len, start[1] + dir[1] * len, start[2] + dir[2] * len];
    branches.push({ start, end, radius: (0.05 + 0.1 * Math.sqrt(node.weight / maxW)) * Math.pow(0.8, depth - 1), depth });
    if (node.groupKey) {
      hubs.set(node.groupKey, { pos: end, width: 0.2, depth: 0.2 });
      placeLeaves(model.groupIndex.get(node.groupKey)!.files, end, true);
    }
    const kids = [...node.children].sort((a, b) => b.weight - a.weight);
    kids.forEach((c, j) => place(c, end, az + (j - (kids.length - 1) / 2) * 0.85 + 0.25, Math.min(1.2, tilt + 0.2), depth + 1));
  };

  const top = [...root.children].sort((a, b) => b.weight - a.weight);
  top.forEach((c, i) => {
    // Biggest directories branch highest, spiralling round the trunk.
    const y = trunkH * (1 - 0.5 * (i / Math.max(1, top.length)));
    place(c, [0, y, 0], i * GOLDEN, 0.8, 1);
  });

  const rootGroup = model.groupIndex.get('(root)');
  if (rootGroup) {
    hubs.set('(root)', { pos: [0, 0.2, 0], width: 0.25, depth: 0.25 });
    placeLeaves(rootGroup.files, [0, 0.15, 0], false);
  }
  // Frame the whole height: the tree is taller than it is wide.
  return { mode: 'tree', files, hubs, branches, center: [0, topY * 0.5, 0], radius: Math.max(8, extent * 1.05, topY * 0.72), bounds: NO_BOUNDS };
}
