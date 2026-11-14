/**
 * Audio → visual bridge. The audio engine writes here (via Tone.Draw, in sync with what you hear);
 * 3D components read and decay these values every frame. Plain mutable maps: no React re-renders.
 */
export const pulses = {
  node: new Map<string, number>(),
  hub: new Map<string, number>(),
  ground: 0,
  /** edgeKey → { start time (performance.now ms), duration ms } */
  travel: new Map<string, { start: number; dur: number }>(),
};

export const edgeKey = (a: string, b: string) => `${a}->${b}`;

export function pulseNode(id: string, strength = 1) {
  pulses.node.set(id, Math.max(pulses.node.get(id) ?? 0, strength));
}
export function pulseHub(key: string, strength = 1) {
  pulses.hub.set(key, Math.max(pulses.hub.get(key) ?? 0, strength));
}
export function pulseGround(strength = 1) {
  pulses.ground = Math.max(pulses.ground, strength);
}
/** Sends a light along the cable between two files (direction-agnostic). */
export function travelEdge(from: string, to: string, durMs: number) {
  pulses.travel.set(edgeKey(from, to), { start: performance.now(), dur: durMs });
}

/** Reads a pulse value and decays it in place (exponential, `rate` per second). */
export function readDecay(map: Map<string, number>, key: string, delta: number, rate = 3.5): number {
  const v = map.get(key);
  if (!v) return 0;
  const next = v * Math.exp(-delta * rate);
  if (next < 0.01) map.delete(key);
  else map.set(key, next);
  return v;
}

/** Positions of files as currently rendered (written by shapes, read by cables and the camera). */
export const livePositions = new Map<string, [number, number, number]>();
export const liveHubPositions = new Map<string, [number, number, number]>();
