// Bluetooth first-time setup: send the home Wi-Fi to the controller over BLE (ESP-IDF provisioning,
// WiFiProv BLE scheme, security 1 + PoP). Expo Go has no BLE native code, so it uses the mock.
import { mockMode } from './index';

export type FoundController = { name: string };
export type WifiNetwork = { ssid: string; rssi: number; secure: boolean };

export interface Provisioner {
  readonly real: boolean;
  search(): Promise<FoundController[]>;
  connect(name: string, pop: string): Promise<void>;
  scanWifi(): Promise<WifiNetwork[]>;
  provision(ssid: string, password: string): Promise<void>;
  disconnect(): void;
}

export const BLE_PREFIX = 'RelaxPump-';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockProvisioner(): Provisioner {
  return {
    real: false,
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

export function createEspProvisioner(): Provisioner {
  type Esp = typeof import('@orbital-systems/react-native-esp-idf-provisioning');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const esp: Esp = require('@orbital-systems/react-native-esp-idf-provisioning');
  const { ESPProvisionManager, ESPTransport, ESPSecurity, ESPWifiAuthMode } = esp;
  let device: InstanceType<typeof esp.ESPDevice> | null = null;

  return {
    real: true,
    async search() {
      const list = await ESPProvisionManager.searchESPDevices(
        BLE_PREFIX,
        ESPTransport.ble,
        ESPSecurity.secure,
      );
      return list.map((d) => ({ name: d.name }));
    },
    async connect(name, pop) {
      device?.disconnect();
      device = new esp.ESPDevice({ name, transport: ESPTransport.ble, security: ESPSecurity.secure });
      await device.connect(pop, null, null);
    },
    async scanWifi() {
      if (!device) throw new Error('not connected');
      const list = await device.scanWifiList();
      const best = new Map<string, WifiNetwork>();
      for (const n of list) {
        if (!n.ssid) continue;
        const prev = best.get(n.ssid);
        if (!prev || n.rssi > prev.rssi)
          best.set(n.ssid, { ssid: n.ssid, rssi: n.rssi, secure: n.auth !== ESPWifiAuthMode.open });
      }
      return [...best.values()].sort((a, b) => b.rssi - a.rssi).slice(0, 8);
    },
    async provision(ssid, password) {
      if (!device) throw new Error('not connected');
      await device.provision(ssid, password);
    },
    disconnect() {
      device?.disconnect();
      device = null;
    },
  };
}

let instance: Provisioner | null = null;
export function provisioner(): Provisioner {
  if (!instance) instance = mockMode ? createMockProvisioner() : createEspProvisioner();
  return instance;
}
