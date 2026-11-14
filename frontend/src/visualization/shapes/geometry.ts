import * as THREE from 'three';
import type { FileInfo } from '../../model/repoModel';
import type { ViewMode } from '../../types';

/** Windows per world unit on building façades. */
const WIN_X = 2.4;
const WIN_Y = 2.6;

let windowTexture: THREE.CanvasTexture | null = null;

/**
 * An 8×8 grid of windows, some lit brighter than others, some dark. Used as the emissive map of
 * buildings, so façades glow in the file's colour and flash when its note plays.
 * Pixel (0,0) is black: roofs map there so they stay dark.
 */
export function getWindowTexture(): THREE.CanvasTexture {
  if (windowTexture) return windowTexture;
  const size = 256;
  const cell = size / 8;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const r = rnd();
      const lit = r < 0.22 ? 0.04 : 0.35 + rnd() * 0.65;
      const v = Math.round(lit * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x * cell + cell * 0.22, y * cell + cell * 0.2, cell * 0.56, cell * 0.5);
    }
  }
  windowTexture = new THREE.CanvasTexture(canvas);
  windowTexture.wrapS = windowTexture.wrapT = THREE.RepeatWrapping;
  windowTexture.colorSpace = THREE.SRGBColorSpace;
  windowTexture.anisotropy = 4;
  return windowTexture;
}

let whiteTexture: THREE.DataTexture | null = null;

/**
 * A 1×1 white texture. Non-city views use it as the emissive map so every file material has the
 * same shader features in every view: switching views then never needs a shader recompile.
 */
export function getWhiteTexture(): THREE.DataTexture {
  if (whiteTexture) return whiteTexture;
  whiteTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  whiteTexture.colorSpace = THREE.SRGBColorSpace;
  whiteTexture.needsUpdate = true;
  return whiteTexture;
}

/** Box whose side UVs are in "window units" (so window size is constant), roofs mapped to black. */
function windowedBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  for (let face = 0; face < 6; face++) {
    const roof = face === 2 || face === 3;
    const faceW = face < 2 ? d : w;
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      if (roof) uv.setXY(i, 0.001, 0.001);
      else uv.setXY(i, uv.getX(i) * faceW * WIN_X / 8, uv.getY(i) * h * WIN_Y / 8);
    }
  }
  uv.needsUpdate = true;
  return g;
}

/** Cylinder with window-unit UVs on its side and dark caps. */
function windowedCylinder(rTop: number, rBottom: number, h: number, segments: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, false);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const sideVerts = (segments + 1) * 2;
  const circumference = Math.PI * (rTop + rBottom);
  for (let i = 0; i < uv.count; i++) {
    if (i < sideVerts) uv.setXY(i, uv.getX(i) * circumference * WIN_X / 8, uv.getY(i) * h * WIN_Y / 8);
    else uv.setXY(i, 0.001, 0.001);
  }
  uv.needsUpdate = true;
  return g;
}

export interface Part {
  geometry: THREE.BufferGeometry;
  /** "body" is the main (windowed in City) material, "accent" a solid glow for crowns, rings, roofs. */
  mat: 'body' | 'accent';
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /** Rotates continuously (rings), faster with more concurrency. */
  spin?: boolean;
}

export interface ShapeRecipe {
  parts: Part[];
  /** Where cables attach, relative to the file's base position. */
  anchorY: number;
}

/** Optional per-file traits that pick the City building style. */
export interface BuildingTraits {
  /** 0–1 complexity level. */
  complexity: number;
  /** Uses async/concurrency. */
  concurrent: boolean;
}

/**
 * Geometry per file role and view.
 *  City (by role, and for source files by complexity):
 *    simple → low-rise block · moderate → office with setbacks · complex → tower with antenna ·
 *    very complex → tapered spire skyscraper · module → round landmark tower with halo ring ·
 *    test → research lab with rooftop dish · docs → library with a pediment · config → utility house.
 *    Files using concurrency get a rooftop beacon.
 *  Galaxy: crystal planet · ringed planet · octahedron · flat torus · small moon.
 *  Tree:   leaf · blossom · crystal · flower · bud.
 */
export function shapeFor(
  kind: FileInfo['kind'],
  mode: ViewMode,
  h: number,
  s: number,
  footprint: number,
  traits: BuildingTraits = { complexity: 0.3, concurrent: false },
): ShapeRecipe {
  if (mode === 'city') return cityShape(kind, h, footprint, traits);
  if (mode === 'tree') return treeShape(kind, s);
  return galaxyShape(kind, s);
}

const box = (w: number, h: number, d: number, y: number, mat: Part['mat'] = 'body', x = 0, z = 0): Part => ({
  geometry: mat === 'body' ? windowedBox(w, h, d) : new THREE.BoxGeometry(w, h, d),
  mat,
  position: [x, y + h / 2, z],
});

/** A glowing band around the top of a block (roof parapet / setback crown). */
const crown = (w: number, d: number, y: number): Part => ({ geometry: new THREE.BoxGeometry(w * 1.03, 0.05, d * 1.03), mat: 'accent', position: [0, y, 0] });

function withBeacon(recipe: ShapeRecipe, traits: BuildingTraits): ShapeRecipe {
  if (!traits.concurrent) return recipe;
  // Concurrency: a small rooftop beacon on a mast.
  recipe.parts.push(
    { geometry: new THREE.CylinderGeometry(0.015, 0.015, 0.35, 5), mat: 'accent', position: [0, recipe.anchorY + 0.17, 0] },
    { geometry: new THREE.OctahedronGeometry(0.07, 0), mat: 'accent', position: [0, recipe.anchorY + 0.4, 0] },
  );
  recipe.anchorY += 0.45;
  return recipe;
}

function cityShape(kind: FileInfo['kind'], h: number, w: number, traits: BuildingTraits): ShapeRecipe {
  switch (kind) {
    case 'module': {
      // Landmark: round tower with a dome, spire and rotating halo ring.
      const r = w * 0.48;
      const towerH = h * 0.9;
      return withBeacon(
        {
          anchorY: towerH + 0.9,
          parts: [
            { geometry: windowedCylinder(r * 0.85, r, towerH, 16), mat: 'body', position: [0, towerH / 2, 0] },
            { geometry: new THREE.SphereGeometry(r * 0.85, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat: 'accent', position: [0, towerH, 0] },
            { geometry: new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), mat: 'accent', position: [0, towerH + r * 0.85 + 0.3, 0] },
            { geometry: new THREE.TorusGeometry(r * 1.7, 0.03, 8, 48), mat: 'accent', position: [0, towerH + 0.25, 0], rotation: [Math.PI / 2.3, 0, 0], spin: true },
          ],
        },
        { ...traits, concurrent: false },
      );
    }
    case 'config': {
      // Utility house: a small block with a pyramid roof.
      const bh = Math.max(0.45, h * 0.55);
      return {
        anchorY: bh + 0.45,
        parts: [
          box(w * 0.85, bh, w * 0.85, 0),
          { geometry: new THREE.ConeGeometry(w * 0.66, 0.5, 4), mat: 'accent', position: [0, bh + 0.25, 0], rotation: [0, Math.PI / 4, 0] },
        ],
      };
    }
    case 'test': {
      // Research lab: wide low block, glowing glass band, rooftop dish on a mast.
      const bh = Math.max(0.55, Math.min(1.6, h * 2));
      return withBeacon(
        {
          anchorY: bh + 0.35,
          parts: [
            box(w, bh, w * 0.8, 0),
            { geometry: new THREE.BoxGeometry(w * 1.02, 0.08, w * 0.82), mat: 'accent', position: [0, bh * 0.55, 0] },
            crown(w, w * 0.8, bh),
            { geometry: new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5), mat: 'accent', position: [w * 0.2, bh + 0.11, 0] },
            { geometry: new THREE.ConeGeometry(0.17, 0.09, 12, 1, true), mat: 'accent', position: [w * 0.2, bh + 0.25, 0], rotation: [Math.PI * 0.85, 0, 0] },
          ],
        },
        traits,
      );
    }
    case 'docs': {
      // Library: low block with a triangular pediment over the entrance.
      const bh = 0.55;
      // A 3-sided prism lying along z, flattened: its triangular face points to the street, peak up.
      const r = w * 0.46;
      const pediment = new THREE.CylinderGeometry(r, r, w * 0.65, 3);
      return {
        anchorY: bh + 0.3,
        parts: [
          box(w * 0.8, bh, w * 0.65, 0),
          { geometry: pediment, mat: 'accent', position: [0, bh + 0.225 * r, 0], rotation: [-Math.PI / 2, 0, 0], scale: [1, 1, 0.45] },
          { geometry: new THREE.BoxGeometry(w * 0.86, 0.06, w * 0.75), mat: 'accent', position: [0, 0.03, 0] },
        ],
      };
    }
    default:
      return withBeacon(sourceBuilding(h, w, traits.complexity), traits);
  }
}

/** Source files: the more complex the code, the more elaborate the building. */
function sourceBuilding(h: number, w: number, cx: number): ShapeRecipe {
  if (cx < 0.25) {
    // Simple: a plain low-rise block with a rooftop unit.
    const bh = Math.max(0.5, h * 0.7);
    return {
      anchorY: bh + 0.15,
      parts: [box(w, bh, w * 0.9, 0), crown(w, w * 0.9, bh), box(w * 0.3, 0.15, w * 0.25, bh, 'accent', w * 0.15, -w * 0.1)],
    };
  }
  if (cx > 0.75 && h > 1.4) {
    // Very complex: a tapered spire skyscraper.
    const shaft = h * 0.88;
    const g = windowedCylinder(w * 0.36, w * 0.62, shaft, 4);
    g.rotateY(Math.PI / 4);
    return {
      anchorY: h + 0.8,
      parts: [
        { geometry: g, mat: 'body', position: [0, shaft / 2, 0] },
        { geometry: new THREE.ConeGeometry(w * 0.25, h * 0.12 + 0.8, 4), mat: 'accent', position: [0, shaft + (h * 0.12 + 0.8) / 2, 0], rotation: [0, Math.PI / 4, 0] },
      ],
    };
  }
  // Moderate → offices with setbacks; complex → more setbacks and an antenna.
  const parts: Part[] = [];
  const tiers = cx > 0.5 ? (h > 2.5 ? 3 : 2) : h > 2 ? 2 : 1;
  const split = tiers === 3 ? [0.58, 0.28, 0.14] : tiers === 2 ? [0.7, 0.3] : [1];
  let y = 0;
  let tw = w;
  split.forEach((f, i) => {
    const th = h * f;
    parts.push(box(tw, th, tw, y));
    y += th;
    parts.push(crown(tw, tw, y));
    if (i < split.length - 1) tw *= 0.72;
  });
  if (cx > 0.5) {
    parts.push({ geometry: new THREE.CylinderGeometry(0.02, 0.03, 0.9, 6), mat: 'accent', position: [0, y + 0.45, 0] });
    y += 0.9;
  }
  return { anchorY: y, parts };
}

function galaxyShape(kind: FileInfo['kind'], s: number): ShapeRecipe {
  switch (kind) {
    case 'module':
      return {
        anchorY: 0,
        parts: [
          { geometry: new THREE.SphereGeometry(s * 1.15, 24, 16), mat: 'body' },
          { geometry: new THREE.TorusGeometry(s * 2, s * 0.08, 8, 48), mat: 'accent', rotation: [Math.PI / 2.3, 0, 0], spin: true },
        ],
      };
    case 'config':
      return { anchorY: 0, parts: [{ geometry: new THREE.OctahedronGeometry(s, 0), mat: 'body' }] };
    case 'test':
      return { anchorY: 0, parts: [{ geometry: new THREE.TorusGeometry(s * 1.05, s * 0.28, 10, 32), mat: 'accent', rotation: [Math.PI / 2, 0, 0] }] };
    case 'docs':
      return { anchorY: 0, parts: [{ geometry: new THREE.SphereGeometry(s * 0.6, 16, 12), mat: 'body' }] };
    default:
      return { anchorY: 0, parts: [{ geometry: new THREE.IcosahedronGeometry(s, 0), mat: 'body' }] };
  }
}

function treeShape(kind: FileInfo['kind'], s: number): ShapeRecipe {
  switch (kind) {
    case 'module':
      // Blossom: a glowing fruit with a small halo.
      return {
        anchorY: 0,
        parts: [
          { geometry: new THREE.SphereGeometry(s * 0.95, 20, 14), mat: 'accent' },
          { geometry: new THREE.TorusGeometry(s * 1.5, s * 0.07, 8, 36), mat: 'accent', rotation: [Math.PI / 2.2, 0, 0], spin: true },
        ],
      };
    case 'config':
      return { anchorY: 0, parts: [{ geometry: new THREE.OctahedronGeometry(s * 0.8, 0), mat: 'accent' }] };
    case 'test':
      return { anchorY: 0, parts: [{ geometry: new THREE.TorusGeometry(s * 0.75, s * 0.25, 8, 20), mat: 'accent', rotation: [Math.PI / 2, 0, 0] }] };
    case 'docs':
      return { anchorY: 0, parts: [{ geometry: new THREE.SphereGeometry(s * 0.5, 12, 8), mat: 'body' }] };
    default:
      // Leaf: a flattened, pointed ellipsoid.
      return {
        anchorY: 0,
        parts: [{ geometry: new THREE.SphereGeometry(1, 14, 8), mat: 'body', scale: [s * 1.5, s * 0.28, s * 0.85] }],
      };
  }
}
