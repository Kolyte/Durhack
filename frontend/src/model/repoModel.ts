import type { DependencyEdge, FileNode, FileRole } from '../types';

export interface FileInfo extends FileNode {
  /** Final role after the frontend's "module" upgrade. */
  kind: FileRole;
  /** Key of the directory group (neighbourhood / solar system) this file belongs to. */
  group: string;
  deps: string[];
  dependents: string[];
  degree: number;
}

export interface DirGroup {
  key: string;
  label: string;
  index: number;
  files: string[];
  totalLoc: number;
  degree: number;
}

export interface RepoModel {
  files: Map<string, FileInfo>;
  groups: DirGroup[];
  groupIndex: Map<string, DirGroup>;
  edges: DependencyEdge[];
  maxDegree: number;
  maxLoc: number;
}

const MODULE_BASENAMES = new Set(['index', 'main', 'app', 'mod', 'lib', '__init__', 'server', 'application']);

/** Strips the directory prefix every file shares (e.g. "src/main/java/com/acme/") so groups are meaningful. */
function commonPrefix(dirs: string[]): string[] {
  const split = dirs.filter((d) => d.length > 0).map((d) => d.split('/'));
  if (split.length === 0 || split.length < dirs.length) return [];
  const prefix: string[] = [];
  for (let i = 0; ; i++) {
    const seg = split[0][i];
    if (seg === undefined || !split.every((s) => s[i] === seg)) break;
    prefix.push(seg);
  }
  return prefix;
}

export function groupKeyFor(directory: string, prefixLen: number): string {
  const segs = directory.split('/').filter(Boolean).slice(prefixLen);
  return segs.length === 0 ? '(root)' : segs.slice(0, 2).join('/');
}

export function buildRepoModel(nodes: FileNode[], edges: DependencyEdge[]): RepoModel {
  const codeDirs = nodes.filter((n) => n.role === 'source' || n.role === 'test').map((n) => n.directory);
  const prefixLen = commonPrefix(codeDirs).length;

  const deps = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const cleanEdges: DependencyEdge[] = [];
  for (const e of edges) {
    const key = `${e.sourceId}->${e.targetId}`;
    if (seen.has(key) || !ids.has(e.sourceId) || !ids.has(e.targetId)) continue;
    seen.add(key);
    cleanEdges.push(e);
    deps.set(e.sourceId, [...(deps.get(e.sourceId) ?? []), e.targetId]);
    dependents.set(e.targetId, [...(dependents.get(e.targetId) ?? []), e.sourceId]);
  }

  const files = new Map<string, FileInfo>();
  const groupMap = new Map<string, DirGroup>();
  for (const n of nodes) {
    const isCode = n.role === 'source' || n.role === 'test';
    const group = isCode ? groupKeyFor(n.directory, prefixLen) : groupKeyFor(n.directory, 0);
    const d = deps.get(n.id) ?? [];
    const dt = dependents.get(n.id) ?? [];
    const base = n.path.split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase();
    const kind: FileRole =
      n.role === 'source' && (dt.length >= 3 || MODULE_BASENAMES.has(base)) ? 'module' : n.role;
    files.set(n.id, { ...n, kind, group, deps: d, dependents: dt, degree: d.length + dt.length });

    let g = groupMap.get(group);
    if (!g) {
      g = { key: group, label: group, index: 0, files: [], totalLoc: 0, degree: 0 };
      groupMap.set(group, g);
    }
    g.files.push(n.id);
    g.totalLoc += n.loc;
    g.degree += d.length + dt.length;
  }

  // Biggest neighbourhoods first: stable ordering gives stable layouts and instrument assignment.
  const groups = [...groupMap.values()].sort(
    (a, b) => b.files.length - a.files.length || b.totalLoc - a.totalLoc || a.key.localeCompare(b.key),
  );
  groups.forEach((g, i) => (g.index = i));

  let maxDegree = 1;
  let maxLoc = 1;
  for (const f of files.values()) {
    maxDegree = Math.max(maxDegree, f.degree);
    maxLoc = Math.max(maxLoc, f.loc);
  }
  return { files, groups, groupIndex: groupMap, edges: cleanEdges, maxDegree, maxLoc };
}
