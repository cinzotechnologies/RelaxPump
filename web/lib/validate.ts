// Shared input checks (reset requests, checkout).

/** Indian mobile: exactly 10 digits after removing spaces, dashes and a +91 / 0 prefix. */
export function normalPhone(input: string): string | null {
  let d = input.replace(/[\s-]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9][0-9]{9}$/.test(d) ? d : null;
}

/** Trimmed name, 1–60 characters, single spaces. */
export function normalName(input: string): string | null {
  const n = input.replace(/\s+/g, ' ').trim();
  return n.length >= 1 && n.length <= 60 ? n : null;
}
