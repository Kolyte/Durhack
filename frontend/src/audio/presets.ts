export type PresetId = 'ambient' | 'lofi' | 'cinematic' | 'electronic';
export type VoiceId = 'glass' | 'pluck' | 'keys' | 'mallet' | 'bright';
export type LayerId = 'pad' | 'lead' | 'arp' | 'bass' | 'drums';

export const LAYERS: LayerId[] = ['pad', 'lead', 'arp', 'bass', 'drums'];

/** 16-step patterns: value = velocity (0 = rest). */
type Steps = number[];
const steps = (hits: Record<number, number>): Steps => Array.from({ length: 16 }, (_, i) => hits[i] ?? 0);

export interface MusicPreset {
  id: PresetId;
  label: string;
  description: string;
  tempo: number;
  progression: string[];
  barsPerChord: number;
  /** 0–1: delays every off-beat 16th for a laid-back groove. */
  swing: number;
  leadVoices: VoiceId[];
  /** Onset templates (16th steps) from sparse to dense. */
  rhythms: number[][];
  pad: { osc: string; attack: number; release: number; volume: number; cutoff: number };
  drums: { kick: Steps; hat: Steps; snare: Steps; minEnergy: number };
  /** Bass hits: step → 'root' | 'fifth'; null = no bass. */
  bass: { pattern: Record<number, 'root' | 'fifth'>; length: string; osc: string } | null;
  /** Highest arpeggio density (0 none … 3 sixteenths). */
  arpMax: number;
  reverb: number;
  delay: number;
  masterCutoff: number;
}

export const PRESETS: Record<PresetId, MusicPreset> = {
  ambient: {
    id: 'ambient',
    label: 'Ambient',
    description: 'Soft pads, gentle plucks, spacious reverb',
    tempo: 78,
    progression: ['Dm9', 'Fmaj9', 'Cmaj9', 'G6/9'],
    barsPerChord: 2,
    swing: 0,
    leadVoices: ['glass', 'pluck', 'mallet'],
    rhythms: [[0, 8], [0, 6, 12], [0, 4, 10], [0, 6, 8, 12], [0, 3, 8, 11, 14]],
    pad: { osc: 'fatsine', attack: 2.5, release: 6, volume: -19, cutoff: 1500 },
    drums: { kick: steps({ 0: 0.55 }), hat: steps({ 8: 0.35 }), snare: steps({}), minEnergy: 0.35 },
    bass: { pattern: { 0: 'root' }, length: '1m', osc: 'sine' },
    arpMax: 2,
    reverb: 0.55,
    delay: 0.3,
    masterCutoff: 9000,
  },
  lofi: {
    id: 'lofi',
    label: 'Lo-fi',
    description: 'Mellow electric keys, relaxed bass, dusty drums',
    tempo: 82,
    progression: ['Dm9', 'G9', 'Cmaj9', 'Am7'],
    barsPerChord: 1,
    swing: 0.32,
    leadVoices: ['keys', 'mallet', 'pluck'],
    rhythms: [[0, 10], [0, 6, 10], [2, 6, 10, 14], [0, 3, 6, 10, 12], [0, 3, 6, 8, 11, 14]],
    pad: { osc: 'triangle', attack: 0.25, release: 2.2, volume: -21, cutoff: 1100 },
    drums: {
      kick: steps({ 0: 0.8, 7: 0.45, 10: 0.7 }),
      hat: steps({ 0: 0.5, 2: 0.3, 4: 0.5, 6: 0.3, 8: 0.5, 10: 0.3, 12: 0.5, 14: 0.35 }),
      snare: steps({ 4: 0.7, 12: 0.7 }),
      minEnergy: 0,
    },
    bass: { pattern: { 0: 'root', 7: 'fifth', 10: 'root' }, length: '8n', osc: 'triangle' },
    arpMax: 1,
    reverb: 0.3,
    delay: 0.18,
    masterCutoff: 4200,
  },
  cinematic: {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Evolving chords and atmospheric textures',
    tempo: 72,
    progression: ['Dm(add9)', 'Fmaj7', 'Cmaj7/E', 'G6/9', 'Dm9', 'Am7', 'Fmaj9', 'G6/9'],
    barsPerChord: 2,
    swing: 0,
    leadVoices: ['glass', 'keys', 'pluck'],
    rhythms: [[0], [0, 8], [0, 6, 12], [0, 4, 8, 12], [0, 3, 6, 8, 12]],
    pad: { osc: 'fattriangle', attack: 3, release: 7, volume: -17, cutoff: 1900 },
    drums: { kick: steps({ 0: 0.6, 8: 0.25 }), hat: steps({}), snare: steps({ 12: 0.3 }), minEnergy: 0.45 },
    bass: { pattern: { 0: 'root' }, length: '1m', osc: 'sine' },
    arpMax: 2,
    reverb: 0.65,
    delay: 0.25,
    masterCutoff: 11000,
  },
  electronic: {
    id: 'electronic',
    label: 'Electronic',
    description: 'Brighter synths, stronger rhythm and arpeggios',
    tempo: 104,
    progression: ['Dm7', 'Fmaj7', 'Am7', 'G6/9'],
    barsPerChord: 1,
    swing: 0.08,
    leadVoices: ['bright', 'pluck', 'mallet'],
    rhythms: [[0, 6, 12], [0, 4, 8, 12], [0, 3, 6, 10, 12], [0, 2, 6, 8, 10, 14], [0, 2, 4, 6, 8, 10, 12, 14]],
    pad: { osc: 'fattriangle', attack: 0.4, release: 2.5, volume: -21, cutoff: 1700 },
    drums: {
      kick: steps({ 0: 0.85, 4: 0.75, 8: 0.85, 12: 0.75 }),
      hat: steps({ 2: 0.5, 6: 0.5, 10: 0.5, 14: 0.5 }),
      snare: steps({ 4: 0.5, 12: 0.5 }),
      minEnergy: 0,
    },
    bass: { pattern: { 2: 'root', 6: 'root', 10: 'fifth', 14: 'root' }, length: '16n', osc: 'triangle' },
    arpMax: 3,
    reverb: 0.35,
    delay: 0.22,
    masterCutoff: 14000,
  },
};

/**
 * Layers fade in as the arrangement progresses (by arrangement bar), so a piece starts
 * with just the pad and builds up instead of everything starting at once.
 */
export const LAYER_ENTRY_BAR: Record<LayerId, number> = { pad: 0, lead: 2, bass: 4, arp: 6, drums: 8 };
