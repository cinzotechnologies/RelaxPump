import { describe, expect, it } from 'vitest';

import { cssVariables, rgbTriplet, theme } from '@/styles/tokens';

describe('tokens', () => {
  it('matches the brief theme table', () => {
    expect(theme).toMatchObject({
      ink: '#021A20',
      teal: '#035360',
      teal2: '#037788',
      glow: '#7FE3EC',
      muted: '#48656A',
      warning: '#F59E0B',
      white: '#FFFFFF',
    });
  });
  it('emits hex and rgb triplets as CSS variables', () => {
    expect(rgbTriplet('#021A20')).toBe('2 26 32');
    const css = cssVariables();
    expect(css).toContain('--ink:#021A20');
    expect(css).toContain('--ink-rgb:2 26 32');
    expect(css).toContain('--teal-2:#037788');
  });
});
