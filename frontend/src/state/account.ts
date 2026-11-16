import { apiFetch } from '../api/http';
import { createStore } from './store';

/** What GET /api/me returns. */
export interface Me {
  signInAvailable: boolean;
  billingEnabled: boolean;
  priceLabel: string;
  /** May use Pro features (always true while billing isn't configured). */
  canUsePro: boolean;
  signedIn: boolean;
  login?: string;
  name?: string;
  avatarUrl?: string;
  pro?: boolean;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
  hasBillingAccount?: boolean;
}

const SIGNED_OUT: Me = { signInAvailable: false, billingEnabled: false, priceLabel: '', canUsePro: true, signedIn: false };

export const accountStore = createStore<{
  me: Me;
  loaded: boolean;
  pricingOpen: boolean;
  toast: string | null;
  busy: boolean;
}>({ me: SIGNED_OUT, loaded: false, pricingOpen: false, toast: null, busy: false });

export async function loadMe(): Promise<Me> {
  try {
    const res = await apiFetch('/api/me');
    const me = res.ok ? ((await res.json()) as Me) : SIGNED_OUT;
    accountStore.set({ me, loaded: true });
    return me;
  } catch {
    accountStore.set({ loaded: true });
    return accountStore.get().me;
  }
}

const AFTER_LOGIN = 'sonyx.afterLogin';

/** Full-page redirect to GitHub. `then` = "upgrade" reopens the pricing dialog when we come back. */
export function signIn(then?: 'upgrade') {
  try {
    if (then) localStorage.setItem(AFTER_LOGIN, then);
  } catch {
    /* private mode: just skip the follow-up */
  }
  window.location.href = '/oauth2/authorization/github';
}

export async function signOut() {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  await loadMe();
  toast('Signed out');
}

export function openPricing() {
  accountStore.set({ pricingOpen: true });
}

export function closePricing() {
  accountStore.set({ pricingOpen: false });
}

export function toast(message: string) {
  accountStore.set({ toast: message });
  window.setTimeout(() => {
    if (accountStore.get().toast === message) accountStore.set({ toast: null });
  }, 4500);
}

/** Starts Stripe Checkout (Stripe hosts the payment page). */
export async function upgrade() {
  if (!accountStore.get().me.signedIn) return signIn('upgrade');
  accountStore.set({ busy: true });
  try {
    const res = await apiFetch('/api/billing/checkout', { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
    if (res.status === 401) return signIn('upgrade');
    if (!res.ok || !data.url) throw new Error(data.message ?? 'Could not start checkout');
    window.location.href = data.url;
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not start checkout');
    accountStore.set({ busy: false });
  }
}

/** Opens the Stripe Customer Portal: change card, see invoices, cancel. */
export async function manageSubscription() {
  accountStore.set({ busy: true });
  try {
    const res = await apiFetch('/api/billing/portal', { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
    if (!res.ok || !data.url) throw new Error(data.message ?? 'Could not open billing');
    window.location.href = data.url;
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not open billing');
    accountStore.set({ busy: false });
  }
}

/**
 * On page load: fetch the account, then handle returns from GitHub sign-in and Stripe Checkout.
 * After a successful checkout the webhook may arrive a moment later, so poll briefly until Pro shows up.
 */
export async function initAccount() {
  const me = await loadMe();
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get('checkout');
  if (checkout) {
    params.delete('checkout');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    if (checkout === 'cancelled') toast('Checkout cancelled: you have not been charged.');
    if (checkout === 'success') {
      toast('Payment received: activating Pro…');
      for (let i = 0; i < 10 && !accountStore.get().me.pro; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        await loadMe();
      }
      toast(accountStore.get().me.pro ? 'Welcome to Sonyx Pro ✨' : 'Payment received. Pro will appear in a moment; refresh if not.');
    }
  }
  let next: string | null = null;
  try {
    next = localStorage.getItem(AFTER_LOGIN);
    localStorage.removeItem(AFTER_LOGIN);
  } catch {
    /* ignore */
  }
  if (next === 'upgrade' && me.signedIn && !me.pro && me.billingEnabled) openPricing();
}
