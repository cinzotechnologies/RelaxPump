import { describe, expect, it } from 'vitest';

import { cartCount, cleanCart, withQty } from '@/components/store/cart';
import { priceLabel } from '@/lib/content/products';

describe('cart', () => {
  const ids = ['kit', 'sensor'];
  it('drops unknown ids, bad and non-positive quantities', () => {
    expect(cleanCart({ kit: 2, sensor: 0, valve: 3, x: 'a' }, ids)).toEqual({ kit: 2 });
    expect(cleanCart({ kit: 2.7 }, ids)).toEqual({ kit: 2 });
    expect(cleanCart({ kit: 500 }, ids)).toEqual({ kit: 99 });
    expect(cleanCart('nope', ids)).toEqual({});
  });
  it('sets, caps and removes quantities', () => {
    expect(withQty({}, 'kit', 1)).toEqual({ kit: 1 });
    expect(withQty({ kit: 1 }, 'kit', 0)).toEqual({});
    expect(withQty({ kit: 98 }, 'kit', 120)).toEqual({ kit: 99 });
    expect(cartCount({ kit: 2, sensor: 3 })).toBe(5);
  });
  it('formats prices in rupees', () => {
    expect(priceLabel({ price: null })).toBeNull();
    expect(priceLabel({ price: 4999 })).toBe('₹4,999');
  });
});
