/**
 * Turns a repository model into a musical plan. Pure functions (no Tone.js) so they can be unit tested.
 *
 * Mapping summary:
 *   file size      → note length
 *   complexity     → melodic movement (leap size) and brightness
 *   imports        → stepwise "connected" melody + light travelling along the cable
 *   concurrency    → arpeggio rhythmic activity
 *   directory      → which lead instrument plays
 *   repo size      → note density
 *   stars          → default energy
 */
import type { CodeDna } from '../model/codeDna';
import type { FileInfo, RepoModel } from '../model/repoModel';
import { CHORDS, chordPcs, pc, scaleRange, type Chord } from './theory';
import type { MusicPreset, VoiceId } from './presets';

export const LEAD_LOW = 62; // D4
export const LEAD_HIGH = 81; // A5
const LEAD_SCALE = scaleRange(LEAD_LOW, LEAD_HIGH);

export interface Section {
  kind: 'overview' | 'directory' | 'hub';
  title: string;
  groupKey: string | null;
  walk: string[];
  bars: number;
}

export interface MelodyNote {
  step: number; // 16th within the bar
  dur: number; // in 16ths
  midi: number;
  velocity: number;
  fileId: string;
  /** Set when this file is imported by (or imports) the previous note's file. */
  fromFileId: string | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 0–1, log-scaled so a few huge files don't flatten everything else. */
export const complexityLevel = (cc: number) => clamp(Math.log(1 + Math.max(0, cc - 1)) / Math.log(80), 0, 1);

export function connected(a: FileInfo | undefined, b: FileInfo | undefined): boolean {
  if (!a || !b) return false;
  return a.deps.includes(b.id) || b.deps.includes(a.id);
}

/** Orders files so consecutive files are connected by imports wherever possible (depth-first). */
export function importWalk(ids: string[], model: RepoModel): string[] {
  const inSet = new Set(ids);
  const visited = new Set<string>();
  const out: string[] = [];
  const byImportance = [...ids].sort((a, b) => {
    const fa = model.files.get(a)!;
    const fb = model.files.get(b)!;
    return fb.degree - fa.degree || fb.loc - fa.loc || a.localeCompare(b);
  });
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    out.push(id);
    const f = model.files.get(id)!;
    for (const next of [...f.deps, ...f.dependents]) if (inSet.has(next)) visit(next);
  };
  for (const id of byImportance) visit(id);
  return out;
}

export function buildSections(model: RepoModel): Section[] {
  const all = [...model.files.values()];
  if (all.length === 0) return [];
  const sections: Section[] = [];

  const overview = [...all]
    .filter((f) => f.role === 'source' || f.role === 'test')
    .sort((a, b) => b.degree - a.degree || b.loc - a.loc)
    .slice(0, 8)
    .map((f) => f.id);
  sections.push({
    kind: 'overview',
    title: 'Overview',
    groupKey: null,
    walk: overview.length ? overview : all.slice(0, 8).map((f) => f.id),
    bars: 4,
  });

  for (const g of model.groups.slice(0, 8)) {
    const walk = importWalk(g.files, model);
    sections.push({
      kind: 'directory',
      title: g.label,
      groupKey: g.key,
      walk,
      bars: clamp(2 * Math.ceil(walk.length / 6), 2, 8),
    });
  }

  const hub = [...all].sort((a, b) => b.degree - a.degree)[0];
  if (hub && hub.degree >= 2) {
    const walk = [hub.id];
    for (const d of hub.deps) walk.push(d, hub.id);
    for (const d of hub.dependents) walk.push(d, hub.id);
    sections.push({
      kind: 'hub',
      title: `Hub · ${hub.path.split('/').pop()}`,
      groupKey: hub.group,
      walk: walk.slice(0, 12),
      bars: 4,
    });
  }
  return sections;
}

/** Which progression / voice line-up this repository gets (stable per repo name). */
export function progressionFor(preset: MusicPreset, variant: number): string[] {
  return preset.progressions[variant % preset.progressions.length];
}

export function chordForBar(preset: MusicPreset, bar: number, variant = 0): Chord {
  const prog = progressionFor(preset, variant);
  const idx = Math.floor(bar / preset.barsPerChord) % prog.length;
  return CHORDS[prog[idx]];
}

/**
 * Lead instrument for a directory. `rotation` increases each time the tour loops, so the same
 * directory is played by a different instrument on the next pass.
 */
export function voiceForGroup(preset: MusicPreset, groupIndex: number, variant = 0, rotation = 0): VoiceId {
  const set = preset.leadVoices[variant % preset.leadVoices.length];
  return set[(Math.max(0, groupIndex) + rotation) % set.length];
}

/** Bigger files hold their notes longer. */
export function durationSteps(loc: number): number {
  if (loc < 60) return 2;
  if (loc < 200) return 3;
  if (loc < 500) return 4;
  return 6;
}

function nearestIn(candidates: number[], target: number): number {
  let best = candidates[0];
  for (const c of candidates) if (Math.abs(c - target) < Math.abs(best - target)) best = c;
  return best;
}

export interface BarContext {
  preset: MusicPreset;
  chord: Chord;
  rich: boolean;
  files: FileInfo[]; // one per note, in order
  prevMidi: number;
  prevFile: FileInfo | undefined;
  /** 0–1 position within the 2-bar phrase: first half rises, second half falls back. */
  phrasePos: number;
  phraseEnd: boolean;
  energy: number;
  rng: () => number;
}

/** Picks a rhythm template: denser for bigger repos and higher energy. */
export function pickRhythm(preset: MusicPreset, density: number, rng: () => number): number[] {
  const t = preset.rhythms;
  const idx = clamp(Math.round(density * (t.length - 1) + (rng() - 0.5)), 0, t.length - 1);
  return t[idx];
}

/** Chord-aware melody for one bar: strong beats and long notes land on chord tones; phrases resolve. */
export function generateBar(ctx: BarContext, onsets: number[]): { notes: MelodyNote[]; lastMidi: number } {
  const chordTones = LEAD_SCALE.filter((m) => chordPcs(ctx.chord, ctx.rich).includes(pc(m)));
  const resolveTones = LEAD_SCALE.filter((m) => {
    const p = pc(m);
    return p === ctx.chord.root % 12 || p === (ctx.chord.root + ctx.chord.core[1]) % 12;
  });
  const notes: MelodyNote[] = [];
  let prev = clamp(ctx.prevMidi, LEAD_LOW, LEAD_HIGH);
  let prevFile = ctx.prevFile;
  const dirBias = ctx.phrasePos < 0.5 ? 1 : -1;

  onsets.forEach((step, i) => {
    const file = ctx.files[i % ctx.files.length];
    const next = onsets[i + 1] ?? 16;
    const dur = Math.max(1, Math.min(durationSteps(file.loc), next - step + (i === onsets.length - 1 ? 2 : 0)));
    const linked = connected(prevFile, file);
    const strong = step % 8 === 0 || dur >= 4;
    const isLast = i === onsets.length - 1;

    let dir = ctx.rng() < 0.75 ? dirBias : -dirBias;
    if (prev >= LEAD_HIGH - 3) dir = -1;
    if (prev <= LEAD_LOW + 3) dir = 1;

    const prevIdx = LEAD_SCALE.indexOf(nearestIn(LEAD_SCALE, prev));
    // Imports glide by step; unrelated files may leap further the more complex they are.
    const maxLeap = linked ? 1 : 1 + Math.round(complexityLevel(file.complexity) * 3);
    const leap = 1 + Math.floor(ctx.rng() * maxLeap);
    const targetIdx = clamp(prevIdx + dir * leap, 0, LEAD_SCALE.length - 1);
    let midi = LEAD_SCALE[targetIdx];

    if (isLast && ctx.phraseEnd) midi = nearestIn(resolveTones, midi);
    else if (strong) midi = nearestIn(chordTones, midi);

    notes.push({
      step,
      dur,
      midi,
      velocity: clamp(0.45 + (step % 8 === 0 ? 0.15 : 0) + ctx.energy * 0.2 + (ctx.rng() - 0.5) * 0.08, 0.2, 0.9),
      fileId: file.id,
      fromFileId: linked && prevFile ? prevFile.id : null,
    });
    prev = midi;
    prevFile = file;
  });
  return { notes, lastMidi: prev };
}

/**
 * Re-voices a stored motif over the current chord: strong beats move to the nearest chord tone,
 * and every 4th bar the last note steps up for a little variation. Files are re-assigned so the
 * visuals still walk through the section.
 */
export function adaptMotif(
  motif: MelodyNote[],
  chord: Chord,
  rich: boolean,
  files: FileInfo[],
  prevFile: FileInfo | undefined,
  vary: boolean,
): MelodyNote[] {
  const chordTones = LEAD_SCALE.filter((m) => chordPcs(chord, rich).includes(pc(m)));
  let prev = prevFile;
  return motif.map((n, i) => {
    let midi = n.step % 8 === 0 || n.dur >= 4 ? nearestIn(chordTones, n.midi) : n.midi;
    if (vary && i === motif.length - 1) {
      const idx = LEAD_SCALE.indexOf(nearestIn(LEAD_SCALE, midi));
      midi = LEAD_SCALE[Math.min(LEAD_SCALE.length - 1, idx + 1)];
    }
    const file = files[i % Math.max(1, files.length)] ?? undefined;
    const out = { ...n, midi, fileId: file?.id ?? n.fileId, fromFileId: file && connected(prev, file) ? prev!.id : null };
    prev = file ?? prev;
    return out;
  });
}

export interface AcidStep {
  step: number;
  /** Semitones above the chord root (always resolved into D Dorian). */
  offset: number;
  accent: boolean;
  slide: boolean;
}

const ACID_OFFSETS = [0, 0, 0, 0, 12, 12, 7, 10, 3, 5];

/**
 * A 16-step 303-style acid pattern for a section. Busier when the section's files use more
 * concurrency; imports between consecutive files become slides.
 */
export function acidPattern(files: FileInfo[], energy: number, rng: () => number): AcidStep[] {
  const conc = files.reduce((s, f) => s + f.concurrency, 0) / Math.max(1, files.length);
  const density = clamp(0.4 + Math.min(1, conc / 4) * 0.25 + energy * 0.2, 0.35, 0.85);
  const out: AcidStep[] = [];
  for (let step = 0; step < 16; step++) {
    if (step !== 0 && rng() > density) continue;
    const f = files[step % Math.max(1, files.length)];
    const g = files[(step + 1) % Math.max(1, files.length)];
    out.push({
      step,
      offset: step === 0 ? 0 : ACID_OFFSETS[Math.floor(rng() * ACID_OFFSETS.length)],
      accent: step % 4 === 0 ? rng() < 0.6 : rng() < 0.2,
      slide: connected(f, g) && rng() < 0.7,
    });
  }
  return out;
}

/** Resolves an acid step over a chord into a MIDI note in the bass range (D2–D3), in scale. */
export function acidNote(chord: Chord, offset: number): number {
  let root = 36 + (chord.root % 12);
  if (root < 38) root += 12;
  const target = root + offset;
  for (let d = 0; d < 3; d++) {
    if (D_DORIAN_SET.has(pc(target - d))) return target - d;
    if (D_DORIAN_SET.has(pc(target + d))) return target + d;
  }
  return root;
}
const D_DORIAN_SET = new Set([2, 4, 5, 7, 9, 11, 0]);

/** 0 = none, 1 = quarter notes, 2 = eighths, 3 = sixteenths. */
export function arpLevel(preset: MusicPreset, files: FileInfo[], dna: CodeDna | null, energy: number): number {
  if (preset.arpMax === 0) return 0;
  const barConc = files.reduce((s, f) => s + f.concurrency, 0);
  const level = (barConc > 0 ? 1 : 0) + ((dna?.concurrency ?? 0) > 0.35 ? 1 : 0) + (energy > 0.7 ? 1 : 0);
  return Math.min(preset.arpMax, level);
}

export function arpSteps(level: number): number[] {
  if (level <= 0) return [];
  const every = level === 1 ? 4 : level === 2 ? 2 : 1;
  return Array.from({ length: 16 / every }, (_, i) => i * every);
}

/** Up-and-down arpeggio over chord tones an octave above the melody's centre. */
export function arpNotes(chord: Chord, rich: boolean, count: number): number[] {
  const tones = scaleRange(69, 88).filter((m) => chordPcs(chord, rich).includes(pc(m))).slice(0, 5);
  const cycle = [...tones, ...tones.slice(1, -1).reverse()];
  return Array.from({ length: count }, (_, i) => cycle[i % cycle.length]);
}

export function notesPerBarDensity(dna: CodeDna | null, energy: number): number {
  return clamp(0.25 + (dna?.size ?? 0.3) * 0.35 + (energy - 0.5) * 0.6, 0, 1);
}

export function defaultEnergy(stars: number): number {
  return clamp(0.35 + 0.25 * (Math.log10(stars + 1) / 5), 0.35, 0.6);
}

/** Human-readable explanation used by the file inspector. */
export function describeFile(file: FileInfo, preset: MusicPreset, groupIndex: number, variant = 0): string[] {
  const dur = durationSteps(file.loc);
  const durName = dur <= 2 ? 'short eighth notes' : dur === 3 ? 'dotted eighths' : dur === 4 ? 'quarter notes' : 'long, held notes';
  const cx = complexityLevel(file.complexity);
  const lines = [
    `Played by the ${voiceForGroup(preset, groupIndex, variant)} voice, the instrument of its directory (it changes on each loop of the tour).`,
    `${file.loc} lines → ${durName}.`,
    cx < 0.3
      ? `Complexity ${file.complexity} → calm, stepwise melody.`
      : cx < 0.6
        ? `Complexity ${file.complexity} → moderate melodic leaps.`
        : `Complexity ${file.complexity} → wide, adventurous leaps.`,
  ];
  if (file.deps.length + file.dependents.length > 0) {
    lines.push(`${file.deps.length + file.dependents.length} linked files → the melody glides by step to them and a light travels along the cable.`);
  }
  if (file.concurrency > 0) {
    lines.push(
      preset.bass?.style === 'acid'
        ? `${file.concurrency} concurrency markers → a busier acid bassline and more arpeggio activity.`
        : `${file.concurrency} concurrency markers → adds arpeggio activity while it plays.`,
    );
  }
  if (file.role === 'config' || file.role === 'docs') lines.push('Not code, so it contributes size and placement but no complexity.');
  return lines;
}
