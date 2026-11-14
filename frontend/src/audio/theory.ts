/** Small music-theory toolkit: everything is kept inside D Dorian (D E F G A B C). */

export const D_DORIAN_PCS = [2, 4, 5, 7, 9, 11, 0];
const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const midiToNote = (m: number) => `${PC_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
export const pc = (m: number) => ((m % 12) + 12) % 12;
export const inScale = (m: number) => D_DORIAN_PCS.includes(pc(m));

/** All D Dorian pitches in [lo, hi] (MIDI), ascending. */
export function scaleRange(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (inScale(m)) out.push(m);
  return out;
}

export interface Chord {
  name: string;
  root: number; // pitch class
  core: number[]; // intervals from root, always voiced
  ext: number[]; // colour tones, voiced when harmony is "rich" (high connectivity)
}

/** Diatonic D Dorian chords. Extensions are chosen so every tone stays in the scale. */
export const CHORDS: Record<string, Chord> = {
  Dm9: { name: 'Dm9', root: 2, core: [0, 3, 7, 10], ext: [14] },
  'Dm(add9)': { name: 'Dm(add9)', root: 2, core: [0, 3, 7], ext: [14] },
  Dm7: { name: 'Dm7', root: 2, core: [0, 3, 7, 10], ext: [] },
  Em7: { name: 'Em7', root: 4, core: [0, 3, 7, 10], ext: [17] },
  Fmaj9: { name: 'Fmaj9', root: 5, core: [0, 4, 7, 11], ext: [14] },
  Fmaj7: { name: 'Fmaj7', root: 5, core: [0, 4, 7, 11], ext: [] },
  G9: { name: 'G9', root: 7, core: [0, 4, 7, 10], ext: [14] },
  'G6/9': { name: 'G6/9', root: 7, core: [0, 4, 7], ext: [9, 14] },
  Am7: { name: 'Am7', root: 9, core: [0, 3, 7, 10], ext: [14] },
  Cmaj9: { name: 'Cmaj9', root: 0, core: [0, 4, 7, 11], ext: [14] },
  'Cmaj7/E': { name: 'Cmaj7/E', root: 0, core: [4, 7, 11, 12], ext: [14] },
};

export function chordPcs(chord: Chord, rich: boolean): number[] {
  const ivs = rich ? [...chord.core, ...chord.ext] : chord.core;
  return [...new Set(ivs.map((i) => (chord.root + i) % 12))];
}

/**
 * Voices a chord for the pad: a low bass note plus upper tones. Tries every octave placement of the
 * upper tones and keeps the one that moves least from the previous chord (smooth voice leading)
 * while avoiding semitone clashes and over-wide spreads.
 */
export function voiceChord(chord: Chord, rich: boolean, prev: number[] | null): number[] {
  const bassPc = (chord.root + chord.core[0]) % 12;
  let bass = 36 + bassPc; // C2..B2
  if (bass < 40) bass += 12; // keep bass between E2 and D#3
  let upperPcs = chordPcs(chord, rich).filter((p) => p !== bassPc);
  if (upperPcs.length < 3) upperPcs = chordPcs(chord, rich);
  const prevUpper = prev ? prev.slice(1) : [];

  const options = upperPcs.map((p) => {
    const out: number[] = [];
    for (let m = 53; m <= 77; m++) if (pc(m) === p) out.push(m);
    return out;
  });

  let best: number[] = [];
  let bestCost = Infinity;
  const pick = (i: number, acc: number[]) => {
    if (i === options.length) {
      const v = [...acc].sort((a, b) => a - b);
      let cost = 0;
      for (const m of v) {
        cost += prevUpper.length ? Math.min(...prevUpper.map((u) => Math.abs(u - m))) : Math.abs(m - 64) * 0.5;
      }
      for (let k = 1; k < v.length; k++) if (v[k] - v[k - 1] === 1) cost += 12; // minor-2nd rub
      cost += Math.max(0, v[v.length - 1] - v[0] - 14) * 1.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
      return;
    }
    for (const m of options[i]) pick(i + 1, [...acc, m]);
  };
  pick(0, []);
  return [bass, ...best];
}

/** Deterministic PRNG so the same repository always composes the same piece. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
