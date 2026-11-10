import * as Crypto from 'expo-crypto';

/**
 * Claim code hash: SHA-256 hex of "<DEVICE_ID>:<CODE>" (code upper-cased, dashes/spaces removed).
 * The factory script (firebase/scripts/new-device.mjs) stores the same hash in claims/{id}/codeHash.
 */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function claimHash(deviceId: string, code: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${deviceId}:${normalizeCode(code)}`, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/**
 * QR on the box: "RP1;<DEVICE_ID>;<POP>;<CLAIM_CODE>".
 * Returns null for anything else.
 */
export function parseBoxQr(text: string): { deviceId: string; pop: string; code: string } | null {
  const m = /^RP1;(RP-[0-9A-F]{6});([A-Za-z0-9]{6,32});([A-Za-z0-9-]{6,32})$/.exec(text.trim());
  return m ? { deviceId: m[1], pop: m[2], code: m[3] } : null;
}

/** BLE service name the controller advertises: "RelaxPump-" + last 4 of its id. */
export function bleNameFor(deviceId: string): string {
  return `RelaxPump-${deviceId.slice(-4)}`;
}

/** Installer PIN hash: SHA-256 hex of "<DEVICE_ID>:pin:<4 digits>" (checked by the rules). */
export function pinHash(deviceId: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${deviceId}:pin:${pin}`, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}
