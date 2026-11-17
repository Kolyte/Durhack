import type { Wrapped } from './types';

/** Draws the shareable summary as a 1080×1350 PNG (the portrait size Instagram and X show uncropped). */
export async function renderShareCard(w: Wrapped): Promise<Blob | null> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  await document.fonts?.ready;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1226');
  bg.addColorStop(0.55, '#3b0764');
  bg.addColorStop(1, '#be185d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Soft glow blobs.
  for (const [x, y, r, c] of [[200, 260, 420, 'rgba(45,212,191,0.35)'], [900, 1100, 480, 'rgba(244,114,182,0.35)']] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // Equaliser bars along the bottom.
  for (let i = 0; i < 36; i++) {
    const h = 30 + Math.abs(Math.sin(i * 1.7 + w.bpm)) * 120;
    ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 3) * 0.03})`;
    ctx.fillRect(40 + i * 28.5, H - 60 - h, 18, h);
  }

  const font = (size: number, weight = 700) => `${weight} ${size}px Inter, system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillStyle = '#5eead4';
  ctx.font = font(34, 800);
  ctx.fillText(`◈ SONYX WRAPPED ${w.year}`, 80, 120);

  // Avatar (GitHub serves avatars with CORS headers; skip it if that fails).
  const avatar = await loadImage(w.avatarUrl).catch(() => null);
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(160, 260, 80, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 80, 180, 160, 160);
    ctx.restore();
  }
  ctx.fillStyle = '#fff';
  ctx.font = font(60, 800);
  ctx.fillText(w.name || w.login, avatar ? 270 : 80, 250, W - 350);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = font(34, 500);
  ctx.fillText(`@${w.login}`, avatar ? 270 : 80, 300);

  ctx.fillStyle = '#fbcfe8';
  ctx.font = font(36, 600);
  ctx.fillText('My code sounds like', 80, 450);
  ctx.fillStyle = '#fff';
  ctx.font = font(96, 900);
  ctx.fillText(w.genre, 80, 555, W - 160);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = font(34, 500);
  ctx.fillText(`${w.persona.title} · ${w.bpm} BPM in ${w.key}`, 80, 615, W - 160);

  // Stats grid.
  const stats: [string, string][] = [
    [compact(w.repos), 'repos'],
    [compact(w.stars), 'stars'],
    [compact(w.linesEstimate), 'lines (approx.)'],
    [String(w.score), 'Sonyx score'],
  ];
  stats.forEach(([v, label], i) => {
    const x = 80 + (i % 2) * 470;
    const y = 720 + Math.floor(i / 2) * 170;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, y, 440, 140, 28);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(64, 900);
    ctx.fillText(v, x + 32, y + 78);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = font(28, 500);
    ctx.fillText(label, x + 32, y + 118);
  });

  ctx.fillStyle = '#fff';
  ctx.font = font(34, 700);
  const langs = w.languages.slice(0, 2).map((l) => `${l.name} → ${l.genre}`).join('    ');
  ctx.fillText(langs, 80, 1100, W - 160);
  if (w.topRepo) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = font(30, 500);
    ctx.fillText(`Biggest hit: ${w.topRepo.name} ★ ${compact(w.topRepo.stars)}`, 80, 1150, W - 160);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = font(26, 600);
  ctx.fillText(`Get yours at ${location.host}/wrapped.html`, 80, H - 24);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!src) return reject(new Error('no avatar'));
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function compact(n: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
