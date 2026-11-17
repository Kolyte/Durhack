import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { visualFor } from '../cosmetics/catalog';
import { accountStore, signIn } from '../state/account';
import { activeLook, buy, closeShop, equip, formatPrice, shopStore, tryOn, type ShopItem } from '../state/shop';
import { useStore } from '../state/store';

const TABS = [
  { kind: 'skin', label: 'Skins', hint: 'Materials, colours and windows of every building.' },
  { kind: 'style', label: 'Buildings', hint: 'Swap the whole skyline for a new architecture.' },
  { kind: 'world', label: 'Worlds', hint: 'Sky, ground, water, trees and weather around your city.' },
  { kind: 'bundle', label: 'Bundles', hint: 'Everything at once, for less.' },
] as const;
type Tab = (typeof TABS)[number]['kind'];

/** Shop: try looks on your city live, buy them through Stripe Checkout, equip what you own. */
export function ShopPanel() {
  const shop = useStore(shopStore);
  const { me } = useStore(accountStore);
  const [tab, setTab] = useState<Tab>('skin');

  useEffect(() => {
    if (!shop.open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeShop();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [shop.open]);

  if (!shop.open) return null;
  const look = activeLook(shop);
  const items = shop.items.filter((i) => i.kind === tab);
  const hint = TABS.find((t) => t.kind === tab)!.hint;
  const trying = Object.keys(shop.preview).length > 0;

  return (
    <aside className="shop panel" aria-label="Shop">
      <div className="panel__head">
        <div>
          <div className="eyebrow">Sonyx Shop</div>
          <h2 className="shop__title">Make your city yours</h2>
        </div>
        <button className="btn btn--icon" onClick={closeShop} aria-label="Close shop">
          <X size={18} />
        </button>
      </div>

      <div className="segmented shop__tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.kind} role="tab" aria-selected={tab === t.kind} className={`segmented__item${tab === t.kind ? ' is-on' : ''}`} onClick={() => setTab(t.kind)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="shop__hint">{hint}</p>

      {shop.demo && shop.loaded && <p className="note shop__demo">Demo mode: payments aren't set up on this server, so everything is unlocked.</p>}
      {trying && <p className="note shop__trying">Trying on a look. It goes back when you close the shop, unless you equip it.</p>}
      {!shop.loaded && <p className="note">Loading the shop…</p>}

      <ul className="shop__grid">
        {items.map((item) => (
          <ShopCard key={item.id} item={item} wearing={item.kind !== 'bundle' && look[item.kind] === item.id} saved={item.kind !== 'bundle' && shop.loadout[item.kind] === item.id} busy={shop.busy === item.id} signedIn={me.signedIn} canSignIn={me.signInAvailable} />
        ))}
      </ul>

      <p className="modal__fine">Cosmetic only: looks never change how your code is analysed or scored. Secure payments by Stripe.</p>
    </aside>
  );
}

function ShopCard({ item, wearing, saved, busy, signedIn, canSignIn }: { item: ShopItem; wearing: boolean; saved: boolean; busy: boolean; signedIn: boolean; canSignIn: boolean }) {
  const v = visualFor(item.id);
  const Icon = v.icon;
  const bundle = item.kind === 'bundle';
  let action: React.ReactNode;
  if (item.owned) {
    action = bundle ? (
      <span className="plan-badge plan-badge--pro">Owned</span>
    ) : saved ? (
      <span className="plan-badge">Equipped</span>
    ) : (
      <button className="btn btn--ghost btn--sm" onClick={() => void equip(item)}>
        Equip
      </button>
    );
  } else if (!signedIn && canSignIn) {
    action = (
      <button className="btn btn--accent btn--sm" onClick={() => signIn('shop')}>
        Sign in to buy
      </button>
    );
  } else {
    action = (
      <button className="btn btn--accent btn--sm" disabled={busy || !canSignIn} onClick={() => void buy(item)}>
        {busy ? 'Opening…' : formatPrice(item.price)}
      </button>
    );
  }

  return (
    <li className={`shop-card${wearing ? ' is-wearing' : ''}`}>
      <button className="shop-card__preview" style={{ background: v.swatch }} onClick={() => tryOn(item)} disabled={bundle} aria-label={bundle ? item.name : `Try ${item.name} on your city`} title={bundle ? undefined : 'Try it on'}>
        <span className="shop-card__icon" aria-hidden>
          <Icon size={22} strokeWidth={1.75} />
        </span>
        {!bundle && <span className="shop-card__try">{wearing ? 'On' : 'Try'}</span>}
      </button>
      <div className="shop-card__body">
        <strong>{item.name}</strong>
        <span>{bundle ? `${item.includes.length} items · ${item.description}` : item.description}</span>
      </div>
      <div className="shop-card__action">{action}</div>
    </li>
  );
}
