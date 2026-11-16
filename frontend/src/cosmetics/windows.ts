import type * as THREE from 'three';
import type { WindowPattern } from './catalog';
import { getWindowTexture, paintedTexture } from '../visualization/shapes/geometry';

/**
 * Façade patterns for the building skins. Every pattern is an 8×8 tile grid at 256 px, like the default
 * windows, so the same UVs work; pixel (0,0) stays black because roofs sample it.
 */
const SIZE = 256;
const CELL = SIZE / 8;
const gray = (v: number) => {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${c},${c},${c})`;
};

type Paint = (ctx: CanvasRenderingContext2D, rnd: () => number) => void;

const PAINTERS: Record<Exclude<WindowPattern, 'grid'>, Paint> = {
  // Cyberpunk: wide horizontal light strips with scanlines.
  scan: (ctx, rnd) => {
    for (let y = 0; y < 8; y++) {
      const lit = rnd() < 0.18 ? 0.05 : 0.5 + rnd() * 0.5;
      ctx.fillStyle = gray(lit);
      ctx.fillRect(CELL * 0.08, y * CELL + CELL * 0.3, SIZE - CELL * 0.16, CELL * 0.38);
      ctx.fillStyle = gray(lit * 0.35);
      for (let s = 0; s < 3; s++) ctx.fillRect(CELL * 0.08, y * CELL + CELL * (0.36 + s * 0.11), SIZE - CELL * 0.16, 1);
      if (rnd() < 0.3) {
        ctx.fillStyle = gray(1);
        ctx.fillRect(rnd() * SIZE * 0.8, y * CELL + CELL * 0.3, CELL * (0.6 + rnd()), CELL * 0.38);
      }
    }
  },
  // Gold: tall arched windows in a warm, even light.
  gold: (ctx, rnd) => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = gray(rnd() < 0.15 ? 0.1 : 0.55 + rnd() * 0.45);
        const cx = x * CELL + CELL / 2;
        ctx.beginPath();
        ctx.moveTo(cx - CELL * 0.18, y * CELL + CELL * 0.85);
        ctx.lineTo(cx - CELL * 0.18, y * CELL + CELL * 0.35);
        ctx.arc(cx, y * CELL + CELL * 0.35, CELL * 0.18, Math.PI, 0);
        ctx.lineTo(cx + CELL * 0.18, y * CELL + CELL * 0.85);
        ctx.fill();
      }
  },
  // Glacier: soft frosted panes with icy streaks.
  frost: (ctx, rnd) => {
    ctx.fillStyle = gray(0.12);
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = gray(0.35 + rnd() * 0.6);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
      }
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = gray(1);
    for (let i = 0; i < 30; i++) {
      ctx.lineWidth = 0.5 + rnd();
      ctx.beginPath();
      const x = rnd() * SIZE, y = rnd() * SIZE;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 40, y + rnd() * 40);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  // Volcanic: dark rock split by glowing cracks.
  cracks: (ctx, rnd) => {
    ctx.strokeStyle = gray(1);
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      let x = rnd() * SIZE, y = rnd() * SIZE;
      ctx.lineWidth = 1.5 + rnd() * 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (rnd() - 0.5) * 44;
        y += rnd() * 36;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.filter = 'blur(3px)';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  },
  // Matrix: columns of glyphs, brightest at the head of each stream.
  code: (ctx, rnd) => {
    ctx.font = `bold ${Math.round(CELL * 0.5)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyphs = '01アイウエオカキクケコｱｲｳｴｵ<>{}=+*';
    const cols = 16;
    for (let c = 0; c < cols; c++) {
      const head = rnd() * 16;
      for (let r = 0; r < 16; r++) {
        const dist = (head - r + 16) % 16;
        const v = dist === 0 ? 1 : Math.max(0, 0.75 - dist * 0.09);
        if (v <= 0.03 || rnd() < 0.15) continue;
        ctx.fillStyle = gray(v);
        ctx.fillText(glyphs[Math.floor(rnd() * glyphs.length)], (c + 0.5) * (SIZE / cols), (r + 0.5) * (SIZE / 16));
      }
    }
  },
  // Candy: round windows and sprinkles.
  sprinkle: (ctx, rnd) => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = gray(rnd() < 0.2 ? 0.15 : 0.6 + rnd() * 0.4);
        ctx.beginPath();
        ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, CELL * 0.26, 0, Math.PI * 2);
        ctx.fill();
      }
    for (let i = 0; i < 70; i++) {
      ctx.save();
      ctx.translate(rnd() * SIZE, rnd() * SIZE);
      ctx.rotate(rnd() * Math.PI);
      ctx.fillStyle = gray(0.4 + rnd() * 0.6);
      ctx.fillRect(-4, -1, 8, 2.5);
      ctx.restore();
    }
  },
};

export function windowTexture(pattern: WindowPattern): THREE.Texture {
  if (pattern === 'grid') return getWindowTexture();
  return paintedTexture(
    `windows-${pattern}`,
    SIZE,
    (ctx, _size, rnd) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, SIZE, SIZE);
      PAINTERS[pattern](ctx, rnd);
      // Roofs sample pixel (0,0): keep it dark.
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 3, 3);
    },
    true,
  );
}
