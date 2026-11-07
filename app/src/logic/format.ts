const nf = new Intl.NumberFormat('en-US');

export const fmtNum = (n: number) => nf.format(Math.round(n));

/** "520 / 1,000 L" */
export function litresOf(pct: number, cap: number | null): string {
  return cap ? `${fmtNum((cap * pct) / 100)} / ${fmtNum(cap)} L` : '';
}

/** "520 L" */
export function litresShort(pct: number, cap: number | null): string {
  return cap ? `${fmtNum((cap * pct) / 100)} L` : '';
}

export function initials(name: string): string {
  return (
    (name || 'Me')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'ME'
  );
}

/** "+91 98765 43210" */
export function phoneShow(phone: string): string {
  return phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : `+91 ${phone}`;
}

/** "1h 25m" */
export function hm(min: number): string {
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

/** "10 min ago", "1 h ago", "Today 6:40 AM", "Mon 6:40 AM" */
export function ago(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  if (m < 6 * 60) return `${Math.round(m / 60)} h ago`;
  const d = new Date(ts);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const today = new Date(now).toDateString() === d.toDateString();
  return today ? `Today ${time}` : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}

export function signalLabel(rssi: number): string {
  if (rssi >= -60) return 'Strong';
  if (rssi >= -72) return 'Good';
  return 'Weak';
}

/** yyyy-mm-dd in local time */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
