// Simulated OTA for the mock backend (docs/two-module-system.md §4.3): fwAvailable from
// firmware/stable, then download → verify → install → restart → done (or failed).
// EXPO_PUBLIC_MOCK_OTA = none | available (default) | running | failed.
import type { FirmwareStable, OtaState } from '@/model/types';

export type MockOtaMode = 'none' | 'available' | 'running' | 'failed';

export const MOCK_STABLE: FirmwareStable = {
  version: '3.1.0',
  notes: ['PHE: faster "water coming" alert', 'Wi-Fi reconnects quicker after a power cut'],
  size: 1_923_168,
  date: '2026-11-20',
  minFw: '2.0.0',
  rollout: 100,
};

export function mockOtaMode(v = process.env.EXPO_PUBLIC_MOCK_OTA): MockOtaMode {
  return v === 'none' || v === 'running' || v === 'failed' ? v : 'available';
}

/** One board's update simulator. `emit` pushes the board's state; `onDone` sets the new fw. */
export class OtaSim {
  fw: string;
  ota: OtaState | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    fw: string,
    private mode: MockOtaMode,
    private emit: () => void,
    private onDone: (fw: string) => void,
  ) {
    this.fw = fw;
    if (mode === 'running') setTimeout(() => this.start(MOCK_STABLE.version), 300);
  }

  get available(): string | null {
    return this.mode !== 'none' && this.fw !== MOCK_STABLE.version && !this.busy ? MOCK_STABLE.version : null;
  }

  get busy(): boolean {
    return !!this.ota && this.ota.phase !== 'done' && this.ota.phase !== 'failed';
  }

  /** cmd.ota. `pumpOn` → refused like the firmware ("busy"). */
  request(version: string, pumpOn: boolean) {
    if (this.busy) return;
    if (pumpOn) {
      this.ota = { phase: 'failed', pct: 0, to: version, err: 'busy' };
      this.emit();
      return;
    }
    if (version !== MOCK_STABLE.version) return;
    this.start(version);
  }

  private start(version: string) {
    this.ota = { phase: 'download', pct: 0, to: version, err: '' };
    this.emit();
    let t = 0;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      t++;
      const o = this.ota!;
      if (o.phase === 'download') {
        o.pct = Math.min(100, o.pct + 9);
        if (o.pct >= 100) o.phase = 'verify';
        if (this.mode === 'failed' && o.pct >= 45) {
          this.ota = { phase: 'failed', pct: 0, to: version, err: 'sha256' };
          this.finish();
          return;
        }
      } else if (o.phase === 'verify') o.phase = 'install';
      else if (o.phase === 'install') o.phase = 'restart';
      else if (o.phase === 'restart') {
        this.fw = version;
        this.onDone(version);
        this.ota = { phase: 'done', pct: 100, to: version, err: '' };
        this.finish();
        return;
      }
      if (t > 60) this.finish();
      this.emit();
    }, 450);
  }

  private finish() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.emit();
    // The board clears done/failed after a while (OTA_SHOW_RESULT_MS).
    setTimeout(() => {
      if (!this.busy) {
        this.ota = null;
        this.emit();
      }
    }, 20_000);
  }
}
