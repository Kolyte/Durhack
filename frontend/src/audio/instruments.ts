import * as Tone from 'tone';
import { presetVoices, type MusicPreset, type VoiceId } from './presets';

export interface Buses {
  pad: Tone.Volume;
  lead: Tone.Volume;
  arp: Tone.Volume;
  bass: Tone.Volume;
  drums: Tone.Volume;
}

export interface LeadVoice {
  synth: Tone.PolySynth;
  filter: Tone.Filter;
  baseCutoff: number;
}

export interface Rack {
  pad: Tone.PolySynth;
  leads: Partial<Record<VoiceId, LeadVoice>>;
  arp: Tone.Synth;
  bass: Tone.MonoSynth | null;
  /** 303-style acid synth (techno). */
  acid: { synth: Tone.MonoSynth; filter: Tone.Filter } | null;
  stab: Tone.PolySynth | null;
  kick: Tone.MembraneSynth;
  /** Kick → long reverb → low-pass: the techno "rumble". */
  rumble: Tone.MembraneSynth | null;
  hat: Tone.NoiseSynth;
  openHat: Tone.NoiseSynth;
  snare: Tone.NoiseSynth;
  clap: Tone.NoiseSynth;
  crash: Tone.NoiseSynth;
  dispose(): void;
}

type Disposable = { dispose(): unknown };
type Own = <T extends Disposable>(n: T) => T;

/** One lead instrument. Each is a polyphonic synth through its own low-pass filter (brightness = complexity). */
function buildVoice(id: VoiceId, bus: Tone.ToneAudioNode, own: Own): LeadVoice {
  const make = (synth: Tone.PolySynth, cutoff: number, volume: number, extra?: Tone.ToneAudioNode): LeadVoice => {
    const filter = own(new Tone.Filter(cutoff, 'lowpass', -12)).connect(bus);
    if (extra) {
      synth.connect(extra);
      extra.connect(filter);
    } else synth.connect(filter);
    synth.volume.value = volume;
    synth.maxPolyphony = 10;
    return { synth: own(synth), filter, baseCutoff: cutoff };
  };
  switch (id) {
    case 'glass': // rounded sine, slow release
      return make(new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 1.2, sustain: 0.2, release: 2.2 } }), 3200, -10);
    case 'pluck': // short triangle pluck
      return make(new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.004, decay: 0.45, sustain: 0.05, release: 0.9 } }), 2200, -9);
    case 'keys': // electric piano: gentle FM with a quick "tine"
      return make(
        new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 3,
          modulationIndex: 1.4,
          oscillator: { type: 'sine' },
          modulation: { type: 'sine' },
          envelope: { attack: 0.004, decay: 1.4, sustain: 0.15, release: 1.3 },
          modulationEnvelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 },
        }),
        2600,
        -11,
      );
    case 'mallet': // soft marimba
      return make(
        new Tone.PolySynth(Tone.AMSynth, {
          harmonicity: 2,
          oscillator: { type: 'sine' },
          modulation: { type: 'sine' },
          envelope: { attack: 0.002, decay: 0.7, sustain: 0, release: 0.9 },
          modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
        }),
        2800,
        -10,
      );
    case 'bright': // detuned triangle stack
      return make(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fattriangle', count: 3, spread: 16 } as Tone.OmniOscillatorOptions,
          envelope: { attack: 0.01, decay: 0.35, sustain: 0.25, release: 0.7 },
        }),
        3600,
        -13,
      );
    case 'supersaw': // trance/synthwave lead: 5 detuned saws, filtered
      return make(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 3, spread: 24 } as Tone.OmniOscillatorOptions,
          envelope: { attack: 0.01, decay: 0.3, sustain: 0.45, release: 0.6 },
        }),
        2400,
        -20,
      );
    case 'kalimba': // thumb piano: high-ratio FM with a very short modulation decay
      return make(
        new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 8,
          modulationIndex: 2,
          oscillator: { type: 'sine' },
          modulation: { type: 'sine' },
          envelope: { attack: 0.003, decay: 0.55, sustain: 0, release: 0.5 },
          modulationEnvelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.05 },
        }),
        4200,
        -9,
      );
    case 'organ': // drawbar-style additive organ
      return make(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'custom', partials: [1, 0.55, 0.35, 0.22, 0, 0.12, 0, 0.06] } as Tone.OmniOscillatorOptions,
          envelope: { attack: 0.01, decay: 0.15, sustain: 0.65, release: 0.25 },
        }),
        2600,
        -17,
      );
    case 'flute': // breathy sine with vibrato
      return make(
        new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.07, decay: 0.2, sustain: 0.6, release: 0.5 } }),
        3000,
        -11,
        own(new Tone.Vibrato({ frequency: 5, depth: 0.08 })),
      );
    case 'chip': // 25% pulse wave: retro / video-game
      return make(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'pulse', width: 0.25 } as Tone.OmniOscillatorOptions,
          envelope: { attack: 0.004, decay: 0.18, sustain: 0.25, release: 0.2 },
        }),
        3000,
        -19,
      );
    case 'bell': // soft FM bell, filtered so it never gets piercing
      return make(
        new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 3.5,
          modulationIndex: 2.5,
          oscillator: { type: 'sine' },
          modulation: { type: 'sine' },
          envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.6 },
          modulationEnvelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.4 },
        }),
        3400,
        -15,
      );
  }
}

/** Builds the instruments for one preset. Rebuilt when the preset changes; buses/effects persist. */
export function buildRack(preset: MusicPreset, buses: Buses): Rack {
  const owned: Disposable[] = [];
  const own: Own = (n) => (owned.push(n), n);

  // One oscillator per pad note plus a single shared chorus for width. (Per-note detuned "fat" stacks
  // sounded similar but cost several oscillators per note and were the biggest CPU load.)
  const padChorus = own(new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.6, spread: 160, wet: 0.55 }).start()).connect(buses.pad);
  const padFilter = own(new Tone.Filter(preset.pad.cutoff, 'lowpass', -12)).connect(padChorus);
  const pad = own(
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: preset.pad.osc.replace(/^fat/, '') } as Tone.OmniOscillatorOptions,
      envelope: { attack: preset.pad.attack, decay: 1, sustain: 0.75, release: Math.min(preset.pad.release, 4) },
    }),
  ).connect(padFilter);
  pad.maxPolyphony = 12;
  pad.volume.value = preset.pad.volume + 3; // single oscillator per note is quieter than the old detuned stack

  const leads: Rack['leads'] = {};
  for (const id of presetVoices(preset)) leads[id] = buildVoice(id, buses.lead, own);

  const arpFilter = own(new Tone.Filter(1100, 'lowpass', -24)).connect(buses.arp);
  const arp = own(
    new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.15 } }),
  ).connect(arpFilter);
  arp.volume.value = -16;

  let bass: Tone.MonoSynth | null = null;
  if (preset.bass?.style === 'pattern' || preset.bass?.style === 'arp') {
    const arpStyle = preset.bass.style === 'arp';
    const osc = preset.bass.style === 'pattern' ? (preset.bass.osc as 'sine' | 'triangle') : 'sawtooth';
    bass = own(
      new Tone.MonoSynth({
        oscillator: { type: osc },
        filter: { type: 'lowpass', Q: arpStyle ? 2 : 1, rolloff: -24 },
        filterEnvelope: { attack: 0.005, decay: arpStyle ? 0.15 : 0.3, sustain: arpStyle ? 0.2 : 0.6, release: 0.3, baseFrequency: arpStyle ? 180 : 140, octaves: arpStyle ? 2.5 : 1.6 },
        envelope: { attack: arpStyle ? 0.003 : 0.03, decay: 0.3, sustain: arpStyle ? 0.4 : 0.7, release: arpStyle ? 0.1 : 0.9 },
      }),
    ).connect(buses.bass);
    bass.volume.value = arpStyle ? -15 : -12;
  }

  let acid: Rack['acid'] = null;
  if (preset.bass?.style === 'acid') {
    // TB-303 flavour: resonant 24 dB low-pass with a snappy filter envelope, a little drive, short glide.
    const drive = own(new Tone.Distortion({ distortion: 0.25, wet: 0.35 })).connect(buses.bass);
    const filter = own(new Tone.Filter(20000, 'lowpass')).connect(drive);
    const synth = own(
      new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { type: 'lowpass', Q: 7, rolloff: -24 },
        filterEnvelope: { attack: 0.002, decay: 0.16, sustain: 0.08, release: 0.08, baseFrequency: 160, octaves: 3.4 },
        envelope: { attack: 0.002, decay: 0.18, sustain: 0.35, release: 0.06 },
        portamento: 0.035,
      }),
    ).connect(filter);
    synth.volume.value = -17;
    acid = { synth, filter };
  }

  let stab: Tone.PolySynth | null = null;
  if (preset.stabs) {
    const stabFilter = own(new Tone.Filter(preset.id === 'house' ? 1800 : 1200, 'lowpass', -12)).connect(buses.arp);
    stab = own(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: (preset.id === 'house'
          ? { type: 'custom', partials: [1, 0.6, 0.4, 0.25, 0.1] }
          : { type: 'sawtooth' }) as Tone.OmniOscillatorOptions,
        envelope: { attack: 0.003, decay: 0.2, sustain: 0, release: 0.2 },
      }),
    ).connect(stabFilter);
    stab.maxPolyphony = 8;
    stab.volume.value = preset.id === 'house' ? -17 : -21;
  }

  const kickFilter = own(new Tone.Filter(preset.sidechain > 0.4 ? 1400 : 700, 'lowpass')).connect(buses.drums);
  const techno = preset.sidechain > 0.4;
  const kick = own(
    new Tone.MembraneSynth({
      pitchDecay: techno ? 0.045 : 0.03,
      octaves: techno ? 6 : 4,
      envelope: { attack: 0.001, decay: techno ? 0.45 : 0.32, sustain: 0, release: 0.1 },
    }),
  ).connect(kickFilter);
  kick.volume.value = techno ? -6 : -10;

  let rumble: Tone.MembraneSynth | null = null;
  if (preset.rumble) {
    // Rumble: a low-passed, fed-back echo of a soft kick (much cheaper than a second reverb).
    const rumbleLp = own(new Tone.Filter(120, 'lowpass', -24)).connect(buses.drums);
    const rumbleEcho = own(new Tone.FeedbackDelay({ delayTime: '16n', feedback: 0.45, wet: 1 })).connect(rumbleLp);
    rumble = own(new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 4, envelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 0.1 } })).connect(rumbleEcho);
    rumble.volume.value = -5;
  }

  const hatFilter = own(new Tone.Filter(8000, 'highpass')).connect(buses.drums);
  const hat = own(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 } })).connect(hatFilter);
  hat.volume.value = -27;

  const openHatFilter = own(new Tone.Filter(7000, 'highpass')).connect(buses.drums);
  const openHat = own(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.22, sustain: 0, release: 0.05 } })).connect(openHatFilter);
  openHat.volume.value = -27;

  const snareFilter = own(new Tone.Filter({ frequency: 1700, type: 'bandpass', Q: 0.8 })).connect(buses.drums);
  const snare = own(new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: preset.id === 'synthwave' ? 0.25 : 0.13, sustain: 0, release: 0.05 } })).connect(snareFilter);
  snare.volume.value = preset.id === 'synthwave' ? -17 : -22;

  const clapFilter = own(new Tone.Filter({ frequency: 1250, type: 'bandpass', Q: 1.3 })).connect(buses.drums);
  const clap = own(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.04 } })).connect(clapFilter);
  clap.volume.value = -18;

  const crashFilter = own(new Tone.Filter(5000, 'highpass')).connect(buses.drums);
  const crash = own(new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 0.5 } })).connect(crashFilter);
  crash.volume.value = -26;

  return {
    pad,
    leads,
    arp,
    bass,
    acid,
    stab,
    kick,
    rumble,
    hat,
    openHat,
    snare,
    clap,
    crash,
    dispose: () => owned.forEach((n) => n.dispose()),
  };
}
