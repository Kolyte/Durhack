import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, QuadraticBezierLine, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { FileNode, DependencyEdge } from './types';

const TARGET_SCALE = new THREE.Vector3();

function NodeTower({
  node,
  active,
  onSelect,
}: {
  node: FileNode;
  active: boolean;
  onSelect: (node: FileNode) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const height = Math.min(4.5, Math.max(0.4, node.loc / 90));

  const t = Math.min(1, node.complexity / 25);
  const color = new THREE.Color().setHSL(0.48 - t * 0.56, 0.95, 0.55);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const s = active ? 1.55 : 1.0;
    meshRef.current.scale.lerp(TARGET_SCALE.set(s, s, s), Math.min(1, delta * 10));
    meshRef.current.rotation.y += delta * (0.2 + node.concurrency * 0.15);
  });

  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node);
        }}
      >
        <cylinderGeometry args={[0.22, 0.32, height, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 3.2 : node.analyzed ? 1.1 : 0.25}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      {active && (
        <Html position={[0, height / 2 + 0.6, 0]} center distanceFactor={14}>
          <div
            style={{
              background: 'rgba(10, 14, 26, 0.88)',
              border: '1px solid #00f5d4',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              whiteSpace: 'nowrap',
              fontFamily: 'monospace',
            }}
          >
            {node.path.split('/').pop()} · CC:{node.complexity} · LOC:{node.loc}
          </div>
        </Html>
      )}
    </group>
  );
}

export function CodeSculpture({
  nodes,
  edges,
  activeNodeId,
  onSelectNode,
}: {
  nodes: FileNode[];
  edges: DependencyEdge[];
  activeNodeId: string | null;
  onSelectNode: (node: FileNode) => void;
}) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <Canvas camera={{ position: [0, 8, 16], fov: 50 }} style={{ background: '#060811' }}>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 15, 10]} intensity={1.5} color="#00f5d4" />
      <pointLight position={[-10, -10, -10]} intensity={1.0} color="#ff006e" />
      <gridHelper args={[32, 32, '#16213e', '#0d1326']} position={[0, -3.5, 0]} />

      {nodes.map((node) => (
        <NodeTower key={node.id} node={node} active={node.id === activeNodeId} onSelect={onSelectNode} />
      ))}

      {edges.map((edge, idx) => {
        const src = nodeMap.get(edge.sourceId);
        const dst = nodeMap.get(edge.targetId);
        if (!src || !dst) return null;
        const isLit = src.id === activeNodeId || dst.id === activeNodeId;
        return (
          <QuadraticBezierLine
            key={`${edge.sourceId}-${edge.targetId}-${idx}`}
            start={[src.x, src.y, src.z]}
            end={[dst.x, dst.y, dst.z]}
            mid={[(src.x + dst.x) / 2, Math.max(src.y, dst.y) + 2.2, (src.z + dst.z) / 2]}
            color={isLit ? '#00f5d4' : '#3a0ca3'}
            lineWidth={isLit ? 2.2 : 0.8}
            transparent
            opacity={isLit ? 0.95 : 0.35}
          />
        );
      })}

      <OrbitControls autoRotate autoRotateSpeed={0.6} enableDamping />
      <EffectComposer>
        <Bloom intensity={1.35} luminanceThreshold={0.25} mipmapBlur />
      </EffectComposer>
    </Canvas>
  );
}
