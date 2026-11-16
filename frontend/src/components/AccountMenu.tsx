import { useEffect, useRef, useState } from 'react';
import { accountStore, manageSubscription, openPricing, signIn, signOut } from '../state/account';
import { useStore } from '../state/store';

const GITHUB_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

/** Top-bar account control: "Sign in" when signed out, avatar + menu when signed in. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { me, loaded, busy } = useStore(accountStore);
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!loaded || !me.signInAvailable) return null;

  if (!me.signedIn) {
    return (
      <button className={`btn btn--ghost account-signin${compact ? ' account-signin--compact' : ''}`} onClick={() => signIn()}>
        {GITHUB_ICON}
        <span className="account-signin__label">Sign in</span>
      </button>
    );
  }

  return (
    <div className="account" ref={ref}>
      <button className="account__button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Account">
        {me.avatarUrl && !avatarFailed ? <img src={me.avatarUrl} alt="" className="account__avatar" onError={() => setAvatarFailed(true)} /> : <span className="account__avatar account__avatar--blank">{me.login?.[0]?.toUpperCase()}</span>}
        {me.pro && <span className="account__pro">PRO</span>}
      </button>
      {open && (
        <div className="account__menu panel" role="menu">
          <div className="account__who">
            <strong>{me.name || me.login}</strong>
            <span>@{me.login}</span>
            <span className={`plan-badge${me.pro ? ' plan-badge--pro' : ''}`}>{me.pro ? 'Pro' : 'Free plan'}</span>
          </div>
          {me.billingEnabled && !me.pro && (
            <button role="menuitem" className="btn btn--accent btn--block" onClick={() => (setOpen(false), openPricing())}>
              ✨ Upgrade to Pro
            </button>
          )}
          {me.billingEnabled && me.hasBillingAccount && (
            <button role="menuitem" className="btn btn--ghost btn--block" disabled={busy} onClick={() => manageSubscription()}>
              Manage subscription
            </button>
          )}
          <button role="menuitem" className="btn btn--ghost btn--block" onClick={() => (setOpen(false), void signOut())}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
