import * as Tone from 'tone';
import type { CodeDna } from '../model/codeDna';
import type { FileInfo, RepoModel } from '../model/repoModel';
import type { FileNode } from '../types';
import { createStore } from '../state/store';
import { pulseGround, pulseHub, pulseNode, travelEdge } from '../visualization/pulseBus';
import {
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
  type Section,
} from './composer';
import { buildRack, type Buses, type Rack } from './instruments';
import { LAYER_ENTRY_BAR, LAYERS, PRESETS, type LayerId, type PresetId } from './presets';
import { CHORDS, hashString, midiToNote, mulberry32, voiceChord, type Chord } from './theory';

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
}

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
  private rack!: Rack;

  private model: RepoModel | null = null;
  private dna: CodeDna | null = null;
  private sections: Section[] = [];
  private rng = mulberry32(1);

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

    const reverb = new Tone.Reverb({ decay: 7, preDelay: 0.03, wet: 1 });
    this.reverbReturn = new Tone.Gain(s.reverb * 1.2).connect(this.master);
    reverb.connect(this.reverbReturn);

    const delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.32, wet: 1 });
    const delayTone = new Tone.Filter(2500, 'lowpass');
    this.delayReturn = new Tone.Gain(preset.delay).connect(this.master);
    delay.chain(delayTone, this.delayReturn);
    delayTone.connect(new Tone.Gain(0.3).connect(reverb));

    const bus = (layer: LayerId) => {
      const v = new Tone.Volume(0).connect(this.master);
      v.connect(new Tone.Gain(SENDS[layer].reverb).connect(reverb));
      if (SENDS[layer].delay > 0) v.connect(new Tone.Gain(SENDS[layer].delay).connect(delay));
      v.mute = !s.layers[layer];
      return v;
    };
    this.buses = { pad: bus('pad'), lead: bus('lead'), arp: bus('arp'), bass: bus('bass'), drums: bus('drums') };
    this.rack = buildRack(preset, this.buses);

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
    this.rng = mulberry32(hashString(repoName));
    this.resetCounters();
    this.mode = 'analysing';
    this.analysisQueue = [];
    this.sections = [];
    engineStore.set({ mode: 'analysing', sections: [], sectionIndex: 0, energy: defaultEnergy });
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
    playhead.sectionIndex = 0;
    engineStore.set({ sectionIndex: 0 });
  }

  /** Jumps the composition (and therefore the tour camera) to another section, starting at its next bar. */
  jumpToSection(index: number) {
    if (this.mode !== 'composition' || this.sections.length === 0) return;
    const i = ((index % this.sections.length) + this.sections.length) % this.sections.length;
    this.sectionIndex = i;
    this.barInSection = 0;
    this.walkPos = 0;
    // Skip the gradual build-up when jumping around: everything is already playing.
    this.arrangementBar = Math.max(this.arrangementBar, 8);
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
    engineStore.set({ playing: false, mode: 'idle', sections: [], activeLayers: [] });
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
    Object.values(this.rack.leads).forEach((l) => l.synth.releaseAll());
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
    playhead.focusFileId = null;
    playhead.sectionIndex = 0;
  }

  // ───────────────────────────── settings ─────────────────────────────

  setPreset(id: PresetId) {
    const preset = PRESETS[id];
    engineStore.set({ preset: id, tempo: preset.tempo, reverb: preset.reverb });
    if (!this.ready) return;
    const old = this.rack;
    old.pad.releaseAll();
    Object.values(old.leads).forEach((l) => l.synth.releaseAll());
    setTimeout(() => old.dispose(), 8000); // let tails ring out
    this.rack = buildRack(preset, this.buses);
    this.prevVoicing = null;
    Tone.getTransport().bpm.rampTo(preset.tempo, 1);
    this.reverbReturn.gain.rampTo(preset.reverb * 1.2, 1);
    this.delayReturn.gain.rampTo(preset.delay, 1);
    this.masterFilter.frequency.rampTo(preset.masterCutoff, 1);
  }

  setVolume(v: number) {
    engineStore.set({ volume: v });
    if (this.ready) this.master.volume.rampTo(v <= 0.001 ? -Infinity : Tone.gainToDb(v), 0.1);
  }

  setMuted(muted: boolean) {
    engineStore.set({ muted });
    if (this.ready) Tone.getDestination().mute = muted;
  }

  setTempo(bpm: number) {
    engineStore.set({ tempo: bpm });
    if (this.ready) Tone.getTransport().bpm.rampTo(bpm, 0.5);
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

  private layerActive(layer: LayerId): boolean {
    if (this.mode === 'analysing') return layer === 'pad' || layer === 'lead';
    if (this.mode !== 'composition') return false;
    return this.arrangementBar >= LAYER_ENTRY_BAR[layer];
  }

  private onBar(time: number) {
    const s = engineStore.get();
    const preset = PRESETS[s.preset];
    const energy = s.energy;
    const six = Tone.Time('16n').toSeconds();
    const barDur = six * 16;
    const at = (step: number) => time + step * six + (step % 2 === 1 ? preset.swing * six * 0.6 : 0);
    const rich = (this.dna?.connectivity ?? 0.5) > 0.2;

    const chord = chordForBar(preset, this.bar);
    this.currentChord = chord;
    const chordChange = this.bar % preset.barsPerChord === 0;
    const section = this.mode === 'composition' ? this.sections[this.sectionIndex] : undefined;
    const active = LAYERS.filter((l) => this.layerActive(l));

    // Fade layers in smoothly on the bar they enter.
    if (this.mode === 'composition') {
      for (const l of LAYERS) {
        if (this.arrangementBar === LAYER_ENTRY_BAR[l] && l !== 'pad') {
          this.buses[l].volume.setValueAtTime(-24, time);
          this.buses[l].volume.linearRampToValueAtTime(0, time + barDur * 2);
        }
      }
    }

    // Pad + hub glow on chord changes.
    if (chordChange && active.includes('pad')) {
      const voicing = voiceChord(chord, rich, this.prevVoicing);
      this.prevVoicing = voicing;
      this.rack.pad.triggerAttackRelease(
        voicing.map(midiToNote),
        barDur * preset.barsPerChord * 0.92,
        time,
        0.45 + energy * 0.25,
      );
      const hubKey = section?.groupKey ?? null;
      const groups = this.model?.groups ?? [];
      Tone.getDraw().schedule(() => {
        groups.forEach((g) => pulseHub(g.key, g.key === hubKey ? 1 : 0.35));
        engineStore.set({ chord: chord.name });
      }, time);
    }

    // Lead melody: one file per note, walking the current section.
    const rhythm =
      this.mode === 'analysing' ? [0, 4, 8, 12] : pickRhythm(preset, notesPerBarDensity(this.dna, energy), this.rng);
    const files = this.filesForBar(rhythm.length);
    if (files.length && active.includes('lead')) {
      const onsets = rhythm.slice(0, files.length);
      const { notes, lastMidi } = generateBar(
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
        onsets,
      );
      this.prevMidi = lastMidi;
      this.prevFile = files[(notes.length - 1) % files.length];

      notes.forEach((n, i) => {
        const file = this.model?.files.get(n.fileId) ?? files[i];
        const groupIdx = this.model?.groupIndex.get(file.group)?.index ?? hashString(file.group) % 3;
        const voice = this.rack.leads[voiceForGroup(preset, groupIdx)];
        const t = at(n.step);
        const brightness = (0.7 + complexityLevel(file.complexity) * 0.8) * (0.8 + energy * 0.4);
        voice.filter.frequency.setValueAtTime(voice.baseCutoff * brightness, t);
        const vel = this.mode === 'analysing' ? n.velocity * 0.6 : n.velocity;
        voice.synth.triggerAttackRelease(midiToNote(n.midi), n.dur * six, t, vel);
        const nextStep = notes[i + 1]?.step ?? 16;
        Tone.getDraw().schedule(() => {
          pulseNode(n.fileId, 1);
          playhead.focusFileId = n.fileId;
          if (n.fromFileId) travelEdge(n.fromFileId, n.fileId, Math.max(250, (nextStep - n.step) * six * 1000));
        }, t);
      });
    }

    // Arpeggio: rhythmic activity driven by concurrency in the files being played.
    if (active.includes('arp')) {
      const level = arpLevel(preset, files, this.dna, energy);
      const steps = arpSteps(level);
      const tones = arpNotes(chord, rich, steps.length);
      steps.forEach((st, i) =>
        this.rack.arp.triggerAttackRelease(midiToNote(tones[i]), six * 0.8, at(st), 0.2 + energy * 0.35),
      );
    }

    // Bass: roots and fifths, sitting under the pad.
    if (preset.bass && this.rack.bass && active.includes('bass') && (preset.id !== 'ambient' || energy > 0.3)) {
      let root = 36 + (chord.root % 12);
      if (root > 43) root -= 12;
      const len = preset.bass.length === '1m' ? barDur * 0.9 : Tone.Time(preset.bass.length).toSeconds();
      for (const [step, which] of Object.entries(preset.bass.pattern)) {
        const midi = which === 'root' ? root : root + 7;
        this.rack.bass.triggerAttackRelease(midiToNote(midi), len, at(Number(step)), 0.5 + energy * 0.3);
      }
    }

    // Drums: gentle, supportive; the ground pulses on every kick.
    if (active.includes('drums') && energy >= preset.drums.minEnergy) {
      const hatsOn = preset.id !== 'ambient' || energy > 0.55;
      for (let i = 0; i < 16; i++) {
        const t = at(i);
        const human = 1 + (this.rng() - 0.5) * 0.15;
        const k = preset.drums.kick[i];
        if (k) {
          this.rack.kick.triggerAttackRelease('D1', '8n', t, Math.min(1, k * (0.6 + energy * 0.5)));
          Tone.getDraw().schedule(() => pulseGround(k), t);
        }
        let h = preset.drums.hat[i];
        if (!h && preset.id === 'electronic' && energy > 0.72 && i % 2 === 1) h = 0.22;
        if (h && hatsOn) this.rack.hat.triggerAttackRelease('32n', t, Math.min(1, h * (0.5 + energy * 0.7) * human));
        const sn = preset.drums.snare[i];
        if (sn) this.rack.snare.triggerAttackRelease('16n', t, Math.min(1, sn * (0.6 + energy * 0.4) * human));
      }
    }

    // Advance the arrangement.
    this.bar++;
    if (this.mode === 'composition') {
      this.arrangementBar++;
      this.barInSection++;
      if (section && this.barInSection >= section.bars) {
        this.barInSection = 0;
        this.walkPos = 0;
        // Loop through directories again, skipping the overview after the first pass.
        this.sectionIndex =
          this.sectionIndex + 1 < this.sections.length ? this.sectionIndex + 1 : Math.min(1, this.sections.length - 1);
        const idx = this.sectionIndex;
        Tone.getDraw().schedule(() => {
          playhead.sectionIndex = idx;
          engineStore.set({ sectionIndex: idx });
        }, time + barDur);
      }
    }
    const activeNow = active.join();
    if (activeNow !== engineStore.get().activeLayers.join()) {
      Tone.getDraw().schedule(() => engineStore.set({ activeLayers: active }), time);
    }
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
    const preset = PRESETS[s.preset];
    const six = Tone.Time('16n').toSeconds();
    const t0 = Tone.now() + 0.05;
    const groupIdx = this.model?.groupIndex.get(file.group)?.index ?? 0;
    const voice = this.rack.leads[voiceForGroup(preset, groupIdx)];
    const rng = mulberry32(hashString(file.id));
    const onsets = file.loc > 300 ? [0, 4, 8] : complexityLevel(file.complexity) > 0.5 ? [0, 2, 4, 6, 8] : [0, 3, 6, 8];
    const { notes } = generateBar(
      {
        preset,
        chord: this.currentChord,
        rich: true,
        files: [file],
        prevMidi: 69,
        prevFile: undefined,
        phrasePos: 0.25,
        phraseEnd: true,
        energy: s.energy,
        rng,
      },
      onsets,
    );
    voice.filter.frequency.setValueAtTime(voice.baseCutoff * (0.8 + complexityLevel(file.complexity) * 0.7), t0);
    notes.forEach((n) => {
      voice.synth.triggerAttackRelease(midiToNote(n.midi), n.dur * six, t0 + n.step * six, n.velocity);
      Tone.getDraw().schedule(() => pulseNode(file.id, 1), t0 + n.step * six);
    });
    if (file.concurrency > 0) {
      arpNotes(this.currentChord, true, 6).forEach((m, i) =>
        this.rack.arp.triggerAttackRelease(midiToNote(m), six * 0.8, t0 + (10 + i) * six, 0.35),
      );
    }
    [...file.deps, ...file.dependents].slice(0, 4).forEach((other, i) => {
      Tone.getDraw().schedule(() => travelEdge(file.id, other, 600), t0 + (i * 2 + 1) * six);
    });
  }
}

export const audioEngine = new AudioEngine();
