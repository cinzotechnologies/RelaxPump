// New-password rules for Forgot-password requests. Pure (client + server).

/** No look-alikes (0/O, 1/l/I) — same alphabet as the design's Generate. */
export const PW_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** 8 random characters from PW_CHARS (crypto, no modulo bias). */
export function generatePassword(len = 8): string {
  const out: string[] = [];
  const max = 256 - (256 % PW_CHARS.length);
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < max && out.length < len) out.push(PW_CHARS[b % PW_CHARS.length]);
    }
  }
  return out.join('');
}

/** Firebase needs 6+; one line of printable characters so it reads well on WhatsApp. */
export function passwordError(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Type a password';
  if (pw.length < 6) return 'At least 6 characters';
  if (pw.length > 64) return 'At most 64 characters';
  if (!/^[\x21-\x7E]+$/.test(pw)) return 'Use letters, numbers and symbols only (no spaces)';
  return null;
}

/** The WhatsApp text from the design. */
export function whatsAppMessage(name: string, password: string): string {
  return `Hello ${name},\nyour RelaxPump password has been reset.\nNew password: ${password}\nPlease sign in and change it in Account › Change password.\n— CINZO`;
}

export const whatsAppLink = (phone10: string, text: string) =>
  `https://wa.me/91${phone10}?text=${encodeURIComponent(text)}`;
