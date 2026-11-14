import { useSyncExternalStore } from 'react';

/** Minimal observable store (no dependency) shared between the audio engine and React. */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export type Store<T extends object> = ReturnType<typeof createStore<T>>;

export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Subscribes to one derived value (compared with Object.is): re-renders only when that value changes. */
export function useStoreSelector<T extends object, R>(store: Store<T>, select: (s: T) => R): R {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}
