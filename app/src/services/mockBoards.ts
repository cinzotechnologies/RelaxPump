// Ids of the simulated fleet (mock backend + mock Bluetooth provisioning).
import type { ControllerIdentity } from '@/logic/claim';

/** Household board on the demo account. */
export const MOCK_DEVICE_ID = 'RP-3F2A9C';
/** PHE board on the demo account. */
export const MOCK_PHE_ID = 'RP-D4E5F6';

/** Boards the simulator "finds" over Bluetooth (Add device). Claiming one adds it to the mock fleet. */
export const MOCK_NEW_BOARDS: ControllerIdentity[] = [
  { deviceId: 'RP-5E7B21', code: 'MOCKCODE7B21', type: 'household', fw: '3.0.0' },
  { deviceId: 'RP-A19C4E', code: 'MOCKCODE9C4E', type: 'phe', fw: '3.0.0' },
];
