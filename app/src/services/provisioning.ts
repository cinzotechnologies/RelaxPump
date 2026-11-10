// Bluetooth first-time setup: send the home Wi-Fi to the controller over BLE (ESP-IDF provisioning,
// WiFiProv BLE scheme, security 1 + PoP). Expo Go has no BLE native code, so it uses the mock.
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

import { parseIdentity, type ControllerIdentity } from '@/logic/claim';

import { mockMode } from './index';

export type FoundController = { name: string };
export type WifiNetwork = { ssid: string; rssi: number; secure: boolean };

export interface Provisioner {
  readonly real: boolean;
  search(): Promise<FoundController[]>;
  connect(name: string): Promise<void>;
  /** The connected controller's id and claim code. Null in mock mode. */
  readIdentity(): Promise<ControllerIdentity | null>;
  scanWifi(): Promise<WifiNetwork[]>;
  provision(ssid: string, password: string): Promise<void>;
  disconnect(): void;
}

export const BLE_PREFIX = 'RelaxPump-';
// Same values in the firmware (firmware/src/config.h).
const BLE_POP = 'relaxpump-ble-v1';
const BLE_IDENTITY_ENDPOINT = 'rp-identity';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BluetoothDenied extends Error {}

/** Android asks at run time ("Nearby devices" on Android 12+, location before that). */
async function askBluetooth() {
  if (Platform.OS !== 'android') return;
  const P = PermissionsAndroid.PERMISSIONS;
  const perms: Permission[] =
    Number(Platform.Version) >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(perms);
  if (!perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED))
    throw new BluetoothDenied('Allow Nearby devices for RelaxPump in phone settings');
}

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
    async readIdentity() {
      return null;
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
      await askBluetooth();
      const list = await ESPProvisionManager.searchESPDevices(
        BLE_PREFIX,
        ESPTransport.ble,
        ESPSecurity.secure,
      );
      return list.map((d) => ({ name: d.name }));
    },
    async connect(name) {
      device?.disconnect();
      device = new esp.ESPDevice({ name, transport: ESPTransport.ble, security: ESPSecurity.secure });
      await device.connect(BLE_POP, null, null);
    },
    async readIdentity() {
      if (!device) throw new Error('not connected');
      const identity = parseIdentity(await device.sendData(BLE_IDENTITY_ENDPOINT, 'get'));
      if (!identity) throw new Error('bad identity reply');
      return identity;
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
