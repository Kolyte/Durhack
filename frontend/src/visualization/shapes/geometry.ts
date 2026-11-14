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

/**
 * Geometry per file role and view.
 *  City:   source = stepped skyscraper · module = round landmark tower with halo ring · config = small
 *          building with pyramid roof · test = stadium · docs = little library kiosk.
 *  Galaxy: crystal planet · ringed planet · octahedron · flat torus · small moon.
 *  Tree:   leaf · blossom · crystal · flower · bud.
 */
export function shapeFor(kind: FileInfo['kind'], mode: ViewMode, h: number, s: number, footprint: number): ShapeRecipe {
  if (mode === 'city') return cityShape(kind, h, footprint);
  if (mode === 'tree') return treeShape(kind, s);
  return galaxyShape(kind, s);
}

function cityShape(kind: FileInfo['kind'], h: number, w: number): ShapeRecipe {
  switch (kind) {
    case 'module': {
      const r = w * 0.48;
      const towerH = h * 0.9;
      return {
        anchorY: towerH + 0.9,
        parts: [
          { geometry: windowedCylinder(r * 0.85, r, towerH, 16), mat: 'body', position: [0, towerH / 2, 0] },
          { geometry: new THREE.SphereGeometry(r * 0.85, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat: 'accent', position: [0, towerH, 0] },
          { geometry: new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), mat: 'accent', position: [0, towerH + r * 0.85 + 0.3, 0] },
          { geometry: new THREE.TorusGeometry(r * 1.7, 0.03, 8, 48), mat: 'accent', position: [0, towerH + 0.25, 0], rotation: [Math.PI / 2.3, 0, 0], spin: true },
        ],
      };
    }
    case 'config': {
      const bh = Math.max(0.45, h * 0.55);
      return {
        anchorY: bh + 0.45,
        parts: [
          { geometry: windowedBox(w * 0.85, bh, w * 0.85), mat: 'body', position: [0, bh / 2, 0] },
          { geometry: new THREE.ConeGeometry(w * 0.66, 0.5, 4), mat: 'accent', position: [0, bh + 0.25, 0], rotation: [0, Math.PI / 4, 0] },
        ],
      };
    }
    case 'test':
      return {
        anchorY: 0.3,
        parts: [
          { geometry: windowedCylinder(w * 0.62, w * 0.66, 0.26, 28), mat: 'body', position: [0, 0.13, 0] },
          { geometry: new THREE.TorusGeometry(w * 0.6, 0.035, 8, 40), mat: 'accent', position: [0, 0.27, 0], rotation: [Math.PI / 2, 0, 0] },
          { geometry: new THREE.CircleGeometry(w * 0.42, 28), mat: 'accent', position: [0, 0.2, 0], rotation: [-Math.PI / 2, 0, 0], scale: [1, 1, 1] },
        ],
      };
    case 'docs':
      return {
        anchorY: 0.6,
        parts: [
          { geometry: windowedBox(w * 0.6, 0.42, w * 0.6), mat: 'body', position: [0, 0.21, 0] },
          { geometry: new THREE.SphereGeometry(w * 0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat: 'accent', position: [0, 0.42, 0] },
        ],
      };
    default: {
      // Stepped skyscraper: taller files get more setbacks, the tallest get an antenna.
      const parts: Part[] = [];
      const tiers = h > 3.2 ? 3 : h > 1.6 ? 2 : 1;
      const split = tiers === 3 ? [0.58, 0.28, 0.14] : tiers === 2 ? [0.7, 0.3] : [1];
      let y = 0;
      let tw = w;
      split.forEach((f, i) => {
        const th = h * f;
        parts.push({ geometry: windowedBox(tw, th, tw), mat: 'body', position: [0, y + th / 2, 0] });
        y += th;
        // Glowing crown band at each setback.
        parts.push({ geometry: new THREE.BoxGeometry(tw * 1.02, 0.05, tw * 1.02), mat: 'accent', position: [0, y, 0] });
        if (i < split.length - 1) tw *= 0.72;
      });
      if (h > 4) {
        parts.push({ geometry: new THREE.CylinderGeometry(0.02, 0.03, 0.9, 6), mat: 'accent', position: [0, y + 0.45, 0] });
        y += 0.9;
      }
      return { anchorY: y, parts };
    }
  }
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
