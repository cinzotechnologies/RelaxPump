// Software update card (Account → My devices → device, reference/design-v3/AppDevice.dc.html):
// what to show for one board, from its info/state and firmware/stable. Pure, unit tested.
import type { DeviceInfo, DeviceState, FirmwareStable, OtaPhase } from '@/model/types';

/** "x.y.z" compare: <0, 0, >0 (missing parts = 0). */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  return 0;
}

export const PHASE_LABEL: Record<OtaPhase, string> = {
  download: 'Downloading',
  verify: 'Checking',
  install: 'Installing',
  restart: 'Restarting',
  done: 'Up to date',
  failed: 'Update failed',
};

/** The four steps the progress row shows, in order. */
export const OTA_STEPS: OtaPhase[] = ['download', 'verify', 'install', 'restart'];

/** Board error code (state.ota.err) → a sentence for the owner. */
export function otaError(err: string, from: string): string {
  if (err === 'busy') return 'The pump was running. Stop it and try again.';
  if (err === 'rolled back') return `The new software did not start. The controller is back on ${from}.`;
  if (err === 'sha256' || err === 'signature' || err === 'size' || err === 'download')
    return 'The download was damaged. Try again.';
  if (err.startsWith('http') || err === 'connect') return 'Could not download. Check the Wi-Fi and try again.';
  if (err === 'no room') return 'This controller needs a cable update. Contact your installer.';
  return 'Try again in a few minutes.';
}

export type UpdateView =
  | { kind: 'uptodate'; current: string }
  | {
      kind: 'available';
      current: string;
      version: string;
      notes: string[];
      /** Why the button is off, or null when Update now works. */
      blocked: string | null;
    }
  | { kind: 'running'; current: string; version: string; phase: OtaPhase; pct: number; label: string }
  | { kind: 'done'; current: string }
  | { kind: 'failed'; current: string; version: string; message: string };

/**
 * `online` = the board pushed state in the last 30 s. A running household pump disables the button
 * (the board would refuse the update with "busy").
 */
export function updateView(
  info: DeviceInfo | null,
  state: DeviceState | null,
  stable: FirmwareStable | null,
  online: boolean,
): UpdateView {
  const current = info?.fw || '?';
  const ota = state?.ota ?? null;
  if (ota && ota.phase !== 'done' && ota.phase !== 'failed')
    return {
      kind: 'running',
      current,
      version: ota.to,
      phase: ota.phase,
      pct: ota.pct,
      label: ota.phase === 'download' ? `Downloading ${ota.pct}%` : `${PHASE_LABEL[ota.phase]}…`,
    };
  if (ota?.phase === 'failed' && ota.err !== 'busy')
    return { kind: 'failed', current, version: ota.to, message: otaError(ota.err, current) };
  if (ota?.phase === 'done') return { kind: 'done', current };
  const version = state?.fwAvailable ?? null;
  if (!version || cmpVersion(version, current) <= 0) return { kind: 'uptodate', current };
  const notes = stable?.version === version ? stable.notes : [];
  const blocked = !online
    ? 'The controller is offline.'
    : state?.pump
      ? 'Stop the pump first. Updating turns everything off for about a minute.'
      : null;
  return { kind: 'available', current, version, notes, blocked };
}

/** "UPDATE" badge in the My devices list. */
export function hasUpdate(state: DeviceState | null, info: DeviceInfo | null): boolean {
  const v = state?.fwAvailable;
  return !!v && !!info?.fw && cmpVersion(v, info.fw) > 0;
}
