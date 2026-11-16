import { parseIdentity, typeFromBleName } from '../claim';

jest.mock('expo-crypto', () => ({}));

describe('Bluetooth identity', () => {
  it('reads RP2 (v3) with type and firmware', () => {
    expect(parseIdentity('RP2;RP-3F2A9C;K7QX9M2PLW4R;phe;3.0.0')).toEqual({
      deviceId: 'RP-3F2A9C',
      code: 'K7QX9M2PLW4R',
      type: 'phe',
      fw: '3.0.0',
    });
    expect(parseIdentity('RP2;RP-3F2A9C;K7QX9M2PLW4R;household;3.1.2\n')?.type).toBe('household');
  });
  it('still reads RP1 (boards before v3) as household', () => {
    expect(parseIdentity('RP1;RP-D11C2C;ABCDEFGH')).toEqual({
      deviceId: 'RP-D11C2C',
      code: 'ABCDEFGH',
      type: 'household',
      fw: '',
    });
  });
  it('refuses anything else', () => {
    expect(parseIdentity('RP2;RP-3F2A9C;K7QX9M2PLW4R;pool;3.0.0')).toBeNull();
    expect(parseIdentity('RP3;RP-3F2A9C;K7QX9M2PLW4R')).toBeNull();
    expect(parseIdentity('RP1;rp-xyz;code')).toBeNull();
  });
  it('type from the Bluetooth name', () => {
    expect(typeFromBleName('RelaxPump-H-2A9C')).toBe('household');
    expect(typeFromBleName('RelaxPump-P-2A9C')).toBe('phe');
    expect(typeFromBleName('RelaxPump-2A9C')).toBe('household');
    expect(typeFromBleName('ESP32-Thing')).toBeNull();
  });
});
