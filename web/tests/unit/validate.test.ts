import { describe, expect, it } from 'vitest';

import { normalName, normalPhone } from '@/lib/validate';

describe('normalPhone', () => {
  it('accepts 10-digit mobiles with common prefixes', () => {
    expect(normalPhone('98632 62589')).toBe('9863262589');
    expect(normalPhone('+91 98632-62589')).toBe('9863262589');
    expect(normalPhone('919863262589')).toBe('9863262589');
    expect(normalPhone('09863262589')).toBe('9863262589');
  });
  it('rejects anything else', () => {
    expect(normalPhone('12345')).toBeNull();
    expect(normalPhone('1234567890')).toBeNull();
    expect(normalPhone('98632625890')).toBeNull();
  });
});

describe('normalName', () => {
  it('trims and limits to 60 characters', () => {
    expect(normalName('  Lal   Rina ')).toBe('Lal Rina');
    expect(normalName('   ')).toBeNull();
    expect(normalName('x'.repeat(61))).toBeNull();
  });
});
