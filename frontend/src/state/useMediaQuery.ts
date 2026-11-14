import { useSyncExternalStore } from 'react';

/** True while the CSS media query matches (updates on resize / rotation). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phones and small tablets, in portrait or landscape. Keep in sync with the CSS breakpoint in index.css. */
export const COMPACT_QUERY = '(max-width: 760px), (max-height: 520px)';

/** Touch-first devices get a lighter renderer (lower pixel ratio, no MSAA). */
export const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
