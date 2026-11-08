// The only place colours live (docs/website-brief.md §1). CSS reads them as var(--name);
// SVG artwork imports them from here. Values come from reference/website/*.dc.html.

/** Theme tokens from the brief. */
export const theme = {
  ink: '#021A20', // text, footer background
  teal: '#035360', // button text, outlines, icons
  teal2: '#037788', // accents, kicker, "Relax"
  glow: '#7FE3EC', // highlights on dark
  glowSoft: '#B5F4F8',
  muted: '#48656A', // secondary text
  line: '#CFE3E7', // bar borders
  line2: '#BFD7DB', // card borders
  tint: '#F3F9FA', // section backgrounds
  tint2: '#E3F5F7',
  selected: '#E6F4F6', // selected chips / tabs
  warning: '#F59E0B',
  white: '#FFFFFF',
} as const;

/** Supporting shades used by the approved design. */
export const shade = {
  slate: '#2E4A50', // nav links, body lines
  grey: '#5E777B', // dim labels
  grey2: '#5E7C81',
  sage: '#8FB3B8', // chip / burger outline
  hairline: '#E3EEF0',
  aqua: '#2FB6C6',
  heroSub: '#3E5C62',
  pillLine: '#D5EAEE',
  track: '#C9DDE0', // progress track
  stack1: '#E6EFF1', // book page stack
  stack2: '#D5E3E6',
  stack3: '#C5D7DB',
  board1: '#046270', // book hardcover
  board2: '#023E47',
  bright: '#0A9AAE',
  deepTeal: '#02343C', // feature panel 2
  // store page (Shop.dc.html)
  storeGlow: '#DDF4F7',
  storeTop: '#F4FBFC',
  lineBg: '#EAF8FA', // cart line icon tile
  noteBg: '#FFF7E6',
  noteLine: '#F6DFAE',
  noteText: '#5C3B00',
  noteLink: '#7A4A00',
  amber: '#B45309',
  galBg: '#F2FAFB',
  manualBg: '#E8F4F6',
  card1: '#DDF2F5', // product image gradient
  card2: '#EEF8F9',
  cardLine: '#D3E6E9',
  disabledBg: '#EEF3F4',
  disabledLine: '#C6D5D8',
  footText: '#E8F6F7',
  onDark: '#CFE3E6',
  soonBg: '#FFF4DB',
  soonText: '#8A5300',
  hover: '#ECF8FA',
} as const;

/** The mobile app's dark theme, for the phone mockups (AppScreen.dc.html). */
export const app = {
  appBase: '#021A20',
  appCard: '#0A242B',
  appDeep: '#06171C',
  appFocus: '#0C2B33',
  appText: '#E8F6F7',
  appMuted: '#8FB3B8',
  appFooter: '#7F9EA3',
  appDim: '#5E7C81',
  appValveOff: '#B8CDD0',
  appNotif: '#FF7A6B',
  appDanger: '#FCA5A5',
  appWaveBack: '#204449',
  appWaveFront: '#34646B',
  appWarnLight: '#FCD34D',
  appWarnDeep: '#D97706',
  appWelcome: '#044753',
  appCta: '#A8F3F8',
  appAvatar: '#DDF6F8',
  appRing: '#1FA9B9',
  appFrame1: '#1B2B30',
  appFrame2: '#070D0F',
  black: '#000000',
} as const;

/** Artwork-only colours (logo gradient, wiring diagrams, product drawings). */
export const art = {
  logo1: '#03606E',
  logo2: '#22B8C6',
  logo3: '#9AF0F6',
  water1: '#8CEBF2',
  ringBlue: '#1FA9B9',
  pale: '#EAF7F9',
  deep: '#02434E',
  wireBrown: '#8B5A2B',
  wireBrownWhite: '#C9A27A',
  wireBlue: '#2563EB',
  wireGreen: '#16A34A',
  amberText: '#B45309',
  pipe: '#D3E7EA',
  slot: '#1F4A52',
  probe: '#9CC3C9',
  roof: '#BFDDE2',
  appCard: '#0A242B',
  tileWhite: '#E3F7F9',
} as const;

/** "#RRGGBB" → "r g b" for rgb(var(--x-rgb) / a). */
export function rgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}

const kebab = (k: string) => k.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

/** `:root { --ink: #021A20; --ink-rgb: 2 26 32; … }` for every theme + shade token. */
export function cssVariables(): string {
  const all = { ...theme, ...shade, ...app };
  const lines = Object.entries(all).flatMap(([k, v]) => [
    `--${kebab(k)}:${v}`,
    `--${kebab(k)}-rgb:${rgbTriplet(v)}`,
  ]);
  return `:root{${lines.join(';')}}`;
}
