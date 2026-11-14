export interface FileNode {
  id: string;
  path: string;
  directory: string;
  depth: number;
  x: number;
  y: number;
  z: number;
  loc: number;
  complexity: number;
  concurrency: number;
  analyzed: boolean;
}

export interface DependencyEdge {
  sourceId: string;
  targetId: string;
}

export type ComposeEvent =
  | { type: 'REPO_TREE'; repoName: string; bpm: number; nodes: FileNode[] }
  | { type: 'NODE_METRICS'; node: FileNode }
  | { type: 'EDGE_FOUND'; sourceId: string; targetId: string }
  | { type: 'COMPOSITION_READY'; totalAnalyzed: number }
  | { type: 'ERROR'; message: string };
