import { art, theme } from '@/styles/tokens';

/** Level-ring logo with gradient ring and water (top bar). */
export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id="lgr" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={art.logo1} />
          <stop offset=".55" stopColor={art.logo2} />
          <stop offset="1" stopColor={art.logo3} />
        </linearGradient>
        <linearGradient id="lgw" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={art.water1} />
          <stop offset="1" stopColor={theme.teal2} />
        </linearGradient>
        <clipPath id="lgc">
          <circle cx="24" cy="24" r="13.6" />
        </clipPath>
      </defs>
      <circle
        cx="24"
        cy="24"
        r="20.5"
        fill="none"
        stroke={theme.teal}
        strokeOpacity="0.08"
        strokeWidth="3.6"
      />
      <circle
        cx="24"
        cy="24"
        r="20.5"
        fill="none"
        stroke="url(#lgr)"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeDasharray="96.6 128.8"
        transform="rotate(128 24 24)"
      />
      <circle cx="24" cy="24" r="13.6" fill={art.pale} />
      <g clipPath="url(#lgc)">
        <path d="M6 23.5q3.75-3.2 7.5 0t7.5 0t7.5 0t7.5 0t7.5 0V40H6Z" fill={theme.glow} opacity="0.45" />
        <path d="M2 26q3.75-3.4 7.5 0t7.5 0t7.5 0t7.5 0t7.5 0t7.5 0V40H2Z" fill="url(#lgw)" />
      </g>
    </svg>
  );
}

/** Flat level-ring mark (footer tile, manual pages). */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <circle
        cx="24"
        cy="24"
        r="20.5"
        fill="none"
        stroke={art.ringBlue}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeDasharray="96.6 128.8"
        transform="rotate(128 24 24)"
      />
      <circle cx="24" cy="24" r="13.6" fill={art.pale} />
      <path d="M10.4 26q3.4-3 6.8 0t6.8 0t6.8 0t6.8 0V38H10.4z" fill={theme.teal2} />
    </svg>
  );
}

/** "Relax" light + "Pump" bold. Colour of "Relax" comes from CSS (.wm-relax). */
export function Wordmark() {
  return (
    <span>
      <span className="wm-relax">Relax</span>
      <span className="wm-pump">Pump</span>
    </span>
  );
}
