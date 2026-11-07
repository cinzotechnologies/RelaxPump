// Bluetooth first-time setup: send the home Wi-Fi to the controller over BLE (ESP-IDF provisioning).
// The real implementation lands in milestone M5; this mock drives the UI until then.

export type FoundController = { name: string };
export type WifiNetwork = { ssid: string; rssi: number; secure: boolean };

export interface Provisioner {
  search(): Promise<FoundController[]>;
  connect(name: string, pop: string): Promise<void>;
  scanWifi(): Promise<WifiNetwork[]>;
  provision(ssid: string, password: string): Promise<void>;
  disconnect(): void;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockProvisioner(): Provisioner {
  return {
    async search() {
      await wait(1600);
      return [{ name: 'RelaxPump-3F2A' }];
    },
    async connect() {
      await wait(500);
    },
    async scanWifi() {
      await wait(400);
      return [
        { ssid: 'Home_WiFi', rssi: -48, secure: true },
        { ssid: 'JioFiber-5G', rssi: -61, secure: true },
        { ssid: 'Airtel_Xstream', rssi: -70, secure: true },
      ];
    },
    async provision() {
      await wait(1800);
    },
    disconnect() {},
  };
}

let instance: Provisioner | null = null;
export function provisioner(): Provisioner {
  if (!instance) instance = createMockProvisioner();
  return instance;
}
