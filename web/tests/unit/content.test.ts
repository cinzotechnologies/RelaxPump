import { describe, expect, it } from 'vitest';

import { DEFAULT_SITE, mergeContent, toRows } from '@/lib/content/sections';
import { parseOrder } from '@/lib/orders';

describe('content rows', () => {
  it('round-trips the defaults', () => {
    const rows = toRows().map((r) => ({ section: r.section, key: r.key, value: r.json }));
    expect(mergeContent(rows)).toEqual(DEFAULT_SITE);
  });
  it('applies published values and ignores junk', () => {
    const merged = mergeContent([
      { section: 'hero', key: 'titleA', value: '"Smart tanks"' },
      { section: 'hero', key: 'checks', value: '"not an array"' }, // wrong type
      { section: 'hero', key: 'nope', value: '"x"' }, // unknown key
      { section: 'evil', key: 'x', value: '1' }, // unknown section
      { section: 'contact', key: 'phone', value: '{broken' }, // bad JSON
      { section: 'guide', key: 'videoUrl', value: '"https://youtu.be/abcdefghijk"' }, // null → string ok
    ]);
    expect(merged.hero.titleA).toBe('Smart tanks');
    expect(merged.hero.checks).toEqual(DEFAULT_SITE.hero.checks);
    expect(merged.contact.phone).toBe(DEFAULT_SITE.contact.phone);
    expect(merged.guide.videoUrl).toBe('https://youtu.be/abcdefghijk');
    expect((merged as unknown as Record<string, unknown>).evil).toBeUndefined();
  });
  it('does not mutate the defaults', () => {
    mergeContent([{ section: 'hero', key: 'titleA', value: '"Changed"' }]);
    expect(DEFAULT_SITE.hero.titleA).toBe('Smart water tank');
  });
});

describe('orders', () => {
  const ids = ['kit', 'sensor'];
  const good = {
    name: ' Lal  Rina ',
    phone: '98632 62589',
    address: 'House 12, Chala Road',
    town: 'Aizawl',
    pin: '796001',
    payment: 'upi',
    items: { kit: 1, sensor: 2, ghost: 3 },
  };
  it('accepts a valid order and drops unknown items', () => {
    const r = parseOrder(good, ids);
    expect(r).toEqual({
      ok: true,
      order: {
        name: 'Lal Rina',
        phone: '9863262589',
        address: 'House 12, Chala Road',
        town: 'Aizawl',
        pin: '796001',
        payment: 'upi',
        items: [
          { id: 'kit', qty: 1 },
          { id: 'sensor', qty: 2 },
        ],
      },
    });
  });
  it('rejects bad fields', () => {
    expect(parseOrder({ ...good, phone: '123' }, ids).ok).toBe(false);
    expect(parseOrder({ ...good, pin: '12345' }, ids).ok).toBe(false);
    expect(parseOrder({ ...good, payment: 'card' }, ids).ok).toBe(false);
    expect(parseOrder({ ...good, items: { ghost: 1 } }, ids).ok).toBe(false);
    expect(parseOrder({ ...good, items: { kit: 1.5 } }, ids).ok).toBe(false);
    expect(parseOrder(null, ids).ok).toBe(false);
  });
});
