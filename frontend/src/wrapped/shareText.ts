import type { Wrapped } from './types';

/** The short link: chat apps and social sites show a preview card for it (see ShareController /w/{login}). */
export function wrappedLink(w: Wrapped, origin = location.origin): string {
  return `${origin}/w/${encodeURIComponent(w.login)}`;
}

export function shareText(w: Wrapped, own: boolean): string {
  return own
    ? `My code sounds like ${w.genre}. I'm ${w.persona.title} on Sonyx Wrapped ${w.year}. What does yours sound like?`
    : `${w.name || '@' + w.login}'s code sounds like ${w.genre}. Check out their Sonyx Wrapped ${w.year}.`;
}
