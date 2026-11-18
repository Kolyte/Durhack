import { describe, expect, it } from 'vitest';
import { shareText, wrappedLink } from '../shareText';
import type { Wrapped } from '../types';

const w = { login: 'octo-cat', name: 'Mona', genre: 'Synthwave', year: 2026, persona: { title: 'The Headliner', line: '' } } as Wrapped;

describe('Wrapped sharing', () => {
  it('links to the short preview URL', () => {
    expect(wrappedLink(w, 'https://sonyx.example')).toBe('https://sonyx.example/w/octo-cat');
  });
  it('speaks in the first person only for your own Wrapped', () => {
    expect(shareText(w, true)).toMatch(/^My code sounds like Synthwave/);
    expect(shareText(w, false)).toMatch(/^Mona's code sounds like Synthwave/);
  });
});
