// Admin icons (Admin.dc.html `IC`). Stroke icons, colour = currentColor.
export const IC = {
  dash: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  site: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  media: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 16l5-5 4 4 3-3 6 6',
  key: 'M8 11a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M11 13l9-9 M17 7l3 3 M15 9l2 2',
  hero: 'M3 5h18v14H3z M3 15l5-4 4 3 3-2 6 4',
  how: 'M5 6h14 M5 12h14 M5 18h9',
  phone: 'M7 3h10v18H7z M11 18h2',
  video: 'M4 6h11v12H4z M15 10l5-3v10l-5-3',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 21V5',
  dl: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  cart: 'M3 4h2l2.4 11h11l2-8H6.2',
  cartFull: 'M3 4h2l2.4 11h11l2-8H6.2 M9.5 20h.01 M17 20h.01',
  mail: 'M3 5h18v14H3z M3 7l9 6 9-6',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  check: 'M5 12l5 5 9-10',
  out: 'M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10',
  ext: 'M14 4h6v6 M20 4l-9 9 M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  wa: 'M4 20l1.5-4A8 8 0 1 1 9 19.5z',
} as const;

export function AIcon({ d, size = 20, w = 2 }: { d: string; size?: number; w?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/** "Lal Rina" → "LR" */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

/** "9876543210" → "98765 43210" */
export const phoneFmt = (p: string) => `${p.slice(0, 5)} ${p.slice(5)}`;

/** "5 min ago", "2 h ago", "Yesterday", "8 Nov" */
export function ago(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
