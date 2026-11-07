import { eventRow } from '../events';
import { ago, hm, initials, litresOf, litresShort, phoneShow } from '../format';

describe('format', () => {
  it('formats litres like the design', () => {
    expect(litresOf(52, 1000)).toBe('520 / 1,000 L');
    expect(litresShort(52, 1000)).toBe('520 L');
    expect(litresOf(52, null)).toBe('');
  });
  it('makes initials and phone text', () => {
    expect(initials('My Home')).toBe('MH');
    expect(initials('')).toBe('M');
    expect(phoneShow('9876543210')).toBe('+91 98765 43210');
  });
  it('formats durations and ages', () => {
    expect(hm(85)).toBe('1h 25m');
    const now = Date.now();
    expect(ago(now - 10 * 60000, now)).toBe('10 min ago');
    expect(ago(now - 60 * 60000, now)).toBe('1 h ago');
  });
  it('maps events to notification rows', () => {
    const now = Date.now();
    expect(eventRow({ id: 'a', type: 'full', tank: 2, ts: now - 600000 }, 20, now)).toMatchObject({
      title: 'Tank 3 is full',
      sub: 'Pump stopped · 10 min ago',
    });
    expect(eventRow({ id: 'b', type: 'low', tank: 1, ts: now - 3600000 }, 20, now).sub).toBe(
      'Below 20% · 1 h ago',
    );
  });
});
