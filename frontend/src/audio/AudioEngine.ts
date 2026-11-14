import * as Tone from 'tone';
import type { CodeDna } from '../model/codeDna';
import type { FileInfo, RepoModel } from '../model/repoModel';
import type { FileNode } from '../types';
import { createStore } from '../state/store';
import { pulseGround, pulseHub, pulseNode, travelEdge } from '../visualization/pulseBus';
import {
  acidNote,
  acidPattern,
  adaptMotif,
  arpLevel,
  arpNotes,
  arpSteps,
  buildSections,
  chordForBar,
  complexityLevel,
  generateBar,
  notesPerBarDensity,
  pickRhythm,
  voiceForGroup,
  type AcidStep,
  type MelodyNote,
  type Section,
} from './composer';
import { buildRack, type Buses, type LeadVoice, type Rack } from './instruments';
import { entryBar, LAYERS, PRESETS, type LayerId, type MusicPreset, type PresetId, type VoiceId } from './presets';
import { CHORDS, chordPcs, hashString, midiToNote, mulberry32, pc, scaleRange, voiceChord, type Chord } from './theory';

export interface EngineState {
  // User settings
  preset: PresetId;
  volume: number; // 0–1
  muted: boolean;
  tempo: number;
  reverb: number; // 0–1
  energy: number; // 0–1
  layers: Record<LayerId, boolean>;
  // Playback status
  ready: boolean;
  playing: boolean;
  mode: 'idle' | 'analysing' | 'composition';
  sections: { title: string; kind: Section['kind']; groupKey: string | null; fileId: string | null }[];
  sectionIndex: number;
  chord: string;
  /** Layers currently audible given the arrangement build-up. */
  activeLayers: LayerId[];
  /** Per-repository choice of progression / instrument line-up (from the repo name). */
  variant: number;
  /** How many times the tour has looped: shifts which instrument plays which directory. */
  rotation: number;
  /** Techno/house: 'breakdown' during the 4-bar break, 'drop' on the bar after. */
  phase: 'normal' | 'breakdown' | 'drop';
}

// More scheduling headroom: the 3D scene and React share the main thread with Tone's scheduler, so a
// longer look-ahead keeps notes on time during heavy frames. (Configures Tone's existing context
// rather than creating a second AudioContext.)
Tone.getContext().lookAhead = 0.2;

export const engineStore = createStore<EngineState>({
  preset: 'ambient',
  volume: 0.8,
  muted: false,
  tempo: PRESETS.ambient.tempo,
  reverb: PRESETS.ambient.reverb,
  energy: 0.45,
  layers: { pad: true, lead: true, arp: true, bass: true, drums: true },
  ready: false,
  playing: false,
  mode: 'idle',
  sections: [],
  sectionIndex: 0,
  chord: '',
  activeLayers: [],
  variant: 0,
  rotation: 0,
  phase: 'normal',
});

/** High-frequency playhead info, read every frame by the camera (kept out of React state on purpose). */
export const playhead = { focusFileId: null as string | null, sectionIndex: 0 };

const SENDS: Record<LayerId, { reverb: number; delay: number }> = {
  pad: { reverb: 0.9, delay: 0 },
  lead: { reverb: 0.55, delay: 0.35 },
  arp: { reverb: 0.5, delay: 0.45 },
  bass: { reverb: 0.08, delay: 0 },
  drums: { reverb: 0.12, delay: 0 },
};

/** Breakdown happens on bars 24–27 of every 32-bar phrase (once the track is established). */
const PHRASE = 32;
const BREAK_START = 24;
const BREAK_LEN = 4;

function pseudoInfo(n: FileNode): FileInfo {
  return { ...n, kind: n.role, group: n.directory, deps: [], dependents: [], degree: 0 };
}

class AudioEngine {
  private ready = false;
  private buses!: Buses;
  private master!: Tone.Volume;
  private masterFilter!: Tone.Filter;
  private reverbReturn!: Tone.Gain;
  private delayReturn!: Tone.Gain;
  /** Everything except drums passes through this gain, which the kick ducks (sidechain pumping). */
  private duck!: Tone.Gain;
  private riser!: { gain: Tone.Gain; filter: Tone.Filter };
  private rack!: Rack;
  /** Instruments per preset, built on first use and kept, so switching presets is instant. */
  private racks = new Map<PresetId, Rack>();
  /** The preset/tempo currently sounding. UI changes are applied on the next bar line (see onBar). */
  private activePreset!: PresetId;
  private activeTempo = 0;

  private model: RepoModel | null = null;
  private dna: CodeDna | null = null;
  private sections: Section[] = [];
  private rng = mulberry32(1);
  private variant = 0;
  private rotation = 0;

  private mode: EngineState['mode'] = 'idle';
  private bar = 0;
  private arrangementBar = 0;
  private sectionIndex = 0;
  private barInSection = 0;
  private walkPos = 0;
  private prevMidi = 69;
  private prevFile: FileInfo | undefined;
  private prevVoicing: number[] | null = null;
  private currentChord: Chord = CHORDS.Dm9;
  private analysisQueue: FileInfo[] = [];
  /** Per-section loops for motif-based presets (techno/house/synthwave). */
  private motif: MelodyNote[] | null = null;
  private acid: AcidStep[] | null = null;
  /**
   * Last start time per monophonic instrument. After a tempo change (e.g. switching to a faster preset),
   * or when a callback runs late, notes can arrive out of order; Tone.js rejects that on single-voice
   * synths, so such notes are skipped instead.
   */
  private lastStart = new WeakMap<object, number>();

  private mono(inst: object, t: number, play: () => void) {
    // Tone clamps start times that are already in the past (late callback on a busy CPU) to "now",
    // so compare the clamped time.
    const effective = Math.max(t, Tone.getContext().currentTime);
    if (effective <= (this.lastStart.get(inst) ?? -1) + 1e-4) return;
    this.lastStart.set(inst, effective);
    play();
  }

  /** Must be called from a user gesture (click) — browsers block audio until then. */
  async unlock() {
    await Tone.start();
    if (this.ready) return;
    this.setup();
    this.ready = true;
    engineStore.set({ ready: true });
  }

  private setup() {
    const s = engineStore.get();
    const preset = PRESETS[s.preset];

    this.master = new Tone.Volume(Tone.gainToDb(s.volume));
    this.masterFilter = new Tone.Filter(preset.masterCutoff, 'lowpass', -12);
    const comp = new Tone.Compressor({ threshold: -20, ratio: 2.5, attack: 0.02, release: 0.25 });
    const limiter = new Tone.Limiter(-1);
    this.master.chain(this.masterFilter, comp, limiter, Tone.getDestination());
    this.duck = new Tone.Gain(1).connect(this.master);

    const reverb = new Tone.Reverb({ decay: 7, preDelay: 0.03, wet: 1 });
    this.reverbReturn = new Tone.Gain(s.reverb * 1.2).connect(this.duck);
    reverb.connect(this.reverbReturn);

    const delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.32, wet: 1 });
    const delayTone = new Tone.Filter(2500, 'lowpass');
    this.delayReturn = new Tone.Gain(preset.delay).connect(this.duck);
    delay.chain(delayTone, this.delayReturn);
    delayTone.connect(new Tone.Gain(0.3).connect(reverb));

    const bus = (layer: LayerId) => {
      const v = new Tone.Volume(0).connect(layer === 'drums' ? this.master : this.duck);
      v.connect(new Tone.Gain(SENDS[layer].reverb).connect(reverb));
      if (SENDS[layer].delay > 0) v.connect(new Tone.Gain(SENDS[layer].delay).connect(delay));
      v.mute = !s.layers[layer];
      return v;
    };
    this.buses = { pad: bus('pad'), lead: bus('lead'), arp: bus('arp'), bass: bus('bass'), drums: bus('drums') };
    this.rack = buildRack(preset, this.buses);
    this.racks.set(s.preset, this.rack);
    this.activePreset = s.preset;
    this.activeTempo = s.tempo;

    // Breakdown riser: filtered white noise that is silent until automated.
    const riserGain = new Tone.Gain(0).connect(this.master);
    riserGain.connect(new Tone.Gain(0.6).connect(reverb));
    const riserFilter = new Tone.Filter({ frequency: 400, type: 'bandpass', Q: 2.5 }).connect(riserGain);
    new Tone.Noise('white').connect(riserFilter).start();
    this.riser = { gain: riserGain, filter: riserFilter };

    Tone.getDestination().mute = s.muted;
    const transport = Tone.getTransport();
    transport.bpm.value = s.tempo;
    transport.timeSignature = 4;
    transport.scheduleRepeat((time) => this.onBar(time), '1m', 0);
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  /** Called when a repo starts streaming: soft pad + one quiet note per analysed file. */
  async beginAnalysis(repoName: string, defaultEnergy: number) {
    await this.unlock();
    const seed = hashString(repoName);
    this.rng = mulberry32(seed);
    this.variant = seed % 997;
    this.rotation = 0;
    this.resetCounters();
    this.mode = 'analysing';
    this.analysisQueue = [];
    this.sections = [];
    engineStore.set({ mode: 'analysing', sections: [], sectionIndex: 0, energy: defaultEnergy, variant: this.variant, rotation: 0 });
    this.start();
  }

  noteAnalysed(node: FileNode) {
    if (this.mode !== 'analysing') return;
    this.analysisQueue.push(pseudoInfo(node));
    if (this.analysisQueue.length > 8) this.analysisQueue.shift();
  }

  setModel(model: RepoModel, dna: CodeDna | null) {
    this.model = model;
    this.dna = dna;
  }

  /** Switches to the full arrangement (starts from the overview and builds layers up). */
  loadComposition(model: RepoModel, dna: CodeDna) {
    this.setModel(model, dna);
    this.sections = buildSections(model);
    this.mode = 'composition';
    this.analysisQueue = [];
    this.restartArrangement();
    engineStore.set({
      mode: 'composition',
      sections: this.sections.map((s) => ({
        title: s.title,
        kind: s.kind,
        groupKey: s.groupKey,
        fileId: s.kind === 'hub' ? (s.walk[0] ?? null) : null,
      })),
    });
    this.start();
  }

  restartArrangement() {
    this.arrangementBar = 0;
    this.sectionIndex = 0;
    this.barInSection = 0;
    this.walkPos = 0;
    this.motif = null;
    this.acid = null;
    playhead.sectionIndex = 0;
    engineStore.set({ sectionIndex: 0, phase: 'normal' });
  }

  /** Jumps the composition (and therefore the tour camera) to another section, starting at its next bar. */
  jumpToSection(index: number) {
    if (this.mode !== 'composition' || this.sections.length === 0) return;
    const i = ((index % this.sections.length) + this.sections.length) % this.sections.length;
    this.sectionIndex = i;
    this.barInSection = 0;
    this.walkPos = 0;
    this.motif = null;
    this.acid = null;
    // Skip the gradual build-up when jumping around: everything is already playing.
    this.arrangementBar = Math.max(this.arrangementBar, 12);
    playhead.sectionIndex = i;
    engineStore.set({ sectionIndex: i });
  }

  start() {
    if (!this.ready) return;
    const t = Tone.getTransport();
    if (t.state !== 'started') t.start('+0.05');
    engineStore.set({ playing: true });
  }

  pause() {
    if (!this.ready) return;
    Tone.getTransport().pause();
    this.releaseAll();
    engineStore.set({ playing: false });
  }

  stop() {
    if (!this.ready) return;
    Tone.getTransport().stop();
    this.releaseAll();
    this.mode = 'idle';
    this.resetCounters();
    engineStore.set({ playing: false, mode: 'idle', sections: [], activeLayers: [], phase: 'normal' });
  }

  async togglePlay() {
    await this.unlock();
    if (engineStore.get().playing) this.pause();
    else {
      if (this.mode === 'idle' && this.model) this.loadComposition(this.model, this.dna!);
      this.start();
    }
  }

  private releaseAll() {
    this.rack.pad.releaseAll();
    this.rack.stab?.releaseAll();
    Object.values(this.rack.leads).forEach((l) => l?.synth.releaseAll());
    this.rack.acid?.synth.triggerRelease();
    this.riser.gain.gain.cancelScheduledValues(Tone.now());
    this.riser.gain.gain.rampTo(0, 0.05);
    this.prevVoicing = null;
  }

  private resetCounters() {
    this.bar = 0;
    this.arrangementBar = 0;
    this.sectionIndex = 0;
    this.barInSection = 0;
    this.walkPos = 0;
    this.prevMidi = 69;
    this.prevFile = undefined;
    this.prevVoicing = null;
    this.motif = null;
    this.acid = null;
    playhead.focusFileId = null;
    playhead.sectionIndex = 0;
  }

  // ───────────────────────────── settings ─────────────────────────────

  /**
   * Selects a preset. Its instruments are built (or fetched from the cache) right away, but the switch
   * itself happens on the next bar line, together with the tempo change, so nothing plays half a bar
   * at the wrong speed.
   */
  setPreset(id: PresetId) {
    const preset = PRESETS[id];
    engineStore.set({ preset: id, tempo: preset.tempo, reverb: preset.reverb, phase: 'normal' });
    if (this.ready) this.rackFor(id);
  }

  private rackFor(id: PresetId): Rack {
    let rack = this.racks.get(id);
    if (!rack) {
      rack = buildRack(PRESETS[id], this.buses);
      this.racks.set(id, rack);
    }
    return rack;
  }

  /** Called at the start of a bar when the selected preset differs from the sounding one. */
  private applyPreset(id: PresetId, time: number) {
    const preset = PRESETS[id];
    const old = this.rack;
    old.pad.releaseAll(time);
    old.stab?.releaseAll(time);
    Object.values(old.leads).forEach((l) => l?.synth.releaseAll(time));
    old.acid?.synth.triggerRelease(time);
    this.rack = this.rackFor(id);
    this.activePreset = id;
    this.prevVoicing = null;
    this.motif = null;
    this.acid = null;
    this.reverbReturn.gain.setValueAtTime(this.reverbReturn.gain.getValueAtTime(time), time);
    this.reverbReturn.gain.linearRampToValueAtTime(engineStore.get().reverb * 1.2, time + 0.5);
    this.delayReturn.gain.setValueAtTime(this.delayReturn.gain.getValueAtTime(time), time);
    this.delayReturn.gain.linearRampToValueAtTime(preset.delay, time + 0.5);
    this.masterFilter.frequency.setValueAtTime(this.masterFilter.frequency.getValueAtTime(time), time);
    this.masterFilter.frequency.linearRampToValueAtTime(preset.masterCutoff, time + 0.5);
    // Mid-song switch: everything plays straight away instead of re-doing the slow build-up.
    if (this.mode === 'composition' && this.arrangementBar > 0) {
      const established = Math.max(...LAYERS.map((l) => entryBar(preset, l)));
      if (this.arrangementBar < established) this.arrangementBar = established;
    }
  }

  setVolume(v: number) {
    engineStore.set({ volume: v });
    if (this.ready) this.master.volume.rampTo(v <= 0.001 ? -Infinity : Tone.gainToDb(v), 0.1);
  }

  setMuted(muted: boolean) {
    engineStore.set({ muted });
    if (this.ready) Tone.getDestination().mute = muted;
  }

  /** The new tempo takes effect on the next bar line (see onBar). */
  setTempo(bpm: number) {
    engineStore.set({ tempo: bpm });
  }

  setReverb(r: number) {
    engineStore.set({ reverb: r });
    if (this.ready) this.reverbReturn.gain.rampTo(r * 1.2, 0.3);
  }

  setEnergy(e: number) {
    engineStore.set({ energy: e });
  }

  setLayer(layer: LayerId, on: boolean) {
    engineStore.set({ layers: { ...engineStore.get().layers, [layer]: on } });
    if (this.ready) this.buses[layer].mute = !on;
  }

  // ───────────────────────────── scheduling ─────────────────────────────

  private layerActive(preset: MusicPreset, layer: LayerId): boolean {
    if (this.mode === 'analysing') return layer === 'pad' || layer === 'lead';
    if (this.mode !== 'composition') return false;
    return this.arrangementBar >= entryBar(preset, layer);
  }

  private voice(preset: MusicPreset, groupIdx: number): LeadVoice {
    const id: VoiceId = voiceForGroup(preset, groupIdx, this.variant, this.rotation);
    return this.rack.leads[id] ?? Object.values(this.rack.leads)[0]!;
  }

  private onBar(time: number) {
    const s = engineStore.get();
    // Preset and tempo changes land exactly on the bar line.
    if (s.preset !== this.activePreset) this.applyPreset(s.preset, time);
    if (s.tempo !== this.activeTempo) {
      Tone.getTransport().bpm.setValueAtTime(s.tempo, time);
      this.activeTempo = s.tempo;
    }
    const preset = PRESETS[this.activePreset];
    const energy = s.energy;
    // Computed from the tempo of *this* bar (not the transport's current value, which may still be
    // the previous tempo while this bar is being scheduled ahead of time).
    const six = 60 / this.activeTempo / 4;
    const barDur = six * 16;
    const at = (step: number) => time + step * six + (step % 2 === 1 ? preset.swing * six * 0.6 : 0);
    const rich = (this.dna?.connectivity ?? 0.5) > 0.2;
    const draw = Tone.getDraw();

    const chord = chordForBar(preset, this.bar, this.variant);
    this.currentChord = chord;
    const chordChange = this.bar % preset.barsPerChord === 0;
    const section = this.mode === 'composition' ? this.sections[this.sectionIndex] : undefined;
    const active = LAYERS.filter((l) => this.layerActive(preset, l));

    // Arrangement phase: breakdowns every 32 bars once the track is running (techno / house).
    const phraseBar = this.arrangementBar % PHRASE;
    const canBreak = preset.breakdown && this.mode === 'composition' && this.arrangementBar >= PHRASE;
    const breakdown = canBreak && phraseBar >= BREAK_START && phraseBar < BREAK_START + BREAK_LEN;
    const lastBreakBar = breakdown && phraseBar === BREAK_START + BREAK_LEN - 1;
    const drop = canBreak && phraseBar === BREAK_START + BREAK_LEN;
    const phase: EngineState['phase'] = breakdown ? 'breakdown' : drop ? 'drop' : 'normal';
    if (phase !== s.phase) draw.schedule(() => engineStore.set({ phase }), time);
    // Fill on the last bar of every 8-bar phrase (not during breakdowns).
    const fillBar = this.mode === 'composition' && this.arrangementBar % 8 === 7 && !breakdown;
    const variationB = this.arrangementBar % 8 >= 4;

    // Fade layers in smoothly on the bar they enter.
    if (this.mode === 'composition') {
      for (const l of LAYERS) {
        if (this.arrangementBar === entryBar(preset, l) && this.arrangementBar > 0) {
          this.buses[l].volume.setValueAtTime(-24, time);
          this.buses[l].volume.linearRampToValueAtTime(0, time + barDur * 2);
        }
      }
    }

    // Pad + hub glow on chord changes. In breakdowns the pad swells and the filter opens.
    if (chordChange && active.includes('pad')) {
      const voicing = voiceChord(chord, rich, this.prevVoicing);
      this.prevVoicing = voicing;
      this.rack.pad.triggerAttackRelease(
        voicing.map(midiToNote),
        barDur * preset.barsPerChord * 0.92,
        time,
        (0.45 + energy * 0.25) * (breakdown ? 1.3 : 1),
      );
      const hubKey = section?.groupKey ?? null;
      const groups = this.model?.groups ?? [];
      draw.schedule(() => {
        groups.forEach((g) => pulseHub(g.key, g.key === hubKey ? 1 : 0.35));
        engineStore.set({ chord: chord.name });
      }, time);
    }

    // Lead melody: one file per note, walking the current section.
    const rhythm =
      this.mode === 'analysing' ? [0, 4, 8, 12] : pickRhythm(preset, notesPerBarDensity(this.dna, energy), this.rng);
    const files = this.filesForBar(this.motif?.length ?? rhythm.length);
    if (files.length && active.includes('lead')) {
      let notes: MelodyNote[];
      if (preset.motif && this.mode === 'composition') {
        // Techno/house: a short motif per section, repeated and re-voiced over the chords.
        if (!this.motif) {
          this.motif = generateBar(
            { preset, chord, rich, files, prevMidi: this.prevMidi, prevFile: this.prevFile, phrasePos: 0.25, phraseEnd: true, energy, rng: this.rng },
            rhythm.slice(0, files.length),
          ).notes;
        }
        notes = adaptMotif(this.motif, chord, rich, files, this.prevFile, this.barInSection % 4 === 3);
      } else {
        const res = generateBar(
          {
            preset,
            chord,
            rich,
            files,
            prevMidi: this.prevMidi,
            prevFile: this.prevFile,
            phrasePos: (this.bar % 2) / 2,
            phraseEnd: this.bar % 2 === 1,
            energy,
            rng: this.rng,
          },
          rhythm.slice(0, files.length),
        );
        notes = res.notes;
      }
      if (notes.length) this.prevMidi = notes[notes.length - 1].midi;
      this.prevFile = files[(notes.length - 1) % files.length];

      notes.forEach((n, i) => {
        const file = this.model?.files.get(n.fileId) ?? files[i % files.length];
        const groupIdx = this.model?.groupIndex.get(file.group)?.index ?? hashString(file.group) % 3;
        const voice = this.voice(preset, groupIdx);
        const t = at(n.step);
        const brightness = (0.7 + complexityLevel(file.complexity) * 0.8) * (0.8 + energy * 0.4) * (breakdown ? 0.7 : 1);
        voice.filter.frequency.setValueAtTime(voice.baseCutoff * brightness, t);
        const vel = this.mode === 'analysing' ? n.velocity * 0.6 : n.velocity;
        voice.synth.triggerAttackRelease(midiToNote(n.midi), n.dur * six, t, vel);
        const nextStep = notes[i + 1]?.step ?? 16;
        draw.schedule(() => {
          pulseNode(n.fileId, 1);
          playhead.focusFileId = n.fileId;
          if (n.fromFileId) travelEdge(n.fromFileId, n.fileId, Math.max(250, (nextStep - n.step) * six * 1000));
        }, t);
      });
    }

    // Chord stabs (house organ / dub techno), off the beat.
    if (preset.stabs && this.rack.stab && active.includes('arp') && !breakdown) {
      const stabNotes = scaleRange(60, 74).filter((m) => chordPcs(chord, false).includes(pc(m))).slice(0, 4).map(midiToNote);
      preset.stabs.forEach((v, st) => {
        if (v) this.rack.stab!.triggerAttackRelease(stabNotes, six * 1.5, at(st), v * (0.6 + energy * 0.5));
      });
    }

    // Arpeggio: rhythmic activity driven by concurrency in the files being played.
    if (active.includes('arp') && !(preset.stabs && !breakdown)) {
      const level = arpLevel(preset, files, this.dna, energy) + (breakdown ? 1 : 0);
      const steps = arpSteps(Math.min(3, level));
      const tones = arpNotes(chord, rich, steps.length);
      steps.forEach((st, i) => this.mono(this.rack.arp, at(st), () => this.rack.arp.triggerAttackRelease(midiToNote(tones[i]), six * 0.8, at(st), 0.2 + energy * 0.35)));
    }

    // Bass: roots/fifths, an acid line, or driving octaves. Drops out in breakdowns.
    if (preset.bass && active.includes('bass') && !breakdown && (preset.id !== 'ambient' || energy > 0.3)) {
      let root = 36 + (chord.root % 12);
      if (root > 43) root -= 12;
      if (preset.bass.style === 'pattern' && this.rack.bass) {
        const len = preset.bass.length === '1m' ? barDur * 0.9 : Tone.Time(preset.bass.length).toSeconds();
        for (const [step, which] of Object.entries(preset.bass.pattern)) {
          const b = this.rack.bass;
          this.mono(b, at(Number(step)), () => b.triggerAttackRelease(midiToNote(which === 'root' ? root : root + 7), len, at(Number(step)), 0.5 + energy * 0.3));
        }
      } else if (preset.bass.style === 'arp' && this.rack.bass) {
        // Synthwave: eighth-note octave pulse.
        for (let st = 0; st < 16; st += 2) {
          const b = this.rack.bass;
          this.mono(b, at(st), () => b.triggerAttackRelease(midiToNote(st % 4 === 2 ? root + 12 : root), six * 1.6, at(st), st % 4 === 0 ? 0.8 : 0.6));
        }
      } else if (preset.bass.style === 'acid' && this.rack.acid) {
        // Acid: one 16-step loop per section, transposed to the chord. Resonance follows complexity,
        // the filter opens with energy and as the phrase builds.
        if (!this.acid) this.acid = acidPattern(files.length ? files : [], energy, this.rng);
        const cx = files.length ? files.reduce((sum, f) => sum + complexityLevel(f.complexity), 0) / files.length : 0.3;
        const { synth, filter } = this.rack.acid;
        synth.filter.Q.setValueAtTime(5 + cx * 9, time);
        const sweep = 0.35 + 0.65 * ((phraseBar % 16) / 15);
        filter.frequency.setValueAtTime(400 + 3600 * sweep * (0.6 + energy * 0.6), time);
        this.acid.forEach((a, i) => {
          const next = this.acid![i + 1]?.step ?? 16;
          const len = a.slide ? (next - a.step) * six * 1.05 : six * 0.75;
          this.mono(synth, at(a.step), () => synth.triggerAttackRelease(midiToNote(acidNote(chord, a.offset)), len, at(a.step), a.accent ? 1 : 0.55));
        });
      }
    }

    // Drums: gentle in the chill presets, driving in techno/house. The ground pulses on every kick.
    if (active.includes('drums') && energy >= preset.drums.minEnergy) {
      const d = preset.drums;
      const kickPat = d.kick[variationB ? 1 : 0];
      const hatPat = d.hat[variationB ? 1 : 0];
      const hatsOn = preset.id !== 'ambient' || energy > 0.55;
      const pump = preset.sidechain * (0.7 + energy * 0.4);
      for (let i = 0; i < 16; i++) {
        const t = at(i);
        const human = 1 + (this.rng() - 0.5) * 0.15;
        // Breakdown: no kick; the last breakdown bar builds with a snare roll.
        const k = breakdown ? 0 : kickPat[i];
        if (k) {
          const { kick, rumble } = this.rack;
          this.mono(kick, t, () => kick.triggerAttackRelease('D1', '8n', t, Math.min(1, k * (0.6 + energy * 0.5))));
          if (rumble && i % 4 === 0) this.mono(rumble, t + six * 0.5, () => rumble.triggerAttackRelease('D1', '8n', t + six * 0.5, 0.55));
          if (pump > 0) {
            this.duck.gain.setValueAtTime(1 - Math.min(0.8, pump), t);
            this.duck.gain.linearRampToValueAtTime(1, t + six * 3.2);
          }
          draw.schedule(() => pulseGround(k), t);
        }
        if (breakdown) {
          if (lastBreakBar && (i >= 8 || i % 2 === 0)) {
            const sn = this.rack.snare;
            this.mono(sn, t, () => sn.triggerAttackRelease('32n', t, 0.15 + (i / 16) * 0.6));
          }
          continue;
        }
        let h = hatPat[i];
        if (!h && preset.id === 'electronic' && energy > 0.72 && i % 2 === 1) h = 0.22;
        if (fillBar && d.fill === 'hats' && i >= 12) h = 0.35 + (i - 12) * 0.08;
        const { hat, openHat, snare, clap } = this.rack;
        if (h && hatsOn) this.mono(hat, t, () => hat.triggerAttackRelease('32n', t, Math.min(1, h * (0.5 + energy * 0.7) * human)));
        const oh = d.openHat[i];
        if (oh) this.mono(openHat, t, () => openHat.triggerAttackRelease('16n', t, Math.min(1, oh * (0.5 + energy * 0.6))));
        let sn = d.snare[i];
        if (fillBar && d.fill === 'snare' && i >= 12) sn = 0.3 + (i - 12) * 0.15;
        if (sn) {
          const v = sn;
          this.mono(snare, t, () => snare.triggerAttackRelease('16n', t, Math.min(1, v * (0.6 + energy * 0.4) * human)));
          if (d.clap && d.snare[i]) {
            // A clap is three quick noise bursts.
            for (let c = 0; c < 3; c++) this.mono(clap, t + c * 0.011, () => clap.triggerAttackRelease('64n', t + c * 0.011, v * (c === 2 ? 0.9 : 0.5)));
          }
        }
      }
      if (drop) {
        const crash = this.rack.crash;
        this.mono(crash, time, () => crash.triggerAttackRelease('2n', time, 0.8));
        draw.schedule(() => {
          pulseGround(1);
          this.model?.groups.forEach((g) => pulseHub(g.key, 1));
        }, time);
      }
    }

    // Riser across the last breakdown bar: noise sweeping up into the drop.
    if (lastBreakBar) {
      const g = this.riser.gain.gain;
      g.setValueAtTime(0, time);
      g.linearRampToValueAtTime(0.22 + energy * 0.15, time + barDur * 0.98);
      g.linearRampToValueAtTime(0, time + barDur);
      this.riser.filter.frequency.setValueAtTime(350, time);
      this.riser.filter.frequency.exponentialRampToValueAtTime(9000, time + barDur);
    }

    // Advance the arrangement.
    this.bar++;
    if (this.mode === 'composition') {
      this.arrangementBar++;
      this.barInSection++;
      if (section && this.barInSection >= section.bars) {
        this.barInSection = 0;
        this.walkPos = 0;
        this.motif = null;
        this.acid = null;
        // Loop through directories again, skipping the overview after the first pass.
        // Each loop shifts the instrument line-up so the piece keeps changing.
        const looped = this.sectionIndex + 1 >= this.sections.length;
        this.sectionIndex = looped ? Math.min(1, this.sections.length - 1) : this.sectionIndex + 1;
        if (looped) this.rotation++;
        const idx = this.sectionIndex;
        const rot = this.rotation;
        draw.schedule(() => {
          playhead.sectionIndex = idx;
          engineStore.set({ sectionIndex: idx, rotation: rot });
        }, time + barDur);
      }
    }
    if (active.join() !== s.activeLayers.join()) draw.schedule(() => engineStore.set({ activeLayers: active }), time);
  }

  private filesForBar(count: number): FileInfo[] {
    if (this.mode === 'analysing') return this.analysisQueue.splice(0, count);
    const section = this.sections[this.sectionIndex];
    if (!section || !this.model || section.walk.length === 0) return [];
    const out: FileInfo[] = [];
    for (let i = 0; i < count; i++) {
      const f = this.model.files.get(section.walk[(this.walkPos + i) % section.walk.length]);
      if (f) out.push(f);
    }
    this.walkPos += out.length;
    return out;
  }

  // ───────────────────────────── interaction ─────────────────────────────

  /** Plays a short motif for one file, right now, over the current chord. */
  async playSignature(file: FileInfo) {
    await this.unlock();
    const s = engineStore.get();
    const preset = PRESETS[this.activePreset ?? s.preset];
    const six = Tone.Time('16n').toSeconds();
    const t0 = Tone.now() + 0.05;
    const groupIdx = this.model?.groupIndex.get(file.group)?.index ?? 0;
    const voice = this.voice(preset, groupIdx);
    const rng = mulberry32(hashString(file.id));
    const onsets = file.loc > 300 ? [0, 4, 8] : complexityLevel(file.complexity) > 0.5 ? [0, 2, 4, 6, 8] : [0, 3, 6, 8];
    const { notes } = generateBar(
      { preset, chord: this.currentChord, rich: true, files: [file], prevMidi: 69, prevFile: undefined, phrasePos: 0.25, phraseEnd: true, energy: s.energy, rng },
      onsets,
    );
    voice.filter.frequency.setValueAtTime(voice.baseCutoff * (0.8 + complexityLevel(file.complexity) * 0.7), t0);
    notes.forEach((n) => {
      voice.synth.triggerAttackRelease(midiToNote(n.midi), n.dur * six, t0 + n.step * six, n.velocity);
      Tone.getDraw().schedule(() => pulseNode(file.id, 1), t0 + n.step * six);
    });
    if (file.concurrency > 0) {
      arpNotes(this.currentChord, true, 6).forEach((m, i) =>
        this.mono(this.rack.arp, t0 + (10 + i) * six, () => this.rack.arp.triggerAttackRelease(midiToNote(m), six * 0.8, t0 + (10 + i) * six, 0.35)),
      );
    }
    [...file.deps, ...file.dependents].slice(0, 4).forEach((other, i) => {
      Tone.getDraw().schedule(() => travelEdge(file.id, other, 600), t0 + (i * 2 + 1) * six);
    });
  }
}

export const audioEngine = new AudioEngine();
