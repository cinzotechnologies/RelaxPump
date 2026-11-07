// Colour tokens from reference/design/Theme.dc.html and Main.dc.html.
// Screens must use these — no hard-coded colours outside this folder.

export const colors = {
  base: '#021A20',
  card: '#0A242B',
  deepCard: '#06171C',
  teal: '#035360',
  lightTeal: '#037788',
  glow: '#7FE3EC',
  glowSoft: '#B5F4F8',
  text: '#E8F6F7',
  muted: '#8FB3B8',
  faint: '#6E8A8F',
  dim: '#5E7C81',
  footer: '#7F9EA3',
  valveOff: '#B8CDD0',
  warning: '#F59E0B',
  warningLight: '#FCD34D',
  warningDeep: '#D97706',
  warningText: '#FDE68A',
  warningIcon: '#FACC15',
  dangerText: '#FCA5A5',
  notifDot: '#FF7A6B',
  white: '#FFFFFF',
  focusBg: '#0C2B33',
  waveBack: '#204449',
  waveFront: '#34646B',
  waveDeep: '#044C57',
  black: '#000000',
} as const;

/** rgba() helper so translucent variants of the tokens stay in one place. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export const gradients = {
  welcomeBg: ['#044753', '#021A20'] as const,
  header: ['#0A9AAE', '#037788', '#035360'] as const,
  cta: ['#A8F3F8', '#7FE3EC', '#2FB6C6'] as const,
  tileWhite: ['#FFFFFF', '#E3F7F9'] as const,
  avatar: ['#FFFFFF', '#DDF6F8'] as const,
  fill: ['#7FE3EC', '#037788'] as const,
  fillLow: ['#FCD34D', '#D97706'] as const,
  levelCard: ['#34646B', '#044C57'] as const,
  deviceCard: ['#0C3640', '#0A242B'] as const,
  bleActive: ['#B5F4F8', '#7FE3EC', '#1FA9B9'] as const,
};

export const fonts = {
  inter300: 'Inter_300Light',
  inter400: 'Inter_400Regular',
  inter500: 'Inter_500Medium',
  inter600: 'Inter_600SemiBold',
  inter700: 'Inter_700Bold',
  outfit300: 'Outfit_300Light',
  outfit500: 'Outfit_500Medium',
  outfit600: 'Outfit_600SemiBold',
} as const;

export const motion = {
  /** cubic-bezier(.22,1,.36,1) — screens, sheets, fills */
  ease: [0.22, 1, 0.36, 1] as const,
  /** cubic-bezier(.34,1.56,.64,1) — toggle knob */
  spring: [0.34, 1.56, 0.64, 1] as const,
  screenMs: 420,
  fadeUpMs: 500,
  staggerMs: 50,
  pressScale: 0.96,
};
