import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityPlan, Rect } from './layouts';
import type { WorldDef } from '../cosmetics/catalog';
import { PALETTE } from './palette';
import { pulses } from './pulseBus';
import { noRaycast } from './worlds/random';

/**
 * Everything static in Code City except the buildings: asphalt, lane markings, parks with trees,
 * the river, bridges and streetlights.
 *
 * Built for speed: rectangles of the same kind are merged into one mesh, and repeated objects
 * (trees, lamps, lane markings) are instanced, so the whole landscape is about ten draw calls no
 * matter how big the repository is. Materials are shared for the app's lifetime, so their shaders
 * compile once.
 */

let mats: ReturnType<typeof createMaterials> | null = null;
function createMaterials() {
  return {
    asphalt: new THREE.MeshStandardMaterial({ color: '#0a0f20', roughness: 0.95 }),
    park: new THREE.MeshStandardMaterial({ color: '#0c2a2c', emissive: '#0f766e', emissiveIntensity: 0.12, roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: '#0b3a66', emissive: '#1d6fb8', emissiveIntensity: 0.4, roughness: 0.12, metalness: 0.35 }),
    deck: new THREE.MeshStandardMaterial({ color: '#1b2540', roughness: 0.7 }),
    rail: new THREE.MeshStandardMaterial({ color: PALETTE.lavender, emissive: PALETTE.lavender, emissiveIntensity: 0.6, toneMapped: false }),
    dash: new THREE.MeshBasicMaterial({ color: '#fde68a', toneMapped: false }),
    pole: new THREE.MeshStandardMaterial({ color: '#1e293b' }),
    bulb: new THREE.MeshBasicMaterial({ color: '#fde68a', toneMapped: false }),
    trunk: new THREE.MeshStandardMaterial({ color: '#2a2150', roughness: 0.9 }),
    canopy: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#0f766e', emissiveIntensity: 0.25, roughness: 0.6, flatShading: true }),
  };
}
const getMats = () => (mats ??= createMaterials());

// Base colours of the animated parts, set from the current world (see applyWorld).
const LAMP = new THREE.Color('#fde68a');
const DASH = new THREE.Color('#fde68a');
const RAIL = new THREE.Color('#a78bfa');

/** Recolours the shared scenery materials for a world from the shop. Colour changes never recompile shaders. */
function applyWorld(w: WorldDef) {
  const m = getMats();
  m.asphalt.color.set(w.asphalt);
  m.park.color.set(w.park);
  m.park.emissive.set(w.parkGlow);
  m.water.color.set(w.water);
  m.water.emissive.set(w.waterGlow);
  LAMP.set(w.lamp);
  DASH.set(w.lamp);
  RAIL.set(w.rail);
  m.rail.color.copy(RAIL);
  m.rail.emissive.copy(RAIL);
}
const GROUND_Y = -0.13;

/** One merged mesh for many boxes (parks, decks, rails). */
function boxes(rects: { r: Rect; h: number; y: number }[], material: THREE.Material): THREE.Mesh | null {
  if (rects.length === 0) return null;
  const geos = rects.map(({ r, h, y }) => new THREE.BoxGeometry(r.w, h, r.d).translate(r.x, y + h / 2, r.z));
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return new THREE.Mesh(merged, material);
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[]): THREE.InstancedMesh | null {
  if (matrices.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function buildScenery(plan: CityPlan, canopyColors: THREE.Color[]) {
  const m = getMats();
  const objects: THREE.Object3D[] = [];
  const add = (o: THREE.Object3D | null) => o && objects.push(o);
  const tmp = new THREE.Object3D();
  const at = (x: number, y: number, z: number, rotY = 0, s = 1) => {
    tmp.position.set(x, y, z);
    tmp.rotation.set(0, rotY, 0);
    tmp.scale.setScalar(s);
    tmp.updateMatrix();
    return tmp.matrix.clone();
  };

  // Asphalt base: every gap between districts reads as a street.
  const g = plan.ground;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(g.w + 2, g.d + 2).rotateX(-Math.PI / 2).translate(g.x, GROUND_Y, g.z), m.asphalt);
  add(ground);

  add(boxes(plan.parks.map((r) => ({ r, h: 0.1, y: GROUND_Y })), m.park));

  if (plan.river) {
    const r = plan.river;
    add(new THREE.Mesh(new THREE.PlaneGeometry(r.w + 2, r.d).rotateX(-Math.PI / 2).translate(r.x, GROUND_Y + 0.012, r.z), m.water));
    // Glowing embankments along both banks.
    add(
      boxes(
        [-1, 1].map((side) => ({ r: { x: r.x, z: r.z + (side * r.d) / 2, w: r.w + 2, d: 0.06 }, h: 0.06, y: GROUND_Y })),
        m.rail,
      ),
    );
  }

  // Bridges: deck + glowing railings on both sides.
  add(boxes(plan.bridges.map((r) => ({ r, h: 0.09, y: GROUND_Y + 0.02 })), m.deck));
  add(
    boxes(
      plan.bridges.flatMap((r) => [-1, 1].map((side) => ({ r: { x: r.x + (side * r.w) / 2, z: r.z, w: 0.04, d: r.d }, h: 0.16, y: GROUND_Y + 0.11 }))),
      m.rail,
    ),
  );

  // Lane markings.
  add(
    instanced(
      new THREE.BoxGeometry(0.38, 0.012, 0.055),
      m.dash,
      plan.dashes.map((d) => at(d.x, GROUND_Y + 0.008, d.z, d.alongX ? 0 : Math.PI / 2)),
    ),
  );

  // Streetlights at district corners: they pulse with the kick drum.
  add(instanced(new THREE.CylinderGeometry(0.018, 0.024, 0.7, 5), m.pole, plan.lamps.map(([x, z]) => at(x, GROUND_Y + 0.35, z))));
  add(instanced(new THREE.SphereGeometry(0.055, 8, 6), m.bulb, plan.lamps.map(([x, z]) => at(x, GROUND_Y + 0.72, z))));

  // Park trees, with a few colour variations.
  add(instanced(new THREE.CylinderGeometry(0.03, 0.045, 0.3, 5), m.trunk, plan.trees.map(([x, z, s]) => at(x, GROUND_Y + 0.1 + 0.15 * s, z, 0, s))));
  const canopies = instanced(
    new THREE.IcosahedronGeometry(0.26, 0),
    m.canopy,
    plan.trees.map(([x, z, s], i) => at(x, GROUND_Y + 0.1 + 0.42 * s, z, i, s)),
  );
  if (canopies) {
    plan.trees.forEach((_, i) => canopies.setColorAt(i, canopyColors[i % canopyColors.length]));
    canopies.instanceColor!.needsUpdate = true;
    add(canopies);
  }

  return {
    objects,
    dispose: () =>
      objects.forEach((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        (o as THREE.InstancedMesh).dispose?.();
      }),
  };
}

export function CityScenery({ plan, visible, world }: { plan: CityPlan | undefined; visible: boolean; world: WorldDef }) {
  // Rebuilt only when the city's shape (or the world's tree colours) changes, not on every streamed metric.
  const signature = plan?.signature ?? '';
  const canopy = world.canopy.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => (plan ? buildScenery(plan, canopy.split(',').map((c) => new THREE.Color(c))) : null), [signature, canopy]);
  useEffect(() => applyWorld(world), [world]);
  useEffect(() => () => built?.dispose(), [built]);

  useFrame(() => {
    const m = getMats();
    const beat = pulses.ground; // decayed by <Ground/>
    m.bulb.color.copy(LAMP).multiplyScalar(0.55 + beat * 0.45);
    m.dash.color.copy(DASH).multiplyScalar(0.18 + beat * 0.12);
    m.water.emissiveIntensity = 0.38 + beat * 0.15;
    m.rail.emissiveIntensity = 0.5 + beat * 0.4;
    m.rail.emissive.copy(RAIL);
  });

  if (!built) return null;
  return (
    <group visible={visible}>
      {built.objects.map((o) => (
        <primitive key={o.uuid} object={o} raycast={noRaycast} />
      ))}
    </group>
  );
}
