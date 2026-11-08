import type { ProductArtKind } from '@/lib/content/products';
import { app, art, shade, theme } from '@/styles/tokens';

/** Drawn product images used until real photos are uploaded (Main/Shop.dc.html cards). */
export function ProductArt({ art: kind }: { art: ProductArtKind }) {
  if (kind === 'valve')
    return (
      <svg width="170" height="150" viewBox="0 0 170 150" aria-hidden>
        <rect x="14" y="84" width="142" height="24" rx="12" fill={art.pipe} />
        <rect x="58" y="70" width="54" height="52" rx="12" fill={theme.teal} />
        <rect x="66" y="26" width="38" height="46" rx="10" fill={theme.ink} />
        <path d="M74 40h22 M74 52h22" stroke={art.slot} strokeWidth="4" strokeLinecap="round" />
        <circle cx="85" cy="96" r="9" fill={theme.glow} />
      </svg>
    );
  if (kind === 'relay')
    return (
      <svg width="170" height="150" viewBox="0 0 170 150" aria-hidden>
        <rect
          x="34"
          y="30"
          width="102"
          height="90"
          rx="18"
          fill={theme.white}
          stroke={art.roof}
          strokeWidth="3"
        />
        <rect x="50" y="46" width="30" height="40" rx="6" fill={theme.teal} />
        <rect x="90" y="46" width="30" height="40" rx="6" fill={theme.teal} />
        <path d="M60 100h50" stroke={theme.teal2} strokeWidth="5" strokeLinecap="round" />
        <path
          d="M88 10l-12 22h14l-10 20"
          fill="none"
          stroke={theme.warning}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (kind === 'sensor')
    return (
      <svg width="170" height="150" viewBox="0 0 170 150" aria-hidden>
        <rect x="38" y="44" width="94" height="54" rx="14" fill={theme.teal} />
        <circle cx="66" cy="71" r="16" fill={theme.ink} />
        <circle cx="104" cy="71" r="16" fill={theme.ink} />
        <circle cx="66" cy="71" r="8" fill={theme.glow} />
        <circle cx="104" cy="71" r="8" fill={theme.glow} />
        <path d="M85 98v30" stroke={art.probe} strokeWidth="4" strokeLinecap="round" />
        <path
          d="M54 116q12 8 24 0 M92 116q12 8 24 0"
          fill="none"
          stroke={shade.aqua}
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".7"
        />
      </svg>
    );
  if (kind === 'install')
    return (
      <svg width="170" height="150" viewBox="0 0 170 150" aria-hidden>
        <path
          d="M30 70l55-42 55 42v52a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6z"
          fill={theme.white}
          stroke={art.roof}
          strokeWidth="3"
        />
        <rect x="62" y="72" width="46" height="56" rx="10" fill={theme.tint2} />
        <rect x="62" y="98" width="46" height="30" rx="0" fill={theme.glow} opacity=".8" />
        <circle cx="128" cy="40" r="20" fill={theme.teal} />
        <path
          d="M120 40l6 6 10-12"
          fill="none"
          stroke={theme.white}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  return (
    <svg width="170" height="150" viewBox="0 0 170 150" aria-hidden>
      <rect x="30" y="24" width="110" height="104" rx="22" fill={theme.ink} />
      <rect x="46" y="42" width="48" height="32" rx="7" fill={app.appCard} stroke={art.slot} />
      <circle cx="118" cy="50" r="6" fill={theme.glow} />
      <circle cx="118" cy="68" r="6" fill={shade.aqua} opacity=".6" />
      <path d="M46 92h78 M46 108h50" stroke={art.slot} strokeWidth="5" strokeLinecap="round" />
      <path
        d="M66 16a26 26 0 0 1 38 0"
        fill="none"
        stroke={theme.teal2}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
