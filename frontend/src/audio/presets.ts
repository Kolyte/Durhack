export type PresetId = 'ambient' | 'lofi' | 'cinematic' | 'electronic' | 'techno' | 'house' | 'synthwave';
export type VoiceId =
  | 'glass'
  | 'pluck'
  | 'keys'
  | 'mallet'
  | 'bright'
  | 'supersaw'
  | 'kalimba'
  | 'organ'
  | 'flute'
  | 'chip'
  | 'bell';
export type LayerId = 'pad' | 'lead' | 'arp' | 'bass' | 'drums';

export const LAYERS: LayerId[] = ['pad', 'lead', 'arp', 'bass', 'drums'];

/** 16-step patterns: value = velocity (0 = rest). */
export type Steps = number[];
const steps = (hits: Record<number, number>): Steps => Array.from({ length: 16 }, (_, i) => hits[i] ?? 0);
const every = (n: number, v: number, offset = 0): Steps => Array.from({ length: 16 }, (_, i) => ((i - offset) % n === 0 && i >= offset ? v : 0));

export interface MusicPreset {
  id: PresetId;
  label: string;
  description: string;
  tempo: number;
  /** Several progressions: each repository gets one (chosen from its name), so repos sound different. */
  progressions: string[][];
  barsPerChord: number;
  /** 0–1: delays every off-beat 16th for a laid-back groove. */
  swing: number;
  /** Several instrument line-ups: picked per repository, and rotated each time the tour loops. */
  leadVoices: VoiceId[][];
  /** Onset templates (16th steps) from sparse to dense. */
  rhythms: number[][];
  /** Repeat a short motif per section (techno/house style) instead of a new phrase every bar. */
  motif: boolean;
  pad: { osc: string; attack: number; release: number; volume: number; cutoff: number };
  drums: {
    /** Two variations each (A for bars 1–4, B for bars 5–8 of every 8-bar phrase). */
    kick: [Steps, Steps];
    hat: [Steps, Steps];
    openHat: Steps;
    snare: Steps;
    /** Clap layered on the snare hits (house / techno). */
    clap: boolean;
    minEnergy: number;
    fill: 'none' | 'snare' | 'hats';
  };
  /** 'pattern' = roots/fifths, 'acid' = 303-style generated line, 'arp' = driving octave eighths. */
  bass: { style: 'pattern'; pattern: Record<number, 'root' | 'fifth'>; length: string; osc: string } | { style: 'acid' | 'arp' } | null;
  /** Off-beat chord stabs (house organ / dub techno). */
  stabs: Steps | null;
  /** Low reverb "rumble" under the kick (techno). */
  rumble: boolean;
  /** 0–1: how much the kick ducks everything else (sidechain pumping). */
  sidechain: number;
  /** Every 32 bars: a 4-bar breakdown with a riser, then the drop. */
  breakdown: boolean;
  /** Highest arpeggio density (0 none … 3 sixteenths). */
  arpMax: number;
  reverb: number;
  delay: number;
  masterCutoff: number;
  /** Bar at which each layer joins the arrangement (defaults to LAYER_ENTRY_BAR). */
  entry?: Partial<Record<LayerId, number>>;
}

const QUIET_DRUMS = (kick: Steps, minEnergy: number, hat: Steps = steps({})): MusicPreset['drums'] => ({
  kick: [kick, kick],
  hat: [hat, hat],
  openHat: steps({}),
  snare: steps({}),
  clap: false,
  minEnergy,
  fill: 'none',
});

export const PRESETS: Record<PresetId, MusicPreset> = {
  ambient: {
    id: 'ambient',
    label: 'Ambient',
    description: 'Soft pads, gentle plucks, spacious reverb',
    tempo: 78,
    progressions: [
      ['Dm9', 'Fmaj9', 'Cmaj9', 'G6/9'],
      ['Dm9', 'Am7', 'Cmaj9', 'G6/9'],
      ['Fmaj9', 'Cmaj9', 'Dm9', 'Am7'],
    ],
    barsPerChord: 2,
    swing: 0,
    leadVoices: [
      ['glass', 'pluck', 'mallet'],
      ['kalimba', 'flute', 'glass'],
      ['bell', 'keys', 'pluck'],
    ],
    rhythms: [[0, 8], [0, 6, 12], [0, 4, 10], [0, 6, 8, 12], [0, 3, 8, 11, 14]],
    motif: false,
    pad: { osc: 'fatsine', attack: 2.5, release: 6, volume: -19, cutoff: 1500 },
    drums: QUIET_DRUMS(steps({ 0: 0.55 }), 0.35, steps({ 8: 0.35 })),
    bass: { style: 'pattern', pattern: { 0: 'root' }, length: '1m', osc: 'sine' },
    stabs: null,
    rumble: false,
    sidechain: 0,
    breakdown: false,
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
    progressions: [
      ['Dm9', 'G9', 'Cmaj9', 'Am7'],
      ['Dm9', 'Em7', 'Fmaj9', 'G9'],
      ['Am7', 'Dm9', 'G9', 'Cmaj9'],
    ],
    barsPerChord: 1,
    swing: 0.32,
    leadVoices: [
      ['keys', 'mallet', 'pluck'],
      ['organ', 'keys', 'kalimba'],
      ['keys', 'flute', 'mallet'],
    ],
    rhythms: [[0, 10], [0, 6, 10], [2, 6, 10, 14], [0, 3, 6, 10, 12], [0, 3, 6, 8, 11, 14]],
    motif: false,
    pad: { osc: 'triangle', attack: 0.25, release: 2.2, volume: -21, cutoff: 1100 },
    drums: {
      kick: [steps({ 0: 0.8, 7: 0.45, 10: 0.7 }), steps({ 0: 0.8, 10: 0.7, 11: 0.4 })],
      hat: [
        steps({ 0: 0.5, 2: 0.3, 4: 0.5, 6: 0.3, 8: 0.5, 10: 0.3, 12: 0.5, 14: 0.35 }),
        steps({ 0: 0.5, 2: 0.3, 4: 0.5, 6: 0.3, 7: 0.2, 8: 0.5, 10: 0.3, 12: 0.5, 14: 0.35, 15: 0.2 }),
      ],
      openHat: steps({}),
      snare: steps({ 4: 0.7, 12: 0.7 }),
      clap: false,
      minEnergy: 0,
      fill: 'snare',
    },
    bass: { style: 'pattern', pattern: { 0: 'root', 7: 'fifth', 10: 'root' }, length: '8n', osc: 'triangle' },
    stabs: null,
    rumble: false,
    sidechain: 0,
    breakdown: false,
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
    progressions: [
      ['Dm(add9)', 'Fmaj7', 'Cmaj7/E', 'G6/9', 'Dm9', 'Am7', 'Fmaj9', 'G6/9'],
      ['Dm9', 'Cmaj7/E', 'Fmaj9', 'G6/9', 'Am7', 'Fmaj7', 'G6/9', 'Dm(add9)'],
    ],
    barsPerChord: 2,
    swing: 0,
    leadVoices: [
      ['glass', 'keys', 'pluck'],
      ['flute', 'bell', 'glass'],
    ],
    rhythms: [[0], [0, 8], [0, 6, 12], [0, 4, 8, 12], [0, 3, 6, 8, 12]],
    motif: false,
    pad: { osc: 'fattriangle', attack: 3, release: 7, volume: -17, cutoff: 1900 },
    drums: { ...QUIET_DRUMS(steps({ 0: 0.6, 8: 0.25 }), 0.45), snare: steps({ 12: 0.3 }) },
    bass: { style: 'pattern', pattern: { 0: 'root' }, length: '1m', osc: 'sine' },
    stabs: null,
    rumble: false,
    sidechain: 0,
    breakdown: false,
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
    progressions: [
      ['Dm7', 'Fmaj7', 'Am7', 'G6/9'],
      ['Dm9', 'Cmaj9', 'G6/9', 'Am7'],
    ],
    barsPerChord: 1,
    swing: 0.08,
    leadVoices: [
      ['bright', 'pluck', 'mallet'],
      ['supersaw', 'chip', 'kalimba'],
    ],
    rhythms: [[0, 6, 12], [0, 4, 8, 12], [0, 3, 6, 10, 12], [0, 2, 6, 8, 10, 14], [0, 2, 4, 6, 8, 10, 12, 14]],
    motif: false,
    pad: { osc: 'fattriangle', attack: 0.4, release: 2.5, volume: -21, cutoff: 1700 },
    drums: {
      kick: [every(4, 0.85), steps({ 0: 0.85, 4: 0.75, 8: 0.85, 11: 0.4, 12: 0.75 })],
      hat: [every(4, 0.5, 2), every(2, 0.4, 1)],
      openHat: steps({}),
      snare: steps({ 4: 0.5, 12: 0.5 }),
      clap: false,
      minEnergy: 0,
      fill: 'hats',
    },
    bass: { style: 'pattern', pattern: { 2: 'root', 6: 'root', 10: 'fifth', 14: 'root' }, length: '16n', osc: 'triangle' },
    stabs: null,
    rumble: false,
    sidechain: 0.25,
    breakdown: false,
    arpMax: 3,
    reverb: 0.35,
    delay: 0.22,
    masterCutoff: 14000,
  },
  techno: {
    id: 'techno',
    label: 'Techno',
    description: 'Four-to-the-floor, rumbling kick, acid bassline, breakdowns and drops',
    tempo: 128,
    progressions: [
      ['Dm7', 'Dm7', 'Dm(add9)', 'Dm7'],
      ['Dm7', 'Dm7', 'Am7', 'Dm7'],
      ['Dm9', 'Dm9', 'Fmaj7', 'G6/9'],
    ],
    barsPerChord: 2,
    swing: 0.05,
    leadVoices: [
      ['bell', 'chip', 'glass'],
      ['supersaw', 'kalimba', 'pluck'],
      ['organ', 'bell', 'chip'],
    ],
    rhythms: [[0, 6], [0, 3, 6, 10], [0, 3, 6, 10, 13], [0, 2, 6, 8, 11, 14]],
    motif: true,
    pad: { osc: 'fatsawtooth', attack: 1.2, release: 3, volume: -27, cutoff: 900 },
    drums: {
      kick: [every(4, 1), steps({ 0: 1, 4: 1, 8: 1, 12: 1, 15: 0.3 })],
      hat: [
        steps({ 0: 0.18, 1: 0.12, 3: 0.15, 5: 0.12, 7: 0.15, 9: 0.12, 11: 0.15, 13: 0.12, 15: 0.15 }),
        Array.from({ length: 16 }, (_, i) => (i % 2 ? 0.2 : 0.12)),
      ],
      openHat: every(4, 0.6, 2),
      snare: steps({ 4: 0.7, 12: 0.7 }),
      clap: true,
      minEnergy: 0,
      fill: 'snare',
    },
    bass: { style: 'acid' },
    stabs: steps({ 6: 0.45, 14: 0.35 }),
    rumble: true,
    sidechain: 0.6,
    breakdown: true,
    arpMax: 2,
    reverb: 0.3,
    delay: 0.3,
    masterCutoff: 16000,
    entry: { drums: 0, bass: 4, arp: 8, pad: 8, lead: 12 },
  },
  house: {
    id: 'house',
    label: 'Deep House',
    description: 'Warm organ stabs, shuffled hats, rolling bass',
    tempo: 122,
    progressions: [
      ['Dm9', 'Am7'],
      ['Dm9', 'G9', 'Am7', 'G9'],
      ['Fmaj9', 'Em7', 'Dm9', 'Cmaj9'],
    ],
    barsPerChord: 2,
    swing: 0.18,
    leadVoices: [
      ['keys', 'kalimba', 'flute'],
      ['organ', 'pluck', 'bell'],
    ],
    rhythms: [[0, 10], [0, 6, 10], [0, 3, 10, 12], [2, 6, 10, 13]],
    motif: true,
    pad: { osc: 'fattriangle', attack: 0.8, release: 3, volume: -24, cutoff: 1300 },
    drums: {
      kick: [every(4, 0.95), every(4, 0.95)],
      hat: [every(4, 0.45, 2), steps({ 2: 0.45, 3: 0.15, 6: 0.45, 7: 0.15, 10: 0.45, 11: 0.15, 14: 0.45, 15: 0.15 })],
      openHat: steps({ 14: 0.35 }),
      snare: steps({ 4: 0.6, 12: 0.6 }),
      clap: true,
      minEnergy: 0,
      fill: 'hats',
    },
    bass: { style: 'pattern', pattern: { 2: 'root', 5: 'root', 10: 'fifth', 13: 'root' }, length: '8n', osc: 'sine' },
    stabs: steps({ 2: 0.6, 7: 0.4, 10: 0.55 }),
    rumble: false,
    sidechain: 0.45,
    breakdown: true,
    arpMax: 1,
    reverb: 0.35,
    delay: 0.25,
    masterCutoff: 12000,
    entry: { drums: 0, pad: 2, bass: 4, lead: 8, arp: 8 },
  },
  synthwave: {
    id: 'synthwave',
    label: 'Synthwave',
    description: 'Retro 80s: driving octave bass, big snare, supersaw leads',
    tempo: 100,
    progressions: [
      ['Dm7', 'Cmaj9', 'G6/9', 'Am7'],
      ['Fmaj7', 'G6/9', 'Am7', 'Dm7'],
    ],
    barsPerChord: 1,
    swing: 0,
    leadVoices: [
      ['supersaw', 'chip', 'bright'],
      ['chip', 'supersaw', 'bell'],
    ],
    rhythms: [[0, 8], [0, 6, 12], [0, 4, 8, 12], [0, 3, 6, 8, 12, 14]],
    motif: true,
    pad: { osc: 'fatsawtooth', attack: 0.6, release: 2.5, volume: -23, cutoff: 1800 },
    drums: {
      kick: [steps({ 0: 1, 8: 0.9 }), steps({ 0: 1, 8: 0.9, 10: 0.5 })],
      hat: [every(2, 0.35), every(2, 0.35)],
      openHat: steps({}),
      snare: steps({ 4: 0.9, 12: 0.9 }),
      clap: false,
      minEnergy: 0,
      fill: 'snare',
    },
    bass: { style: 'arp' },
    stabs: null,
    rumble: false,
    sidechain: 0.3,
    breakdown: false,
    arpMax: 2,
    reverb: 0.45,
    delay: 0.3,
    masterCutoff: 13000,
  },
};

/**
 * Layers fade in as the arrangement progresses (by arrangement bar), so a piece starts
 * with just the pad and builds up instead of everything starting at once.
 */
export const LAYER_ENTRY_BAR: Record<LayerId, number> = { pad: 0, lead: 2, bass: 4, arp: 6, drums: 8 };

export const entryBar = (preset: MusicPreset, layer: LayerId) => preset.entry?.[layer] ?? LAYER_ENTRY_BAR[layer];

/** All voices a preset can use (only these get built). */
export const presetVoices = (preset: MusicPreset): VoiceId[] => [...new Set(preset.leadVoices.flat())];
