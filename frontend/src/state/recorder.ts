import * as Tone from 'tone';
import { createStore } from './store';
import { toast } from './account';

/**
 * Records a short clip of the 3D view with its music, for sharing on TikTok, Reels, Shorts or X.
 *
 * Pipeline: the WebGL canvas → a hidden <video> → a 2D canvas where a small Sonyx watermark is added →
 * MediaRecorder, together with the audio tapped from Tone's master output. The page's UI panels are not
 * in the clip, only the scene.
 */
export const recorderStore = createStore<{ state: 'idle' | 'recording' | 'saving'; elapsed: number; length: number }>({
  state: 'idle',
  elapsed: 0,
  length: 15,
});

let stopRequested = false;

/** True when this browser can record (MediaRecorder + canvas streams). */
export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

function pickMime(): { mime: string; ext: string } {
  const options = [
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  return options.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? { mime: '', ext: 'webm' };
}

export function stopRecording() {
  stopRequested = true;
}

export async function recordClip(repoName: string, seconds = 15) {
  if (recorderStore.get().state !== 'idle') return;
  const gl = document.querySelector<HTMLCanvasElement>('.app canvas');
  if (!gl || !canRecord()) {
    toast("Your browser can't record clips. Try Chrome, Edge or Safari.");
    return;
  }
  stopRequested = false;
  recorderStore.set({ state: 'recording', elapsed: 0, length: seconds });

  // Output size: the scene's aspect, capped at 1080 px on the long side.
  const scale = Math.min(1, 1080 / Math.max(gl.width, gl.height));
  const out = document.createElement('canvas');
  out.width = Math.round((gl.width * scale) / 2) * 2;
  out.height = Math.round((gl.height * scale) / 2) * 2;
  const ctx = out.getContext('2d')!;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = gl.captureStream(30);
  await video.play().catch(() => undefined);

  // Tap the music (if the engine is running).
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  try {
    const raw = Tone.getContext().rawContext as AudioContext;
    audioDest = raw.createMediaStreamDestination();
    Tone.getDestination().connect(audioDest);
  } catch {
    audioDest = null;
  }

  const stream = out.captureStream(30);
  audioDest?.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const { mime, ext } = pickMime();
  const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const started = performance.now();
  let raf = 0;
  const draw = () => {
    ctx.drawImage(video, 0, 0, out.width, out.height);
    watermark(ctx, out.width, out.height, repoName);
    const elapsed = (performance.now() - started) / 1000;
    recorderStore.set({ elapsed });
    if (elapsed >= seconds || stopRequested) {
      if (recorder.state === 'recording') recorder.stop();
      return;
    }
    raf = requestAnimationFrame(draw);
  };

  const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start(250);
  raf = requestAnimationFrame(draw);
  await done;
  cancelAnimationFrame(raf);
  recorderStore.set({ state: 'saving' });
  video.srcObject = null;
  stream.getTracks().forEach((t) => t.stop());
  try {
    if (audioDest) Tone.getDestination().disconnect(audioDest);
  } catch {
    /* already disconnected */
  }

  const blob = new Blob(chunks, { type: mime || 'video/webm' });
  const file = `sonyx-${repoName.replace(/[^a-z0-9]+/gi, '-')}.${ext}`;
  await deliver(blob, file, repoName);
  recorderStore.set({ state: 'idle', elapsed: 0 });
}

/** Share sheet on phones (straight to TikTok/Instagram/etc.), download elsewhere. */
async function deliver(blob: Blob, name: string, repoName: string) {
  const f = new File([blob], name, { type: blob.type });
  try {
    if (navigator.canShare?.({ files: [f] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [f], text: `What ${repoName} sounds like, on Sonyx` });
      return;
    }
  } catch {
    /* fall back to download */
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Clip saved to your downloads');
}

function watermark(ctx: CanvasRenderingContext2D, w: number, h: number, repoName: string) {
  const s = Math.max(12, Math.round(Math.min(w, h) / 34));
  ctx.save();
  ctx.font = `700 ${s}px Inter, system-ui, sans-serif`;
  const label = `Sonyx · ${repoName}`;
  const tw = ctx.measureText(label).width;
  const pad = s * 0.6;
  const x = pad * 1.5;
  const y = h - pad * 1.5;
  ctx.fillStyle = 'rgba(6, 9, 20, 0.55)';
  ctx.beginPath();
  ctx.roundRect(x - pad, y - s - pad * 0.4, tw + pad * 2, s + pad * 1.3, s * 0.6);
  ctx.fill();
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(label, x, y);
  ctx.restore();
}
