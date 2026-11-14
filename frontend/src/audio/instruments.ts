import * as Tone from 'tone';
import type { MusicPreset, VoiceId } from './presets';

export interface Buses {
  pad: Tone.Volume;
  lead: Tone.Volume;
  arp: Tone.Volume;
  bass: Tone.Volume;
  drums: Tone.Volume;
}

export interface Rack {
  pad: Tone.PolySynth;
  leads: Record<VoiceId, { synth: Tone.PolySynth; filter: Tone.Filter; baseCutoff: number }>;
  arp: Tone.Synth;
  bass: Tone.MonoSynth | null;
  kick: Tone.MembraneSynth;
  hat: Tone.NoiseSynth;
  snare: Tone.NoiseSynth;
  dispose(): void;
}

type Disposable = { dispose(): unknown };

/** Builds the instruments for one preset. Rebuilt when the preset changes; buses/effects persist. */
export function buildRack(preset: MusicPreset, buses: Buses): Rack {
  const owned: Disposable[] = [];
  const own = <T extends Disposable>(n: T) => (owned.push(n), n);

  const padFilter = own(new Tone.Filter(preset.pad.cutoff, 'lowpass', -12)).connect(buses.pad);
  const pad = own(
    new Tone.PolySynth(Tone.Synth, {
      // fat* oscillators are detuned stacks: a soft, chorus-like width without an extra effect.
      oscillator: (preset.pad.osc.startsWith('fat')
        ? { type: preset.pad.osc, count: 3, spread: 18 }
        : { type: preset.pad.osc }) as Tone.OmniOscillatorOptions,
      envelope: { attack: preset.pad.attack, decay: 1, sustain: 0.75, release: preset.pad.release },
    }),
  ).connect(padFilter);
  pad.maxPolyphony = 24;
  pad.volume.value = preset.pad.volume;

  const lead = (synth: Tone.PolySynth, cutoff: number, volume: number) => {
    const filter = own(new Tone.Filter(cutoff, 'lowpass', -12)).connect(buses.lead);
    synth.connect(filter);
    synth.volume.value = volume;
    synth.maxPolyphony = 8;
    return { synth: own(synth), filter, baseCutoff: cutoff };
  };

  const leads: Rack['leads'] = {
    // Rounded sine with a slow-ish release: soft, bell-free.
    glass: lead(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.02, decay: 1.2, sustain: 0.2, release: 2.2 },
      }),
      3200,
      -10,
    ),
    // Short triangle pluck.
    pluck: lead(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.004, decay: 0.45, sustain: 0.05, release: 0.9 },
      }),
      2200,
      -9,
    ),
    // Electric-piano-ish: gentle FM with a quick modulation decay (the "tine").
    keys: lead(
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
    ),
    // Soft marimba-like mallet.
    mallet: lead(
      new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.002, decay: 0.7, sustain: 0, release: 0.9 },
        modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.2 },
      }),
      2800,
      -10,
    ),
    // Brighter detuned triangle for the Electronic preset (still filtered, never a raw saw).
    bright: lead(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fattriangle', count: 3, spread: 16 } as Tone.OmniOscillatorOptions,
        envelope: { attack: 0.01, decay: 0.35, sustain: 0.25, release: 0.7 },
      }),
      3600,
      -13,
    ),
  };

  const arpFilter = own(new Tone.Filter(1100, 'lowpass', -24)).connect(buses.arp);
  const arp = own(
    new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.15 },
    }),
  ).connect(arpFilter);
  arp.volume.value = -16;

  let bass: Tone.MonoSynth | null = null;
  if (preset.bass) {
    bass = own(
      new Tone.MonoSynth({
        oscillator: { type: preset.bass.osc as 'sine' | 'triangle' },
        filter: { type: 'lowpass', Q: 1, rolloff: -24 },
        filterEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.8, baseFrequency: 140, octaves: 1.6 },
        envelope: { attack: 0.03, decay: 0.4, sustain: 0.7, release: 0.9 },
      }),
    ).connect(buses.bass);
    bass.volume.value = -12;
  }

  const kickFilter = own(new Tone.Filter(700, 'lowpass')).connect(buses.drums);
  const kick = own(
    new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.1 },
    }),
  ).connect(kickFilter);
  kick.volume.value = -10;

  const hatFilter = own(new Tone.Filter(8000, 'highpass')).connect(buses.drums);
  const hat = own(
    new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 } }),
  ).connect(hatFilter);
  hat.volume.value = -27;

  const snareFilter = own(new Tone.Filter({ frequency: 1700, type: 'bandpass', Q: 0.8 })).connect(buses.drums);
  const snare = own(
    new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.13, sustain: 0, release: 0.05 } }),
  ).connect(snareFilter);
  snare.volume.value = -22;

  return {
    pad,
    leads,
    arp,
    bass,
    kick,
    hat,
    snare,
    dispose: () => owned.forEach((n) => n.dispose()),
  };
}
