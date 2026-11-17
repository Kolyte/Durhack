/**
 * How each shop item looks. Ids match the server catalogue (backend …/shop/ShopCatalog.java), which owns
 * names and prices; this file owns the visuals.
 */

export type ItemKind = 'skin' | 'style' | 'world' | 'bundle';
export type StyleId = 'style.classic' | 'style.future' | 'style.kingdom' | 'style.pagoda';
export type WindowPattern = 'grid' | 'scan' | 'gold' | 'frost' | 'cracks' | 'code' | 'sprinkle';

/** Building skin: materials and window pattern of Code City. */
export interface SkinDef {
  windows: WindowPattern;
  /** Colours the metric ramp maps onto (low → high). Null keeps the default teal → pink ramp. */
  ramp: string[] | null;
  /** Wall colour, if the skin has its own (otherwise walls are a dark shade of the metric colour). */
  wall: string | null;
  roughness: number;
  metalness: number;
  /** Multiplies how bright the windows glow. */
  glow: number;
  /** Windows scroll downwards (Matrix code rain), in texture repeats per second. */
  scroll: number;
}

export interface SunDef {
  color: string;
  /** Retro horizontal stripes cut through the lower half. */
  striped: boolean;
  /** Angular size (0–1, fraction of the sky). */
  size: number;
  /** Height above the horizon, -0.2 (below) … 1 (overhead). */
  elevation: number;
}

/** A city background: sky, ground, water, trees and weather. */
export interface WorldDef {
  /** Gradient sky; null keeps the deep-space starfield. */
  sky: { top: string; horizon: string; bottom: string } | null;
  stars: boolean;
  background: string;
  fog: string;
  sun: SunDef | null;
  /** Earth hanging in the sky (Lunar Base). */
  earth: boolean;
  aurora: boolean;
  weather: { kind: 'snow' | 'rain' | 'petals' | 'embers' | 'dust'; color: string; amount: number } | null;
  /** Neon grid stretching to the horizon (Synthwave). */
  grid: string | null;
  asphalt: string;
  park: string;
  parkGlow: string;
  water: string;
  waterGlow: string;
  canopy: string[];
  lamp: string;
  rail: string;
}

export interface Visual {
  /** Shown on the shop card. */
  icon: string;
  swatch: string;
}

const NEON_RAMP = null;

export const SKINS: Record<string, SkinDef & Visual> = {
  'skin.neon': { windows: 'grid', ramp: NEON_RAMP, wall: null, roughness: 0.55, metalness: 0.5, glow: 1, scroll: 0, icon: '🏙️', swatch: 'linear-gradient(135deg,#2dd4bf,#38bdf8,#a78bfa,#f472b6)' },
  'skin.cyberpunk': { windows: 'scan', ramp: ['#22d3ee', '#818cf8', '#e879f9', '#ff2bd6'], wall: '#120a24', roughness: 0.25, metalness: 0.8, glow: 1.45, scroll: 0, icon: '🌆', swatch: 'linear-gradient(135deg,#0f0524,#ff2bd6 55%,#22d3ee)' },
  'skin.gold': { windows: 'gold', ramp: ['#fde68a', '#fbbf24', '#f59e0b', '#fb923c'], wall: '#8a6a1f', roughness: 0.22, metalness: 0.95, glow: 1.1, scroll: 0, icon: '🏆', swatch: 'linear-gradient(135deg,#78350f,#fbbf24 50%,#fef3c7)' },
  'skin.glacier': { windows: 'frost', ramp: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#a5b4fc'], wall: '#b9d7ee', roughness: 0.15, metalness: 0.1, glow: 0.9, scroll: 0, icon: '🧊', swatch: 'linear-gradient(135deg,#e0f2fe,#7dd3fc 55%,#6366f1)' },
  'skin.volcanic': { windows: 'cracks', ramp: ['#f97316', '#ef4444', '#f59e0b', '#fde047'], wall: '#120c0c', roughness: 0.95, metalness: 0.05, glow: 1.6, scroll: 0, icon: '🌋', swatch: 'linear-gradient(135deg,#0c0a09,#7f1d1d 45%,#f97316 75%,#fde047)' },
  'skin.matrix': { windows: 'code', ramp: ['#14532d', '#16a34a', '#22c55e', '#86efac'], wall: '#020a04', roughness: 0.4, metalness: 0.6, glow: 1.5, scroll: 0.35, icon: '💾', swatch: 'linear-gradient(180deg,#020a04,#16a34a 60%,#86efac)' },
  'skin.candy': { windows: 'sprinkle', ramp: ['#f9a8d4', '#c4b5fd', '#93c5fd', '#fde68a'], wall: '#fbcfe8', roughness: 0.45, metalness: 0, glow: 0.85, scroll: 0, icon: '🍬', swatch: 'linear-gradient(135deg,#fbcfe8,#c4b5fd 50%,#93c5fd)' },
};

export const STYLES: Record<string, Visual> = {
  'style.classic': { icon: '🏢', swatch: 'linear-gradient(160deg,#0b1226,#1e293b 60%,#38bdf8)' },
  'style.future': { icon: '🛸', swatch: 'linear-gradient(160deg,#0b1226,#0e7490 55%,#a5f3fc)' },
  'style.kingdom': { icon: '🏰', swatch: 'linear-gradient(160deg,#1c1917,#57534e 55%,#fcd34d)' },
  'style.pagoda': { icon: '🏯', swatch: 'linear-gradient(160deg,#1f0a0a,#b91c1c 55%,#fca5a5)' },
};

const NIGHT: WorldDef = {
  sky: null,
  stars: true,
  background: '#060914',
  fog: '#060914',
  sun: null,
  earth: false,
  aurora: false,
  weather: null,
  grid: null,
  asphalt: '#0a0f20',
  park: '#0c2a2c',
  parkGlow: '#0f766e',
  water: '#0b3a66',
  waterGlow: '#1d6fb8',
  canopy: ['#14b8a6', '#0d9488', '#2dd4bf', '#5eead4', '#a78bfa'],
  lamp: '#fde68a',
  rail: '#a78bfa',
};

export const WORLDS: Record<string, WorldDef & Visual> = {
  'world.night': { ...NIGHT, icon: '🌃', swatch: 'radial-gradient(circle at 70% 30%,#334155 0 2px,transparent 3px),linear-gradient(180deg,#060914,#0b1226)' },
  'world.synthwave': {
    ...NIGHT,
    sky: { top: '#12002e', horizon: '#ff2e88', bottom: '#2a0845' },
    stars: true,
    background: '#12002e',
    fog: '#3b0a4f',
    sun: { color: '#ffb000', striped: true, size: 0.2, elevation: 0.08 },
    grid: '#ff2bd6',
    asphalt: '#14002b',
    park: '#2a0845',
    parkGlow: '#c026d3',
    water: '#0e1a6b',
    waterGlow: '#22d3ee',
    canopy: ['#e879f9', '#f472b6', '#22d3ee', '#a78bfa'],
    lamp: '#22d3ee',
    rail: '#ff2bd6',
    icon: '🌅',
    swatch: 'linear-gradient(180deg,#12002e 0%,#7e1d8f 45%,#ff2e88 60%,#ffb000 62%,#2a0845 63%)',
  },
  'world.aurora': {
    ...NIGHT,
    sky: { top: '#020617', horizon: '#0f2b46', bottom: '#0b1d2e' },
    background: '#020617',
    fog: '#0f2b46',
    aurora: true,
    weather: { kind: 'snow', color: '#f1f5f9', amount: 1 },
    asphalt: '#c9d6e3',
    park: '#e2e8f0',
    parkGlow: '#94a3b8',
    water: '#7dd3fc',
    waterGlow: '#38bdf8',
    canopy: ['#065f46', '#047857', '#e2e8f0', '#0f766e'],
    lamp: '#fef3c7',
    rail: '#5eead4',
    icon: '🌌',
    swatch: 'linear-gradient(180deg,#020617,#064e3b 40%,#34d399 55%,#020617 75%,#e2e8f0)',
  },
  'world.neonrain': {
    ...NIGHT,
    sky: { top: '#0a0412', horizon: '#5b1145', bottom: '#14061f' },
    stars: false,
    background: '#0a0412',
    fog: '#3a0b33',
    weather: { kind: 'rain', color: '#c4b5fd', amount: 1 },
    asphalt: '#0d0a18',
    park: '#1a0f2e',
    parkGlow: '#7c3aed',
    water: '#1e1b4b',
    waterGlow: '#f472b6',
    canopy: ['#a21caf', '#7c3aed', '#db2777'],
    lamp: '#f472b6',
    rail: '#22d3ee',
    icon: '🌧️',
    swatch: 'repeating-linear-gradient(100deg,transparent 0 6px,#c4b5fd33 6px 7px),linear-gradient(180deg,#0a0412,#5b1145 70%,#14061f)',
  },
  'world.desert': {
    ...NIGHT,
    sky: { top: '#1e1b4b', horizon: '#f59e0b', bottom: '#7c2d12' },
    stars: true,
    background: '#1e1b4b',
    fog: '#9a3412',
    sun: { color: '#fb923c', striped: false, size: 0.3, elevation: 0.05 },
    weather: { kind: 'dust', color: '#fdba74', amount: 0.6 },
    asphalt: '#7c4a21',
    park: '#a16207',
    parkGlow: '#ca8a04',
    water: '#0e7490',
    waterGlow: '#22d3ee',
    canopy: ['#65a30d', '#4d7c0f', '#84cc16'],
    lamp: '#fde68a',
    rail: '#f59e0b',
    icon: '🏜️',
    swatch: 'linear-gradient(180deg,#1e1b4b,#9a3412 50%,#f59e0b 60%,#c2410c 61%,#7c2d12)',
  },
  'world.sakura': {
    ...NIGHT,
    sky: { top: '#3b2a5c', horizon: '#fbcfe8', bottom: '#f5d0e6' },
    stars: false,
    background: '#3b2a5c',
    fog: '#f0abfc',
    sun: { color: '#fff1f2', striped: false, size: 0.12, elevation: 0.25 },
    weather: { kind: 'petals', color: '#f9a8d4', amount: 1 },
    asphalt: '#4a3a5a',
    park: '#86efac',
    parkGlow: '#22c55e',
    water: '#93c5fd',
    waterGlow: '#bfdbfe',
    canopy: ['#f9a8d4', '#fbcfe8', '#f472b6', '#fda4af'],
    lamp: '#fff1f2',
    rail: '#f9a8d4',
    icon: '🌸',
    swatch: 'radial-gradient(circle at 30% 60%,#f9a8d4 0 8px,transparent 9px),linear-gradient(180deg,#3b2a5c,#fbcfe8 70%,#f5d0e6)',
  },
  'world.lunar': {
    ...NIGHT,
    sky: null,
    stars: true,
    background: '#000000',
    fog: '#05070d',
    earth: true,
    asphalt: '#4b5563',
    park: '#374151',
    parkGlow: '#64748b',
    water: '#0f172a',
    waterGlow: '#38bdf8',
    canopy: ['#94a3b8', '#cbd5e1', '#38bdf8'],
    lamp: '#e0f2fe',
    rail: '#38bdf8',
    icon: '🌍',
    swatch: 'radial-gradient(circle at 70% 35%,#3b82f6 0 12px,#1e3a8a 13px,transparent 14px),linear-gradient(180deg,#000,#111827 70%,#6b7280)',
  },
};

export const BUNDLE_VISUAL: Visual = { icon: '🎁', swatch: 'linear-gradient(135deg,#a78bfa,#f472b6,#fbbf24)' };

export function visualFor(id: string): Visual {
  return SKINS[id] ?? STYLES[id] ?? WORLDS[id] ?? BUNDLE_VISUAL;
}

export interface Loadout {
  skin: string;
  style: string;
  world: string;
}

export const DEFAULT_LOADOUT: Loadout = { skin: 'skin.neon', style: 'style.classic', world: 'world.night' };

export const skinDef = (id: string) => SKINS[id] ?? SKINS['skin.neon'];
export const worldDef = (id: string) => WORLDS[id] ?? WORLDS['world.night'];
export const styleId = (id: string): StyleId => (id in STYLES ? (id as StyleId) : 'style.classic');
