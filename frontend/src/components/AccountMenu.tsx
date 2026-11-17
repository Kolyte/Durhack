import { useEffect, useRef, useState } from 'react';
import { CreditCard, Disc3, Github, Lock, LogOut, ShoppingBag, Sparkles, Unlock } from 'lucide-react';
import { accountStore, connectPrivateRepos, disconnectPrivateRepos, manageSubscription, openPricing, signIn, signOut } from '../state/account';
import { useStore } from '../state/store';
import { openShop } from '../state/shop';

/** Account control: "Sign in" when signed out, avatar + menu when signed in. */
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
        <Github size={16} />
        <span className="account-signin__label">Sign in</span>
      </button>
    );
  }

  const shopHere = typeof window !== 'undefined' && window.location.pathname === '/';
  return (
    <div className="account" ref={ref}>
      <button className="account__button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Account">
        {me.avatarUrl && !avatarFailed ? (
          <img src={me.avatarUrl} alt="" className="account__avatar" onError={() => setAvatarFailed(true)} />
        ) : (
          <span className="account__avatar account__avatar--blank">{me.login?.[0]?.toUpperCase()}</span>
        )}
        {me.pro && <span className="account__pro">Pro</span>}
      </button>
      {open && (
        <div className="account__menu panel" role="menu">
          <div className="account__who">
            <strong>{me.name || me.login}</strong>
            <span>@{me.login}</span>
            <span className={`plan-badge${me.pro ? ' plan-badge--pro' : ''}`}>{me.pro ? 'Pro' : 'Free plan'}</span>
          </div>
          {me.billingEnabled && !me.pro && (
            <button role="menuitem" className="btn btn--primary btn--block account__item" onClick={() => (setOpen(false), openPricing())}>
              <Sparkles size={16} /> Upgrade to Pro
            </button>
          )}
          <div className="account__items">
            {me.privateRepos ? (
              <button role="menuitem" className="btn btn--quiet account__item" onClick={() => (setOpen(false), void disconnectPrivateRepos())}>
                <Unlock size={16} /> Disconnect private repos
              </button>
            ) : (
              <button role="menuitem" className="btn btn--quiet account__item" onClick={() => (setOpen(false), me.canUsePro ? connectPrivateRepos() : openPricing())}>
                <Lock size={16} /> Connect private repos
                {!me.canUsePro && <span className="plan-badge plan-badge--pro">Pro</span>}
              </button>
            )}
            {shopHere ? (
              <button role="menuitem" className="btn btn--quiet account__item" onClick={() => (setOpen(false), openShop())}>
                <ShoppingBag size={16} /> Shop
              </button>
            ) : (
              <a role="menuitem" className="btn btn--quiet account__item" href="/?shop=open">
                <ShoppingBag size={16} /> Shop
              </a>
            )}
            <a role="menuitem" className="btn btn--quiet account__item" href={`/wrapped.html?u=${encodeURIComponent(me.login ?? '')}`}>
              <Disc3 size={16} /> Your Wrapped
            </a>
            {me.billingEnabled && me.hasBillingAccount && (
              <button role="menuitem" className="btn btn--quiet account__item" disabled={busy} onClick={() => manageSubscription()}>
                <CreditCard size={16} /> Billing and subscription
              </button>
            )}
            <button role="menuitem" className="btn btn--quiet account__item" onClick={() => (setOpen(false), void signOut())}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
