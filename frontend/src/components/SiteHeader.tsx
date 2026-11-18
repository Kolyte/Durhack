import { useEffect, useRef, useState } from 'react';
import { Compass, Disc3, Menu, ShoppingBag, Swords, Trophy, X } from 'lucide-react';
import { accountStore, loadMe } from '../state/account';
import { AccountMenu } from './AccountMenu';
import { Logo } from './Logo';
import { PricingModal } from './PricingModal';
import { Toast } from './Toast';

export type Section = 'explore' | 'leaderboard' | 'battles' | 'wrapped';

const LINKS: { id: Section; label: string; href: string; icon: typeof Compass; hint: string }[] = [
  { id: 'explore', label: 'Explore', href: '/', icon: Compass, hint: 'See and hear a repository' },
  { id: 'leaderboard', label: 'Leaderboard', href: '/ranking.html', icon: Trophy, hint: 'Top Code DNA scores' },
  { id: 'battles', label: 'Battles', href: '/battle.html', icon: Swords, hint: 'Two repos head to head' },
  { id: 'wrapped', label: 'Wrapped', href: '/wrapped.html', icon: Disc3, hint: 'Your GitHub year as music' },
];

/**
 * The header on every page: logo, the four sections, an optional middle slot (the repo search on Explore),
 * Shop and the account menu. On phones the sections move into a menu.
 */
export function SiteHeader({
  active,
  children,
  floating = false,
  onShop,
}: {
  active: Section;
  children?: React.ReactNode;
  /** Explore: the header floats over the 3D scene instead of taking space at the top of the page. */
  floating?: boolean;
  /** Opens the shop drawer (Explore). Elsewhere, Shop links to Explore with the shop open. */
  onShop?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!accountStore.get().loaded) void loadMe();
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const shop = onShop ? (
    <button className="btn btn--quiet site-header__shop" onClick={onShop}>
      <ShoppingBag size={16} />
      <span className="site-header__label">Shop</span>
    </button>
  ) : (
    <a className="btn btn--quiet site-header__shop" href="/?shop=open">
      <ShoppingBag size={16} />
      <span className="site-header__label">Shop</span>
    </a>
  );

  return (
    <header ref={ref} className={`site-header${floating ? ' site-header--floating' : ''}`}>
      <Logo />
      <nav className="site-nav" aria-label="Sections">
        {LINKS.map(({ id, label, href, icon: Icon, hint }) => (
          <a key={id} href={href} className={`site-nav__link${active === id ? ' is-active' : ''}`} aria-current={active === id ? 'page' : undefined} title={hint}>
            <Icon size={16} />
            <span className="site-header__label">{label}</span>
          </a>
        ))}
      </nav>
      <div className="site-header__slot">{children}</div>
      <div className="site-header__actions">
        {shop}
        <AccountMenu />
        <button className="btn btn--icon site-header__menu" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Menu">
          {menu ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {menu && (
        <div className="site-menu" role="menu">
          {LINKS.map(({ id, label, href, icon: Icon, hint }) => (
            <a key={id} role="menuitem" href={href} className={`site-menu__item${active === id ? ' is-active' : ''}`}>
              <Icon size={18} />
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </a>
          ))}
          <div className="site-menu__sep" />
          {onShop ? (
            <button role="menuitem" className="site-menu__item" onClick={() => (setMenu(false), onShop())}>
              <ShoppingBag size={18} />
              <span>
                <strong>Shop</strong>
                <small>Skins, buildings and worlds for your city</small>
              </span>
            </button>
          ) : (
            <a role="menuitem" className="site-menu__item" href="/?shop=open">
              <ShoppingBag size={18} />
              <span>
                <strong>Shop</strong>
                <small>Skins, buildings and worlds for your city</small>
              </span>
            </a>
          )}
        </div>
      )}
      {/* Explore mounts these itself; other pages get them here so menu actions (upgrade, messages) work. */}
      {!floating && (
        <>
          <PricingModal />
          <Toast />
        </>
      )}
    </header>
  );
}
