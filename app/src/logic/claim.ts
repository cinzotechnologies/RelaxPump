import * as Crypto from 'expo-crypto';

import type { ModuleType } from '@/model/types';

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

export type ControllerIdentity = {
  deviceId: string;
  code: string;
  /** Factory-set module type. RP1 replies (boards before v3) are household. */
  type: ModuleType;
  /** Firmware version ('' for RP1). */
  fw: string;
};

/**
 * The controller's Bluetooth identity reply (rp-identity):
 *   v3:     "RP2;<DEVICE_ID>;<CLAIM_CODE>;<household|phe>;<fw>"
 *   before: "RP1;<DEVICE_ID>;<CLAIM_CODE>"
 * Returns null for anything else.
 */
export function parseIdentity(text: string): ControllerIdentity | null {
  const t = text.trim();
  const v2 = /^RP2;(RP-[0-9A-F]{6});([A-Za-z0-9-]{6,32});(household|phe);(\d{1,3}\.\d{1,3}\.\d{1,3})?$/.exec(t);
  if (v2) return { deviceId: v2[1], code: v2[2], type: v2[3] as ModuleType, fw: v2[4] ?? '' };
  const v1 = /^RP1;(RP-[0-9A-F]{6});([A-Za-z0-9-]{6,32})$/.exec(t);
  return v1 ? { deviceId: v1[1], code: v1[2], type: 'household', fw: '' } : null;
}

/**
 * Module type from the Bluetooth name: RelaxPump-H-XXXX (household), RelaxPump-P-XXXX (PHE).
 * The old name RelaxPump-XXXX is a household board. null = not a RelaxPump board.
 */
export function typeFromBleName(name: string): ModuleType | null {
  if (/^RelaxPump-P-[0-9A-F]{4}$/i.test(name)) return 'phe';
  if (/^RelaxPump-(H-)?[0-9A-F]{4}$/i.test(name)) return 'household';
  return null;
}

/** Installer PIN hash: SHA-256 hex of "<DEVICE_ID>:pin:<4 digits>" (checked by the rules). */
export function pinHash(deviceId: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${deviceId}:pin:${pin}`, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}
