import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StyleId } from '../../cosmetics/catalog';
import { styledCity } from './styles';
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

type CanvasPaint = (ctx: CanvasRenderingContext2D, size: number, rnd: () => number) => void;
const canvasCache = new Map<string, THREE.CanvasTexture>();

/** A cached grayscale canvas texture (used as an emissive map, so it shapes the glow of the file's colour). */
export function paintedTexture(key: string, size: number, paint: CanvasPaint, repeat = false): THREE.CanvasTexture {
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  let seed = key.length * 7919 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  paint(ctx, size, rnd);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  else t.wrapS = THREE.RepeatWrapping;
  canvasCache.set(key, t);
  return t;
}

export type PlanetSurface = 'gas' | 'rock' | 'ocean' | 'ice';

/** Planet surfaces, all procedural: gas-giant bands, cratered rock, oceans with continents, icy swirls. */
export function getPlanetTexture(surface: PlanetSurface): THREE.CanvasTexture {
  return paintedTexture(`planet-${surface}`, 256, (ctx, size, rnd) => {
    const g = (v: number) => `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`;
    if (surface === 'gas') {
      // Horizontal bands of varying width and brightness, with a few soft storms.
      let y = 0;
      while (y < size) {
        const h = 4 + rnd() * 22;
        ctx.fillStyle = g(0.35 + rnd() * 0.65);
        ctx.fillRect(0, y, size, h + 1);
        y += h;
      }
      ctx.filter = 'blur(2px)';
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.filter = 'none';
      for (let i = 0; i < 3; i++) {
        const x = rnd() * size, cy = size * (0.3 + rnd() * 0.4), r = 8 + rnd() * 14;
        const grad = ctx.createRadialGradient(x, cy, 0, x, cy, r);
        grad.addColorStop(0, g(1));
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(x, cy, r * 1.8, r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    // Rock / ocean / ice: noisy base with features.
    ctx.fillStyle = g(surface === 'ice' ? 0.75 : surface === 'ocean' ? 0.3 : 0.5);
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = g(rnd() * (surface === 'ice' ? 1 : 0.8));
      ctx.globalAlpha = 0.08;
      const r = 2 + rnd() * 10;
      ctx.beginPath();
      ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (surface === 'rock') {
      // Craters: dark bowl with a bright rim.
      for (let i = 0; i < 26; i++) {
        const x = rnd() * size, y = size * (0.1 + rnd() * 0.8), r = 3 + rnd() * rnd() * 22;
        ctx.fillStyle = g(0.18);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = g(0.95); ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.beginPath(); ctx.arc(x - r * 0.1, y - r * 0.1, r, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
      }
    } else if (surface === 'ocean') {
      // Continents: bright blobs on a dark sea, plus white polar caps.
      for (let i = 0; i < 9; i++) {
        const cx = rnd() * size, cy = size * (0.2 + rnd() * 0.6);
        ctx.fillStyle = g(0.85);
        for (let j = 0; j < 14; j++) {
          ctx.beginPath();
          ctx.arc(cx + (rnd() - 0.5) * 50, cy + (rnd() - 0.5) * 30, 5 + rnd() * 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = g(1);
      ctx.fillRect(0, 0, size, size * 0.07);
      ctx.fillRect(0, size * 0.93, size, size * 0.07);
    } else {
      // Ice: long cracks.
      ctx.strokeStyle = g(0.25);
      for (let i = 0; i < 40; i++) {
        ctx.lineWidth = 0.5 + rnd() * 1.5;
        ctx.beginPath();
        let x = rnd() * size, y = rnd() * size;
        ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 30; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
  });
}

/** Leaf surface: bright midrib and veins on a softer blade (tree view). */
export function getLeafTexture(): THREE.CanvasTexture {
  return paintedTexture('leaf', 128, (ctx, size) => {
    ctx.fillStyle = 'rgb(120,120,120)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgb(255,255,255)';
    ctx.lineWidth = 3;
    // Sphere UVs: u goes around (x), v from pole to pole (y). The midrib runs around the long axis.
    ctx.beginPath(); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 10; i++) {
      const x = (i / 10) * size;
      ctx.beginPath(); ctx.moveTo(x, size / 2); ctx.lineTo(x + 10, size * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, size / 2); ctx.lineTo(x + 10, size * 0.85); ctx.stroke();
    }
  });
}

/** Which texture each file's body uses as its glow map in the galaxy/tree views. */
export function bodyMapFor(kind: FileInfo['kind'], mode: ViewMode, complexity: number): THREE.Texture | null {
  if (mode === 'galaxy') {
    if (kind === 'module') return getPlanetTexture('gas');
    if (kind === 'docs') return getPlanetTexture('rock');
    if (kind === 'config') return getPlanetTexture('ice');
    return getPlanetTexture(complexity > 0.6 ? 'gas' : complexity > 0.3 ? 'ocean' : 'rock');
  }
  if (mode === 'tree' && kind === 'source') return getLeafTexture();
  return null;
}

/** Box whose side UVs are in "window units" (so window size is constant), roofs mapped to black. */
export function windowedBox(w: number, h: number, d: number): THREE.BufferGeometry {
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
export function windowedCylinder(rTop: number, rBottom: number, h: number, segments: number): THREE.BufferGeometry {
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
  /**
   * "body" is the main (windowed in City) material, "accent" a solid glow for crowns, rings, roofs,
   * "glow" a soft additive halo (planet atmospheres, fireflies of light around blossoms).
   */
  mat: 'body' | 'accent' | 'glow';
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
 *  Galaxy: planets (rocky / ocean / gas, with atmospheres, rings, moons) · ringed gas giant with moons ·
 *          ice crystal · space station · cratered moon.
 *  Tree:   leaf cluster · glowing fruit · crystal · flower · bud.
 */
export function shapeFor(
  kind: FileInfo['kind'],
  mode: ViewMode,
  h: number,
  s: number,
  footprint: number,
  traits: BuildingTraits = { complexity: 0.3, concurrent: false },
  style: StyleId = 'style.classic',
): ShapeRecipe {
  if (mode === 'city') return styledCity(style, kind, h, footprint, traits) ?? cityShape(kind, h, footprint, traits);
  if (mode === 'tree') return treeShape(kind, s);
  return galaxyShape(kind, s, traits.complexity, traits.concurrent);
}

export const box = (w: number, h: number, d: number, y: number, mat: Part['mat'] = 'body', x = 0, z = 0): Part => ({
  geometry: mat === 'body' ? windowedBox(w, h, d) : new THREE.BoxGeometry(w, h, d),
  mat,
  position: [x, y + h / 2, z],
});

/** A glowing band around the top of a block (roof parapet / setback crown). */
export const crown = (w: number, d: number, y: number): Part => ({ geometry: new THREE.BoxGeometry(w * 1.03, 0.05, d * 1.03), mat: 'accent', position: [0, y, 0] });

export function withBeacon(recipe: ShapeRecipe, traits: BuildingTraits): ShapeRecipe {
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

/** A sphere whose geometry is offset from its origin: spinning the mesh makes it orbit (moons). */
function orbiter(distance: number, tilt: number, size: number): Part {
  const g = new THREE.SphereGeometry(size, 12, 8).translate(distance, 0, 0);
  return { geometry: g, mat: 'accent', rotation: [Math.PI / 2 + tilt, 0, 0], spin: true };
}

/** A flat planetary ring: a torus squashed into a disc, visible from above and below. */
function planetRing(radius: number, width: number, tilt: number, spin = false): Part {
  return {
    geometry: new THREE.TorusGeometry(radius, width, 4, 48),
    mat: 'accent',
    rotation: [Math.PI / 2 + tilt, 0, 0],
    scale: [1, 1, 0.07],
    spin,
  };
}

const atmosphere = (r: number): Part => ({ geometry: new THREE.SphereGeometry(r, 16, 12), mat: 'glow' });

function galaxyShape(kind: FileInfo['kind'], s: number, cx: number, concurrent: boolean): ShapeRecipe {
  switch (kind) {
    case 'module':
      // Gas giant: banded sphere, a wide double ring system and two moons.
      return {
        anchorY: 0,
        parts: [
          { geometry: new THREE.SphereGeometry(s * 1.15, 24, 16), mat: 'body', rotation: [0.35, 0, 0.2] },
          atmosphere(s * 1.38),
          planetRing(s * 2.0, s * 0.42, 0.35),
          planetRing(s * 2.75, s * 0.18, 0.35),
          orbiter(s * 3.4, 0.2, s * 0.2),
          orbiter(s * 4.2, -0.45, s * 0.14),
        ],
      };
    case 'config':
      // Ice crystal asteroid.
      return {
        anchorY: 0,
        parts: [
          { geometry: new THREE.OctahedronGeometry(s, 0), mat: 'body', rotation: [0.4, 0.3, 0] },
          { geometry: new THREE.OctahedronGeometry(s * 0.45, 0), mat: 'accent', position: [s * 0.9, s * 0.4, 0], rotation: [0.8, 0.2, 0.5] },
        ],
      };
    case 'test': {
      // Space station: a habitat ring with spokes around a glowing core.
      const r = s * 1.05;
      const spokes = mergeGeometries([0, 1, 2].map((i) => new THREE.CylinderGeometry(s * 0.05, s * 0.05, r * 2, 5).rotateZ((i * Math.PI) / 3)));
      return {
        anchorY: 0,
        parts: [
          { geometry: new THREE.TorusGeometry(r, s * 0.16, 10, 40), mat: 'body', rotation: [Math.PI / 2.4, 0, 0], spin: true },
          { geometry: spokes, mat: 'accent', rotation: [Math.PI / 2.4, 0, 0], spin: true },
          { geometry: new THREE.SphereGeometry(s * 0.32, 16, 12), mat: 'accent' },
          { geometry: new THREE.CylinderGeometry(s * 0.06, s * 0.06, s * 1.6, 6), mat: 'accent', rotation: [0.17, 0, 0] },
        ],
      };
    }
    case 'docs':
      // A small cratered moon.
      return { anchorY: 0, parts: [{ geometry: new THREE.SphereGeometry(s * 0.62, 16, 12), mat: 'body' }] };
    default: {
      // Planets: rocky (simple code), ocean worlds (moderate) or banded gas worlds (complex), with an
      // atmosphere; async code gets a ring, very complex code a moon.
      const parts: Part[] = [{ geometry: new THREE.SphereGeometry(s, 20, 14), mat: 'body', rotation: [0.3, 0, 0.15] }, atmosphere(s * 1.22)];
      if (concurrent) parts.push(planetRing(s * 1.8, s * 0.3, -0.3));
      if (cx > 0.6) parts.push(orbiter(s * 2.6, 0.3, s * 0.18));
      return { anchorY: 0, parts };
    }
  }
}

/** Five petals around a centre, merged into one mesh. */
function petals(s: number, count = 5): THREE.BufferGeometry {
  const geos = Array.from({ length: count }, (_, i) =>
    new THREE.SphereGeometry(1, 10, 6)
      .scale(s * 0.62, s * 0.16, s * 0.3)
      .translate(s * 0.55, 0, 0)
      .rotateY((i / count) * Math.PI * 2),
  );
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

/** A small fan of leaves, merged: reads as foliage instead of a single blob. */
function leafCluster(s: number): THREE.BufferGeometry {
  const geos = [-0.7, 0, 0.7].map((a, i) =>
    new THREE.SphereGeometry(1, 14, 8)
      .scale(s * (i === 1 ? 1.5 : 1.15), s * 0.22, s * (i === 1 ? 0.8 : 0.62))
      .translate(s * (i === 1 ? 0.55 : 0.4), 0, 0)
      .rotateZ(i === 1 ? 0.25 : 0.05)
      .rotateY(a),
  );
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

function treeShape(kind: FileInfo['kind'], s: number): ShapeRecipe {
  switch (kind) {
    case 'module':
      // Glowing fruit with a soft aura and a leaf on top.
      return {
        anchorY: 0,
        parts: [
          { geometry: new THREE.SphereGeometry(s * 0.95, 24, 16), mat: 'accent' },
          atmosphere(s * 1.6),
          { geometry: new THREE.SphereGeometry(1, 10, 6).scale(s * 0.6, s * 0.12, s * 0.3), mat: 'body', position: [s * 0.35, s * 0.95, 0], rotation: [0, 0, 0.5] },
          { geometry: new THREE.TorusGeometry(s * 1.5, s * 0.05, 8, 36), mat: 'accent', rotation: [Math.PI / 2.2, 0, 0], spin: true },
        ],
      };
    case 'config':
      // Crystal growing on the branch.
      return {
        anchorY: 0,
        parts: [
          { geometry: new THREE.OctahedronGeometry(s * 0.8, 0), mat: 'accent', scale: [0.7, 1.4, 0.7] },
          { geometry: new THREE.OctahedronGeometry(s * 0.45, 0), mat: 'accent', position: [s * 0.45, -s * 0.2, 0], scale: [0.7, 1.4, 0.7], rotation: [0, 0, -0.6] },
        ],
      };
    case 'test':
      // Flower: petals around a bright centre.
      return {
        anchorY: 0,
        parts: [
          { geometry: petals(s), mat: 'body', rotation: [0.3, 0, 0] },
          { geometry: new THREE.SphereGeometry(s * 0.28, 12, 8), mat: 'accent' },
        ],
      };
    case 'docs':
      // Bud.
      return { anchorY: 0, parts: [{ geometry: new THREE.SphereGeometry(1, 12, 8).scale(s * 0.45, s * 0.65, s * 0.45), mat: 'body' }] };
    default:
      return { anchorY: 0, parts: [{ geometry: leafCluster(s), mat: 'body' }] };
  }
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

/**
 * Merges a recipe's static parts into one geometry per material (spinning parts and halos stay separate).
 * A building made of tiers, crowns and an antenna becomes one or two meshes instead of five or six: this
 * roughly halves Code City's draw calls, which was the main cost when orbiting large repositories.
 */
export function mergeStatic(recipe: ShapeRecipe): ShapeRecipe {
  const byMat = new Map<Part['mat'], THREE.BufferGeometry[]>();
  const kept: Part[] = [];
  for (const p of recipe.parts) {
    if (p.spin || p.mat === 'glow') {
      kept.push(p);
      continue;
    }
    const g = p.geometry.clone();
    tmpEuler.set(...(p.rotation ?? [0, 0, 0]));
    tmpQuat.setFromEuler(tmpEuler);
    tmpMatrix.compose(tmpPos.set(...(p.position ?? [0, 0, 0])), tmpQuat, tmpScale.set(...(p.scale ?? [1, 1, 1])));
    g.applyMatrix4(tmpMatrix);
    const list = byMat.get(p.mat) ?? [];
    list.push(g);
    byMat.set(p.mat, list);
  }
  const merged: Part[] = [];
  for (const [mat, list] of byMat) {
    // Polyhedra (crystals) are non-indexed; mergeGeometries needs all-indexed or all-non-indexed.
    const mixed = list.some((g) => g.index) && list.some((g) => !g.index);
    const ready = mixed ? list.map((g) => (g.index ? g.toNonIndexed() : g)) : list;
    const one = ready.length === 1 ? ready[0] : mergeGeometries(ready);
    if (!one) {
      // Attributes didn't line up: keep the (already transformed) pieces as they are.
      ready.forEach((g) => merged.push({ geometry: g, mat }));
      continue;
    }
    merged.push({ geometry: one, mat });
    if (one !== ready[0]) ready.forEach((g) => g.dispose());
    if (mixed) list.forEach((g) => g.dispose());
  }
  // The originals were cloned above; free them.
  recipe.parts.forEach((p) => {
    if (!p.spin && p.mat !== 'glow') p.geometry.dispose();
  });
  return { anchorY: recipe.anchorY, parts: [...merged, ...kept] };
}
