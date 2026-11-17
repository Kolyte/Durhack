import { apiFetch } from '../api/http';
import { DEFAULT_LOADOUT, type ItemKind, type Loadout } from '../cosmetics/catalog';
import { accountStore, signIn, toast } from './account';
import { createStore } from './store';

/** One row of GET /api/shop. */
export interface ShopItem {
  id: string;
  kind: ItemKind;
  name: string;
  description: string;
  /** Smallest currency unit (pence). 0 = free. */
  price: number;
  includes: string[];
  owned: boolean;
}

interface ShopState {
  loaded: boolean;
  /** No Stripe keys on the server: everything is unlocked. */
  demo: boolean;
  currency: string;
  items: ShopItem[];
  /** What the city currently wears (saved). */
  loadout: Loadout;
  /** "Try it on": shown in the city while the shop is open, without buying. */
  preview: Partial<Loadout>;
  open: boolean;
  busy: string | null;
  /** Bumped when the city should be shown (a look was tried or equipped). */
  showCity: number;
}

const LOCAL_KEY = 'sonyx.loadout';

function readLocal(): Loadout {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return { ...DEFAULT_LOADOUT, ...(JSON.parse(raw) as Partial<Loadout>) };
  } catch {
    /* private mode */
  }
  return DEFAULT_LOADOUT;
}

function writeLocal(l: Loadout) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
}

export const shopStore = createStore<ShopState>({
  loaded: false,
  demo: true,
  currency: 'gbp',
  items: [],
  loadout: readLocal(),
  preview: {},
  open: false,
  busy: null,
  showCity: 0,
});

/** The look to draw right now: saved loadout with any try-on applied. */
export function activeLook(s: ShopState = shopStore.get()): Loadout {
  return { ...s.loadout, ...s.preview };
}

export function owns(id: string, s: ShopState = shopStore.get()): boolean {
  const item = s.items.find((i) => i.id === id);
  if (item) return item.owned;
  // Catalogue not loaded (or backend down): only the free defaults.
  return id === DEFAULT_LOADOUT.skin || id === DEFAULT_LOADOUT.style || id === DEFAULT_LOADOUT.world;
}

export function formatPrice(pence: number, currency = shopStore.get().currency): string {
  if (pence === 0) return 'Free';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(pence / 100);
  } catch {
    return (pence / 100).toFixed(2);
  }
}

/** Keeps the loadout to items you own (e.g. after signing out, or a refund). */
function sanitize(l: Loadout): Loadout {
  const ok = (id: string, fallback: string) => (owns(id) ? id : fallback);
  return { skin: ok(l.skin, DEFAULT_LOADOUT.skin), style: ok(l.style, DEFAULT_LOADOUT.style), world: ok(l.world, DEFAULT_LOADOUT.world) };
}

export async function loadShop() {
  try {
    const res = await apiFetch('/api/shop');
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { demo: boolean; currency: string; items: ShopItem[]; loadout: Loadout | null };
    shopStore.set({ loaded: true, demo: data.demo, currency: data.currency, items: data.items });
    // Signed in with a saved look: it wins (follows you across devices). Otherwise keep this browser's.
    const loadout = sanitize(data.loadout ?? shopStore.get().loadout);
    shopStore.set({ loadout });
    writeLocal(loadout);
  } catch {
    // Backend unreachable: only the free defaults are available.
    shopStore.set({ loaded: true, loadout: DEFAULT_LOADOUT });
  }
}

export function openShop() {
  shopStore.set({ open: true });
  if (!shopStore.get().loaded) void loadShop();
}

/** Closing the shop ends any try-on. */
export function closeShop() {
  shopStore.set({ open: false, preview: {} });
}

export function tryOn(item: ShopItem) {
  if (item.kind === 'bundle') return;
  const s = shopStore.get();
  const same = activeLook(s)[item.kind] === item.id;
  shopStore.set({ preview: same ? {} : { ...s.preview, [item.kind]: item.id }, showCity: s.showCity + 1 });
}

export async function equip(item: ShopItem) {
  if (item.kind === 'bundle' || !owns(item.id)) return;
  const s = shopStore.get();
  const loadout = { ...s.loadout, [item.kind]: item.id };
  const preview = { ...s.preview };
  delete preview[item.kind];
  shopStore.set({ loadout, preview, showCity: s.showCity + 1 });
  writeLocal(loadout);
  if (accountStore.get().me.signedIn) {
    await apiFetch('/api/shop/loadout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loadout),
    }).catch(() => undefined);
  }
}

/** Opens Stripe Checkout for an item (Stripe hosts the payment page). */
export async function buy(item: ShopItem) {
  if (!accountStore.get().me.signedIn) return signIn('shop');
  shopStore.set({ busy: item.id });
  try {
    const res = await apiFetch('/api/shop/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (res.status === 401) return signIn('shop');
    if (!res.ok || !data.url) throw new Error(data.message ?? 'Could not start checkout');
    window.location.href = data.url;
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not start checkout');
    shopStore.set({ busy: null });
  }
}

/**
 * On page load: fetch the catalogue, then handle a return from Stripe (?shop=<id>&purchase=success|cancelled).
 * The webhook can arrive a moment after the redirect, so poll briefly, then wear the new item.
 */
export async function initShop(afterLogin: string | null) {
  await loadShop();
  const params = new URLSearchParams(window.location.search);
  const bought = params.get('shop');
  const result = params.get('purchase');
  if (bought && result) {
    params.delete('shop');
    params.delete('purchase');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    if (result === 'cancelled') toast('Purchase cancelled: you have not been charged.');
    if (result === 'success') {
      toast('Payment received: unlocking…');
      for (let i = 0; i < 10 && !owns(bought); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        await loadShop();
      }
      const item = shopStore.get().items.find((x) => x.id === bought);
      if (item && owns(bought)) {
        if (item.kind !== 'bundle') await equip(item);
        toast(`${item.name} unlocked and applied`);
      } else {
        toast('Payment received. Your item will appear in a moment; refresh if not.');
      }
    }
    openShop();
  } else if (afterLogin === 'shop' || bought === 'open') {
    // "Shop" from another page links here with ?shop=open.
    if (bought === 'open') {
      params.delete('shop');
      const qs = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
    openShop();
  }
}
