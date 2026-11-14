/** Role as sent by the backend. The frontend may upgrade "source" to "module" (see model/repoModel.ts). */
export type BackendRole = 'source' | 'test' | 'config' | 'docs';
export type FileRole = BackendRole | 'module';

export interface FileNode {
  id: string;
  path: string;
  directory: string;
  depth: number;
  loc: number;
  complexity: number;
  concurrency: number;
  imports: number;
  role: BackendRole;
  analyzed: boolean;
}

export interface DependencyEdge {
  sourceId: string;
  targetId: string;
}

export interface RepoMeta {
  repoName: string;
  bpm: number;
  stars: number;
  totalCodeFiles: number;
  sampledCodeFiles: number;
  treeTruncated: boolean;
}

export type ComposeEvent =
  | ({ type: 'REPO_TREE'; nodes: FileNode[] } & RepoMeta)
  | { type: 'NODE_METRICS'; node: FileNode }
  | { type: 'EDGE_FOUND'; sourceId: string; targetId: string }
  | { type: 'COMPOSITION_READY'; totalAnalyzed: number }
  | { type: 'ERROR'; message: string };

export type ViewMode = 'city' | 'galaxy';
export type MetricOverlay = 'complexity' | 'size' | 'dependencies' | 'concurrency';
