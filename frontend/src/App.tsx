import { useState, useRef } from 'react';
import { CodeSculpture } from './CodeSculpture';
import { audioEngine } from './audioEngine';
import type { ComposeEvent, FileNode, DependencyEdge } from './types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080/ws/compose';

const PRESETS = [
  { label: 'Express', url: 'https://github.com/expressjs/express' },
  { label: 'PetClinic', url: 'https://github.com/spring-projects/spring-petclinic' },
];

const secondaryButton: React.CSSProperties = {
  background: '#16213e',
  color: '#cbd5e1',
  border: '1px solid #2b3556',
  borderRadius: '8px',
  padding: '8px 12px',
  cursor: 'pointer',
};

export default function App() {
  const [repoUrl, setRepoUrl] = useState(PRESETS[0].url);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [edges, setEdges] = useState<DependencyEdge[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [status, setStatus] = useState('Paste a GitHub repo or pick a preset');
  const [playing, setPlaying] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const composeRepo = async (targetUrl = repoUrl) => {
    setRepoUrl(targetUrl);
    audioEngine.stopTour();
    setPlaying(false);
    setNodes([]);
    setEdges([]);
    setActiveNodeId(null);
    setStatus('Connecting to CodeFugue engine...');

    // Must run inside the click handler: browsers only allow audio after a user gesture.
    await audioEngine.init(112);

    wsRef.current?.close();
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    let latestNodes: FileNode[] = [];
    let latestEdges: DependencyEdge[] = [];

    ws.onopen = () => {
      setStatus('Fetching repository topology...');
      ws.send(JSON.stringify({ repoUrl: targetUrl }));
    };

    ws.onerror = () => setStatus(`Could not reach the backend at ${WS_URL}. Is it running?`);

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data) as ComposeEvent;
      switch (msg.type) {
        case 'REPO_TREE':
          await audioEngine.init(msg.bpm);
          latestNodes = msg.nodes;
          setNodes([...latestNodes]);
          setStatus(`Performing ${msg.repoName} (${msg.bpm} BPM)...`);
          break;
        case 'NODE_METRICS':
          latestNodes = latestNodes.map((n) => (n.id === msg.node.id ? msg.node : n));
          setNodes([...latestNodes]);
          setActiveNodeId(msg.node.id);
          audioEngine.triggerNode(msg.node);
          break;
        case 'EDGE_FOUND':
          latestEdges = [...latestEdges, { sourceId: msg.sourceId, targetId: msg.targetId }];
          setEdges(latestEdges);
          break;
        case 'COMPOSITION_READY':
          setStatus(`Composition live · ${msg.totalAnalyzed} modules · Click any tower to play`);
          setPlaying(true);
          audioEngine.startCompositionTour(latestNodes, setActiveNodeId);
          break;
        case 'ERROR':
          setStatus(`Error: ${msg.message}`);
          break;
      }
    };
  };

  const togglePlayback = () => {
    if (playing) {
      audioEngine.stopTour();
      setPlaying(false);
    } else {
      setPlaying(true);
      audioEngine.startCompositionTour(nodes, setActiveNodeId);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          zIndex: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          background: 'rgba(10, 14, 26, 0.85)',
          backdropFilter: 'blur(10px)',
          padding: '12px 16px',
          borderRadius: '12px',
          border: '1px solid rgba(0, 245, 212, 0.25)',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <strong style={{ color: '#00f5d4', letterSpacing: '0.05em' }}>CODEFUGUE</strong>
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && composeRepo(repoUrl)}
          placeholder="https://github.com/owner/repo"
          style={{
            flex: 1,
            minWidth: 200,
            background: '#060811',
            border: '1px solid #2b3556',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#fff',
            fontFamily: 'monospace',
          }}
        />
        <button
          onClick={() => composeRepo(repoUrl)}
          style={{
            background: '#00f5d4',
            color: '#060811',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Compose
        </button>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => composeRepo(p.url)} style={secondaryButton}>
            Preset: {p.label}
          </button>
        ))}
        {nodes.length > 0 && (
          <button
            onClick={togglePlayback}
            style={{
              background: '#ff006e',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {playing ? 'Pause Tour' : 'Resume Tour'}
          </button>
        )}
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{status}</span>
      </div>

      <CodeSculpture
        nodes={nodes}
        edges={edges}
        activeNodeId={activeNodeId}
        onSelectNode={(node) => {
          setActiveNodeId(node.id);
          audioEngine.triggerNode(node);
        }}
      />
    </div>
  );
}
