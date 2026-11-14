import * as Tone from 'tone';
import type { FileNode } from './types';

const D_DORIAN = ['D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5', 'D5'];

class CodeAudioEngine {
  private initialized = false;
  private pad!: Tone.PolySynth;
  private lead!: Tone.FMSynth;
  private arp!: Tone.MonoSynth;
  private kick!: Tone.MembraneSynth;
  private tourTimer: number | null = null;

  async init(bpm = 112) {
    await Tone.start();
    Tone.getTransport().bpm.value = bpm;

    if (!this.initialized) {
      const reverb = new Tone.Reverb({ decay: 3.2, wet: 0.35 }).toDestination();

      this.pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.8, decay: 0.5, sustain: 0.6, release: 2.0 },
      }).connect(reverb);
      this.pad.volume.value = -14;

      this.lead = new Tone.FMSynth({
        harmonicity: 2.5,
        modulationIndex: 4,
        envelope: { attack: 0.02, decay: 0.3, sustain: 0.1, release: 0.8 },
      }).connect(reverb);
      this.lead.volume.value = -8;

      this.arp = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { Q: 3, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.05, release: 0.2 },
      }).connect(reverb);
      this.arp.volume.value = -15;

      this.kick = new Tone.MembraneSynth().toDestination();
      this.kick.volume.value = -12;

      this.initialized = true;
    }

    this.pad.releaseAll();
    this.pad.triggerAttack(['D2', 'A2', 'F3', 'E4']);
  }

  triggerNode(node: FileNode) {
    if (!this.initialized) return;
    const scaleIdx = Math.min(D_DORIAN.length - 1, Math.floor(node.complexity / 2) + (node.depth % 4));
    const note = D_DORIAN[scaleIdx];
    const duration = node.loc > 250 ? '4n' : '8n';

    this.lead.modulationIndex.value = Math.min(18, 2 + node.complexity * 0.7);
    this.lead.triggerAttackRelease(note, duration);

    if (node.concurrency > 0) {
      const arpNote = D_DORIAN[(scaleIdx + 4) % D_DORIAN.length];
      this.arp.triggerAttackRelease(arpNote, '16n', '+0.08');
    }
  }

  startCompositionTour(nodes: FileNode[], onActiveNode: (id: string | null) => void) {
    this.stopTour();
    if (nodes.length === 0) return;

    let step = 0;
    this.tourTimer = window.setInterval(() => {
      const node = nodes[step % nodes.length];
      onActiveNode(node.id);
      this.triggerNode(node);

      if (step % 4 === 0) {
        this.kick.triggerAttackRelease('D1', '8n');
      }
      if (step % 16 === 0) {
        const chord = step % 32 === 0 ? ['D2', 'A2', 'F3', 'C4'] : ['G2', 'D3', 'B3', 'F4'];
        this.pad.releaseAll();
        this.pad.triggerAttack(chord);
      }
      step++;
    }, 260);
  }

  stopTour() {
    if (this.tourTimer !== null) {
      clearInterval(this.tourTimer);
      this.tourTimer = null;
    }
    if (this.initialized) {
      this.pad.releaseAll();
    }
  }
}

export const audioEngine = new CodeAudioEngine();
