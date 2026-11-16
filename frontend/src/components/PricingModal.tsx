import { useEffect } from 'react';
import { accountStore, closePricing, manageSubscription, signIn, upgrade } from '../state/account';
import { useStore } from '../state/store';

const FREE = ['Any public GitHub repo', 'City, Galaxy and Tree views', 'All 7 music styles', 'Built-in file explanations', 'Leaderboard'];
const PRO = ['Everything in Free', '✨ Gemini AI explanations for any file', 'Bigger repos: 120 source files analysed (vs 48)', 'Support Sonyx development'];

/** Free vs Pro, with the upgrade action. Payments run on Stripe Checkout (Stripe hosts the card form). */
export function PricingModal() {
  const { me, pricingOpen, busy } = useStore(accountStore);

  useEffect(() => {
    if (!pricingOpen) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closePricing();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [pricingOpen]);

  if (!pricingOpen) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pricing-title" onMouseDown={(e) => e.target === e.currentTarget && closePricing()}>
      <div className="modal__card panel">
        <button className="btn btn--icon modal__close" onClick={closePricing} aria-label="Close">
          ✕
        </button>
        <h2 id="pricing-title" className="modal__title">
          Sonyx <span className="hero__accent">Pro</span>
        </h2>
        <p className="modal__lead">Understand codebases faster with AI explanations and bigger repositories.</p>
        <div className="plans">
          <section className="plan">
            <h3>Free</h3>
            <div className="plan__price">£0</div>
            <ul>
              {FREE.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
          <section className="plan plan--pro">
            <h3>Pro</h3>
            <div className="plan__price">{me.priceLabel || 'Pro'}</div>
            <ul>
              {PRO.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {me.pro ? (
              <button className="btn btn--ghost btn--block" disabled={busy} onClick={() => manageSubscription()}>
                You're on Pro · Manage subscription
              </button>
            ) : me.signedIn ? (
              <button className="btn btn--accent btn--block" disabled={busy} onClick={() => upgrade()}>
                {busy ? 'Opening checkout…' : `Upgrade${me.priceLabel ? ` · ${me.priceLabel}` : ''}`}
              </button>
            ) : (
              <button className="btn btn--accent btn--block" onClick={() => signIn('upgrade')}>
                Sign in with GitHub to upgrade
              </button>
            )}
          </section>
        </div>
        <p className="modal__fine">Secure payments by Stripe. Cancel anytime from “Manage subscription”.</p>
      </div>
    </div>
  );
}
