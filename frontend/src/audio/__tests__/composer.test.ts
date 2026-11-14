import { describe, expect, it } from 'vitest';
import { buildRepoModel } from '../../model/repoModel';
import { computeCodeDna } from '../../model/codeDna';
import type { FileNode } from '../../types';
import { buildSections, chordForBar, generateBar, importWalk, pickRhythm, arpNotes } from '../composer';
import { PRESETS } from '../presets';
import { CHORDS, inScale, mulberry32, voiceChord } from '../theory';

const file = (path: string, extra: Partial<FileNode> = {}): FileNode => ({
  id: path, path, directory: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
  depth: path.split('/').length - 1, loc: 120, complexity: 10, concurrency: 0, imports: 1,
  role: 'source', analyzed: true, ...extra,
});

const nodes = [
  file('lib/app.js', { loc: 600, complexity: 60 }),
  file('lib/router/index.js'),
  file('lib/router/layer.js', { concurrency: 2 }),
  file('lib/view.js', { loc: 40, complexity: 2 }),
  file('test/app.test.js', { role: 'test' }),
  file('package.json', { role: 'config' }),
  file('README.md', { role: 'docs' }),
];
const edges = [
  { sourceId: 'lib/app.js', targetId: 'lib/router/index.js' },
  { sourceId: 'lib/router/index.js', targetId: 'lib/router/layer.js' },
  { sourceId: 'lib/app.js', targetId: 'lib/view.js' },
  { sourceId: 'test/app.test.js', targetId: 'lib/app.js' },
];
const model = buildRepoModel(nodes, edges);

describe('composer', () => {
  it('keeps every melody note in D Dorian and inside the lead range', () => {
    for (const preset of Object.values(PRESETS)) {
      const rng = mulberry32(42);
      let prev = 69;
      for (let bar = 0; bar < 64; bar++) {
        const files = [...model.files.values()];
        const onsets = pickRhythm(preset, rng(), rng);
        const { notes, lastMidi } = generateBar(
          { preset, chord: chordForBar(preset, bar), rich: true, files, prevMidi: prev, prevFile: undefined,
            phrasePos: (bar % 2) / 2, phraseEnd: bar % 2 === 1, energy: 0.5, rng },
          onsets,
        );
        for (const n of notes) {
          expect(inScale(n.midi)).toBe(true);
          expect(n.midi).toBeGreaterThanOrEqual(62);
          expect(n.midi).toBeLessThanOrEqual(81);
          expect(n.step + n.dur).toBeLessThanOrEqual(18);
        }
        prev = lastMidi;
      }
    }
  });

  it('voices every chord in scale with smooth voice leading', () => {
    let prev: number[] | null = null;
    for (const name of PRESETS.cinematic.progression) {
      const v = voiceChord(CHORDS[name], true, prev);
      v.forEach((m) => expect(inScale(m)).toBe(true));
      if (prev) {
        const moved = v.slice(1).map((m) => Math.min(...prev!.slice(1).map((p) => Math.abs(p - m))));
        expect(Math.max(...moved)).toBeLessThanOrEqual(7);
      }
      prev = v;
    }
    for (const c of Object.values(CHORDS)) voiceChord(c, true, null).forEach((m) => expect(inScale(m)).toBe(true));
  });

  it('walks files along imports', () => {
    const walk = importWalk(['lib/app.js', 'lib/view.js', 'lib/router/index.js', 'lib/router/layer.js'], model);
    expect(walk[0]).toBe('lib/app.js');
    expect(walk.indexOf('lib/router/layer.js')).toBe(walk.indexOf('lib/router/index.js') + 1);
  });

  it('builds an overview, one section per directory and a hub section', () => {
    const sections = buildSections(model);
    expect(sections[0].kind).toBe('overview');
    expect(sections.filter((s) => s.kind === 'directory').length).toBe(model.groups.length);
    expect(sections.at(-1)!.kind).toBe('hub');
  });

  it('marks stepwise connections between imported files', () => {
    const files = ['lib/app.js', 'lib/router/index.js'].map((id) => model.files.get(id)!);
    const { notes } = generateBar(
      { preset: PRESETS.ambient, chord: CHORDS.Dm9, rich: true, files, prevMidi: 69, prevFile: undefined,
        phrasePos: 0, phraseEnd: false, energy: 0.5, rng: mulberry32(1) },
      [0, 8],
    );
    expect(notes[1].fromFileId).toBe('lib/app.js');
  });

  it('arpeggios stay in scale', () => {
    arpNotes(CHORDS.G9, true, 16).forEach((m) => expect(inScale(m)).toBe(true));
  });
});

describe('model + DNA', () => {
  it('upgrades entry points to modules and groups by directory', () => {
    expect(model.files.get('lib/router/index.js')!.kind).toBe('module');
    expect(model.files.get('lib/view.js')!.kind).toBe('source');
    expect(model.files.get('lib/router/layer.js')!.group).toBe('lib/router');
  });

  it('computes DNA scores in [0,1] and reports sampling', () => {
    const dna = computeCodeDna(model, { repoName: 'a/b', bpm: 90, stars: 1, totalCodeFiles: 200, sampledCodeFiles: 5, treeTruncated: false });
    for (const k of ['complexity', 'connectivity', 'modularity', 'concurrency', 'size'] as const) {
      expect(dna[k]).toBeGreaterThanOrEqual(0);
      expect(dna[k]).toBeLessThanOrEqual(1);
    }
    expect(dna.caveats.some((c) => c.includes('5 largest of 200'))).toBe(true);
  });
});

import { computeLayout } from '../../visualization/layouts';
import { explainSection, purposeOf } from '../../model/explain';

describe('tree layout + explanations', () => {
  it('puts every file on a branch tip or the roots, with the trunk first', () => {
    const layout = computeLayout(model, 'tree', null);
    expect(layout.branches[0].start).toEqual([0, 0, 0]);
    for (const id of model.files.keys()) expect(layout.files.has(id)).toBe(true);
    for (const g of model.groups) expect(layout.hubs.has(g.key)).toBe(true);
    // lib/router is a sub-branch of lib: deeper than lib's branch.
    expect(layout.branches.some((b) => b.depth === 2)).toBe(true);
  });

  it('explains common folders and the overview', () => {
    expect(purposeOf('lib/router', [])).toMatch(/Routing/);
    expect(purposeOf('test', [])).toMatch(/tests/);
    expect(purposeOf('(root)', [])).toMatch(/root/);
    const dna = computeCodeDna(model, null);
    const overview = explainSection({ kind: 'overview', title: 'Overview', groupKey: null, fileId: null }, model, null, dna);
    expect(overview.body).toMatch(/areas/);
    const hub = explainSection({ kind: 'hub', title: 'Hub', groupKey: 'lib', fileId: 'lib/app.js' }, model, null, dna);
    expect(hub.body).toMatch(/imports 2 files and is imported by 1/);
  });
});
