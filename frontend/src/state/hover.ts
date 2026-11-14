import { createStore } from './store';

/** Hovered file + pointer position. Kept outside App state so pointer moves don't re-render the 3D scene. */
export const hoverStore = createStore<{ id: string | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
