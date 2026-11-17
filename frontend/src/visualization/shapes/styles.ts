import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FileInfo } from '../../model/repoModel';
import type { StyleId } from '../../cosmetics/catalog';
import { box, windowedBox, windowedCylinder, withBeacon, type BuildingTraits, type Part, type ShapeRecipe } from './geometry';

/**
 * Building styles from the shop. Each returns a recipe for Code City, or null to use the classic
 * skyline. The same rules still apply: taller = more lines, more elaborate = more complex code,
 * modules are landmarks, async code gets a rooftop beacon.
 */
export function styledCity(style: StyleId, kind: FileInfo['kind'], h: number, w: number, traits: BuildingTraits): ShapeRecipe | null {
  if (style === 'style.classic') return null;
  // Tests, docs and config keep their classic shapes in every style (they read as "civic" buildings),
  // except where a style redraws them below.
  const make = style === 'style.future' ? future : style === 'style.kingdom' ? kingdom : pagoda;
  return make(kind, h, w, traits);
}

const cyl = (r: number, height: number, y: number, mat: Part['mat'] = 'accent', segments = 12): Part => ({
  geometry: new THREE.CylinderGeometry(r, r, height, segments),
  mat,
  position: [0, y + height / 2, 0],
});

const ring = (r: number, tube: number, y: number, tilt = 0): Part => ({
  geometry: new THREE.TorusGeometry(r, tube, 8, 48),
  mat: 'accent',
  position: [0, y, 0],
  rotation: [Math.PI / 2 + tilt, 0, 0],
  spin: true,
});

const roof = (r: number, height: number, y: number, sides = 4, x = 0, z = 0): Part => ({
  geometry: new THREE.ConeGeometry(r, height, sides),
  mat: 'accent',
  position: [x, y + height / 2, z],
  rotation: [0, sides === 4 ? Math.PI / 4 : 0, 0],
});

// ---------- Future City ----------
function future(kind: FileInfo['kind'], h: number, w: number, traits: BuildingTraits): ShapeRecipe | null {
  if (kind === 'module') {
    // Sky orb: a slim stem holding a glowing sphere with a halo.
    const stem = h * 0.75;
    const r = w * 0.6;
    return {
      anchorY: stem + r * 2 + 0.2,
      parts: [
        { geometry: windowedCylinder(w * 0.16, w * 0.3, stem, 10), mat: 'body', position: [0, stem / 2, 0] },
        { geometry: new THREE.SphereGeometry(r, 28, 18), mat: 'accent', position: [0, stem + r, 0] },
        ring(r * 1.7, 0.035, stem + r, 0.35),
        ring(r * 2.2, 0.025, stem + r, -0.5),
      ],
    };
  }
  if (kind !== 'source') return null;
  const cx = traits.complexity;
  if (cx < 0.25) {
    // Pod: a rounded drum with a glass dome and a light band.
    const bh = Math.max(0.45, h * 0.6);
    const r = w * 0.45;
    return withBeacon(
      {
        anchorY: bh + r * 0.7,
        parts: [
          { geometry: windowedCylinder(r, r, bh, 16), mat: 'body', position: [0, bh / 2, 0] },
          { geometry: new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat: 'accent', position: [0, bh, 0], scale: [1, 0.7, 1] },
          cyl(r * 1.04, 0.06, bh * 0.45),
        ],
      },
      traits,
    );
  }
  if (cx > 0.6) {
    // Needle: a slender round tower with floating rings and an orb on top.
    const r = w * 0.36;
    const parts: Part[] = [{ geometry: windowedCylinder(r * 0.75, r * 1.2, h, 14), mat: 'body', position: [0, h / 2, 0] }];
    const rings = h > 2.5 ? 3 : 2;
    for (let i = 0; i < rings; i++) parts.push(ring(r * (2 - i * 0.3), 0.03, h * (0.35 + i * 0.25), i % 2 ? 0.2 : -0.2));
    parts.push({ geometry: new THREE.SphereGeometry(r * 0.55, 14, 10), mat: 'accent', position: [0, h + r * 0.4, 0] });
    return withBeacon({ anchorY: h + r, parts }, traits);
  }
  // Twister: slabs rotating as they rise.
  const slabs = Math.max(3, Math.min(8, Math.round(h * 2.2)));
  const sh = h / slabs;
  const parts: Part[] = [];
  for (let i = 0; i < slabs; i++) {
    const g = windowedBox(w * 0.82, sh * 0.92, w * 0.82);
    g.rotateY(i * 0.16);
    parts.push({ geometry: g, mat: 'body', position: [0, i * sh + sh * 0.46, 0] });
  }
  const edge = new THREE.BoxGeometry(w * 0.86, 0.04, w * 0.86).rotateY((slabs - 1) * 0.16);
  parts.push({ geometry: edge, mat: 'accent', position: [0, h, 0] });
  return withBeacon({ anchorY: h + 0.1, parts }, traits);
}

// ---------- Kingdom ----------
/** Battlement teeth around the top of a square block, merged into one mesh. */
function merlons(w: number, y: number): Part {
  const n = 4;
  const size = w / (n * 2 - 1);
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const t = -w / 2 + size / 2 + i * size * 2;
    for (const [x, z] of [[t, -w / 2 + size / 2], [t, w / 2 - size / 2], [-w / 2 + size / 2, t], [w / 2 - size / 2, t]]) {
      geos.push(new THREE.BoxGeometry(size, size * 1.1, size).translate(x, 0, z));
    }
  }
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return { geometry: merged, mat: 'accent', position: [0, y + size * 0.55, 0] };
}

function turret(r: number, height: number, x: number, z: number): Part[] {
  return [
    { geometry: windowedCylinder(r, r * 1.1, height, 10), mat: 'body', position: [x, height / 2, z] },
    roof(r * 1.35, r * 3, height, 10, x, z),
  ];
}

function kingdom(kind: FileInfo['kind'], h: number, w: number, traits: BuildingTraits): ShapeRecipe | null {
  if (kind === 'module') {
    // Castle: a keep with battlements, four corner turrets and a curtain wall.
    const keep = Math.max(1.2, h * 0.85);
    const kw = w * 0.55;
    const tr = w * 0.13;
    const off = w * 0.42;
    return {
      anchorY: keep + 0.4,
      parts: [
        box(w * 0.95, keep * 0.32, w * 0.95, 0),
        merlons(w * 0.95, keep * 0.32),
        box(kw, keep, kw, 0),
        merlons(kw, keep),
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([sx, sz]) => turret(tr, keep * 0.65, sx * off, sz * off)),
        { geometry: new THREE.BoxGeometry(0.02, 0.5, 0.02), mat: 'accent', position: [0, keep + 0.45, 0] },
        { geometry: new THREE.BoxGeometry(0.28, 0.16, 0.01), mat: 'accent', position: [0.14, keep + 0.6, 0] },
      ],
    };
  }
  if (kind !== 'source') return null;
  const cx = traits.complexity;
  if (cx < 0.25) {
    // Cottage: a small house with a steep roof.
    const bh = Math.max(0.45, h * 0.6);
    return withBeacon({ anchorY: bh + 0.5, parts: [box(w * 0.8, bh, w * 0.7, 0), roof(w * 0.66, 0.55, bh)] }, traits);
  }
  if (cx > 0.6) {
    // Wizard tower: round, tall, with a pointed roof and a pennant.
    const r = w * 0.38;
    return withBeacon(
      {
        anchorY: h + r * 3.2,
        parts: [
          { geometry: windowedCylinder(r, r * 1.15, h, 12), mat: 'body', position: [0, h / 2, 0] },
          cyl(r * 1.18, 0.07, h),
          roof(r * 1.3, r * 3.2, h + 0.07, 12),
          { geometry: new THREE.BoxGeometry(0.2, 0.1, 0.01), mat: 'accent', position: [0.1, h + r * 3.4, 0] },
        ],
      },
      traits,
    );
  }
  // Keep: a square tower with battlements.
  return withBeacon({ anchorY: h + 0.2, parts: [box(w * 0.85, h, w * 0.85, 0), merlons(w * 0.85, h)] }, traits);
}

// ---------- Pagoda ----------
function pagoda(kind: FileInfo['kind'], h: number, w: number, traits: BuildingTraits): ShapeRecipe | null {
  if (kind !== 'source' && kind !== 'module') return null;
  const tiers = kind === 'module' ? 5 : Math.max(1, Math.min(5, Math.round(1 + traits.complexity * 2 + h * 0.6)));
  const parts: Part[] = [];
  const total = Math.max(0.7, kind === 'module' ? h * 1.05 : h);
  const th = total / tiers;
  let y = 0;
  let tw = w * 0.78;
  for (let i = 0; i < tiers; i++) {
    const bodyH = th * 0.7;
    parts.push(box(tw, bodyH, tw, y));
    y += bodyH;
    // Wide, shallow roof with upturned eaves (a flattened 4-sided cone, slightly wider at the corners).
    parts.push({ geometry: new THREE.ConeGeometry(tw * 0.95, th * 0.32, 4, 1, true), mat: 'accent', position: [0, y + th * 0.15, 0], rotation: [0, Math.PI / 4, 0] });
    parts.push({ geometry: new THREE.ConeGeometry(tw * 0.78, th * 0.3, 4), mat: 'accent', position: [0, y + th * 0.16, 0], rotation: [0, Math.PI / 4, 0] });
    y += th * 0.3;
    tw *= 0.8;
  }
  // Finial: a slim spire with rings.
  parts.push({ geometry: new THREE.CylinderGeometry(0.02, 0.03, 0.6, 6), mat: 'accent', position: [0, y + 0.3, 0] });
  for (let i = 0; i < 3; i++) parts.push({ geometry: new THREE.TorusGeometry(0.06 - i * 0.012, 0.012, 6, 16), mat: 'accent', position: [0, y + 0.15 + i * 0.12, 0], rotation: [Math.PI / 2, 0, 0] });
  return withBeacon({ anchorY: y + 0.6, parts }, traits);
}
