import type { ComposeEvent, DependencyEdge, FileNode, RepoMeta } from '../types';
import { buildRepoModel } from '../model/repoModel';
import { computeCodeDna, type CodeDna } from '../model/codeDna';
import { submitRanking } from './rankings';

const WS_URL =
  import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/compose`;

export interface Analysis {
  meta: RepoMeta;
  dna: CodeDna;
  files: number;
}

/**
 * Analyses a repository over the composer's WebSocket without starting any audio or 3D (used by
 * repo battles). Also records the result on the leaderboard, like the composer does.
 */
export function analyzeRepo(repoUrl: string, onProgress: (done: number, total: number) => void): Promise<Analysis> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let nodes: FileNode[] = [];
    const edges: DependencyEdge[] = [];
    let meta: RepoMeta | null = null;
    let settled = false;
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      ws.close();
      reject(new Error(msg));
    };
    ws.onopen = () => ws.send(JSON.stringify({ repoUrl }));
    ws.onerror = () => fail('Could not reach Sonyx. Try again.');
    ws.onclose = () => fail('The connection closed before the analysis finished.');
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ComposeEvent;
      if (msg.type === 'REPO_TREE') {
        const { nodes: tree, type: _t, ...m } = msg;
        void _t;
        nodes = tree;
        meta = m;
        onProgress(0, tree.filter((n) => n.role === 'source' || n.role === 'test').length);
      } else if (msg.type === 'NODE_METRICS') {
        nodes = nodes.map((n) => (n.id === msg.node.id ? msg.node : n));
        const code = nodes.filter((n) => n.role === 'source' || n.role === 'test');
        onProgress(code.filter((n) => n.analyzed).length, code.length);
      } else if (msg.type === 'EDGE_FOUND') {
        edges.push({ sourceId: msg.sourceId, targetId: msg.targetId });
      } else if (msg.type === 'COMPOSITION_READY') {
        if (!meta) return fail('No repository data received.');
        settled = true;
        ws.close();
        const dna = computeCodeDna(buildRepoModel(nodes, edges), meta);
        void submitRanking(meta, dna);
        resolve({ meta, dna, files: msg.totalAnalyzed });
      } else if (msg.type === 'ERROR') {
        fail(msg.message);
      }
    };
  });
}
