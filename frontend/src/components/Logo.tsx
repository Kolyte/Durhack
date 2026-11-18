/** Sonyx mark: four bars that read as both a skyline and an equaliser. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo-mark">
      <rect width="32" height="32" rx="8" fill="var(--surface-3)" />
      <g fill="var(--accent)">
        <rect x="7" y="16" width="3.4" height="9" rx="1.2" />
        <rect x="12.2" y="10" width="3.4" height="15" rx="1.2" />
        <rect x="17.4" y="6" width="3.4" height="19" rx="1.2" fillOpacity="0.85" />
        <rect x="22.6" y="13" width="3.4" height="12" rx="1.2" fillOpacity="0.7" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <a className="logo" href="/" aria-label="Sonyx home">
      <LogoMark />
      <span className="logo__word">Sonyx</span>
    </a>
  );
}
