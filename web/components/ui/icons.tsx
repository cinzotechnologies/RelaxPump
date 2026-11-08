// Stroke icons copied from reference/website/Main.dc.html. Colour = currentColor.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, rest: SVGProps<SVGSVGElement>) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...rest,
});

export const ArrowLeft = ({ size = 20, ...r }: P) => (
  <svg {...base(size, r)} strokeWidth={2}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const ArrowRight = ({ size = 20, ...r }: P) => (
  <svg {...base(size, r)} strokeWidth={2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const Check = ({ size = 16, ...r }: P) => (
  <svg {...base(size, r)} strokeWidth={2.6}>
    <path d="M5 12l5 5 9-10" />
  </svg>
);
export const Burger = ({ size = 22, open, ...r }: P & { open?: boolean }) => (
  <svg {...base(size, r)} strokeWidth={2}>
    <path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
  </svg>
);
export const Phone = ({ size = 17, ...r }: P) => (
  <svg {...base(size, r)} strokeWidth={2}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </svg>
);
export const Mail = ({ size = 17, ...r }: P) => (
  <svg {...base(size, r)} strokeWidth={2}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);
export const Pin = ({ size = 17, ...r }: P) => (
  <svg {...base(size, r)} strokeWidth={2}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
export const Globe = ({ size = 17, ...r }: P) => (
  <svg {...base(size, r)} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18" />
  </svg>
);
export const Play = ({ size = 30, ...r }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...r}>
    <path
      d="M8 5.5v13c0 .6.7 1 1.2.6l10-6.5c.5-.3.5-1 0-1.3l-10-6.5c-.5-.3-1.2 0-1.2.7z"
      fill="currentColor"
    />
  </svg>
);
