import * as Tone from 'tone';

/**
 * A small generative soundtrack for Wrapped: a pad and an arpeggio in the profile's key and tempo,
 * moving to the next chord with every slide.
 */
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS: Record<string, string> = { 'B♭': 'A#', 'E♭': 'D#', 'A♭': 'G#', 'D♭': 'C#', 'G♭': 'F#', 'F♯': 'F#', 'C♯': 'C#' };

function parseKey(key: string): { root: number; minor: boolean } {
  const [name, quality] = key.split(' ');
  const n = FLATS[name] ?? name.replace('♯', '#');
  return { root: Math.max(0, NOTES.indexOf(n)), minor: quality === 'minor' };
}

const note = (semi: number, octave: number) => `${NOTES[((semi % 12) + 12) % 12]}${octave + Math.floor(semi / 12)}`;

/** Chords as scale-degree triads: major I–V–vi–IV, minor i–VI–III–VII. */
function progression(minor: boolean): number[][] {
  return minor
    ? [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]]
    : [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
}

export class Soundtrack {
  private pad?: Tone.PolySynth;
  private arp?: Tone.Synth;
  private loop?: Tone.Loop;
  private reverb?: Tone.Reverb;
  private chord = 0;
  private step = 0;
  private root = 0;
  private chords: number[][] = progression(false);

  async start(key: string, bpm: number) {
    await Tone.start();
    const { root, minor } = parseKey(key);
    this.root = root;
    this.chords = progression(minor);
    this.reverb = new Tone.Reverb({ decay: 5, wet: 0.45 }).toDestination();
    this.pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 18 }, envelope: { attack: 1.2, release: 2.5 }, volume: -20 }).connect(this.reverb);
    this.arp = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.4 }, volume: -16 }).connect(this.reverb);
    Tone.getTransport().bpm.value = Math.max(70, Math.min(150, bpm));
    this.loop = new Tone.Loop((time) => {
      const c = this.chords[this.chord % this.chords.length];
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
      this.arp?.triggerAttackRelease(note(this.root + c[pattern[this.step % 8]], 5), '16n', time);
      this.step++;
    }, '8n').start(0);
    Tone.getTransport().start();
    this.next(0);
  }

  /** Moves to the chord for a slide. */
  next(slide: number) {
    if (!this.pad) return;
    this.chord = slide;
    const c = this.chords[slide % this.chords.length];
    this.pad.releaseAll();
    this.pad.triggerAttack(c.map((s) => note(this.root + s, 3)));
  }

  setMuted(muted: boolean) {
    Tone.getDestination().mute = muted;
  }

  stop() {
    this.loop?.dispose();
    this.pad?.releaseAll();
    Tone.getTransport().stop();
    setTimeout(() => {
      this.pad?.dispose();
      this.arp?.dispose();
      this.reverb?.dispose();
    }, 3000);
  }
}
