import { useCallback, useRef, useState } from 'react';
import { audioEngine, engineStore } from '../audio/AudioEngine';
import { defaultEnergy } from '../audio/composer';
import type { ComposeEvent, DependencyEdge, FileNode, RepoMeta } from '../types';

// Same-origin by default: works behind Caddy (wss://) in production and via the Vite proxy in dev.
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/compose`;

export type Phase = 'idle' | 'connecting' | 'analysing' | 'ready' | 'error';

/** Owns the WebSocket to the backend and the streamed repository data. */
export function useComposeStream() {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [edges, setEdges] = useState<DependencyEdge[]>([]);
  const [meta, setMeta] = useState<RepoMeta | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('Paste a public GitHub repo or pick a preset');
  const wsRef = useRef<WebSocket | null>(null);

  /**
   * @param fromGesture true when called from a click. Opening a link (?repo=…) composes without one:
   *        the visuals stream in right away and the music starts on the user's first click.
   */
  const compose = useCallback(async (repoUrl: string, fromGesture = true) => {
    // Must start inside the click handler: browsers only allow audio after a user gesture.
    const unlocked = fromGesture ? audioEngine.unlock() : null;
    audioEngine.stop();
    wsRef.current?.close();
    setNodes([]);
    setEdges([]);
    setMeta(null);
    setPhase('connecting');
    setStatus('Connecting to the Sonyx engine…');
    if (unlocked) await unlocked;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    let latest: FileNode[] = [];

    ws.onopen = () => {
      setStatus('Fetching repository topology…');
      ws.send(JSON.stringify({ repoUrl }));
    };
    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setPhase('error');
      setStatus(`Could not reach the backend at ${WS_URL}. Is it running?`);
    };
    ws.onmessage = (ev) => {
      if (wsRef.current !== ws) return;
      const msg = JSON.parse(ev.data) as ComposeEvent;
      switch (msg.type) {
        case 'REPO_TREE': {
          const { nodes: treeNodes, type: _t, ...m } = msg;
          void _t;
          latest = treeNodes;
          setMeta(m);
          setNodes(treeNodes);
          setPhase('analysing');
          setStatus(`Analysing ${m.repoName}…`);
          // Without unlocked audio, skip the "listening" intro; the full composition loads when ready.
          if (engineStore.get().ready) void audioEngine.beginAnalysis(m.repoName, defaultEnergy(m.stars));
          break;
        }
        case 'NODE_METRICS':
          latest = latest.map((n) => (n.id === msg.node.id ? msg.node : n));
          setNodes(latest);
          audioEngine.noteAnalysed(msg.node);
          break;
        case 'EDGE_FOUND':
          setEdges((prev) => [...prev, { sourceId: msg.sourceId, targetId: msg.targetId }]);
          break;
        case 'COMPOSITION_READY':
          setPhase('ready');
          setStatus(`${msg.totalAnalyzed} files composed · click any shape to inspect it`);
          ws.close();
          break;
        case 'ERROR':
          setPhase('error');
          setStatus(msg.message);
          audioEngine.stop();
          break;
      }
    };
  }, []);

  return { nodes, edges, meta, phase, status, compose };
}
