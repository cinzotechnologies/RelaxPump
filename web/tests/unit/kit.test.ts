import { describe, expect, it } from 'vitest';

import { DEFAULT_KIT, fmtMin, planKit } from '@/lib/kit';

describe('Plan your kit', () => {
  it('household: best pump, lift, fill times and the kit list', () => {
    const r = planKit(DEFAULT_KIT); // 3 × 1000 L, 30 ft, ground level, 1" pipe
    expect(r.head).toBe(11.5); // 30/3.28 × 1.2 + 0.5
    // 0.5 HP: 40 × (1 − 11.5/25) ≈ 22 L/min, under 25 → 1 HP: 60 × (1 − 11.5/35) ≈ 40 L/min
    expect(r.pump?.hp).toBe('1 HP');
    expect(r.flow).toBe(40);
    expect(r.oneMin).toBe(25);
    expect(r.allMin).toBe(3 * 25 + 2);
    expect(r.warn).toBe('');
    expect(r.pumpOpts.map((o) => o.tag)).toEqual(['Slow', 'Best', 'Good', 'Good']);
    expect(r.kit.map((k) => [k.id, k.q])).toEqual([
      ['kit', 1],
      ['tank', 3],
      ['pump', 1],
    ]);
    expect(r.hasPhe).toBe(false);
  });

  it('one tank needs a Level Sensor instead of a Tank Kit; main tank sensor adds a kit', () => {
    const r = planKit({ ...DEFAULT_KIT, tanks: 1, main: true });
    expect(r.kit.map((k) => k.id)).toEqual(['kit', 'sensor', 'main', 'pump']);
  });

  it('PHE only: no pump, PHE Controller + a PHE Line Kit per line', () => {
    const r = planKit({ ...DEFAULT_KIT, mod: 'phe', lines: 4 });
    expect(r.hasHH).toBe(false);
    expect(r.kit).toEqual([
      { id: 'phectrl', name: 'PHE Controller', note: 'PHE lines, no pump', q: 1 },
      { id: 'phe', name: 'PHE Line Kit', note: 'Sensor + valve for each PHE line', q: 4 },
    ]);
  });

  it('both modules: everything on one list', () => {
    const r = planKit({ ...DEFAULT_KIT, mod: 'both', tanks: 5, lines: 2 });
    expect(r.kit.map((k) => k.id)).toEqual(['kit', 'tank', 'pump', 'phectrl', 'phe']);
    expect(r.kit.find((k) => k.id === 'tank')?.q).toBe(5);
  });

  it('picked pump; weak pumps cannot be picked', () => {
    const tall = planKit({ ...DEFAULT_KIT, height: 80 });
    expect(tall.pumpOpts[0]).toMatchObject({ hp: '0.5 HP', off: true });
    const r = planKit({ ...DEFAULT_KIT, pick: '1.5 HP' });
    expect(r.pump?.hp).toBe('1.5 HP');
    expect(r.picked).toBe(true);
    expect(r.pumpOpts.find((o) => o.selected)?.hp).toBe('1.5 HP');
    // a pump that cannot reach is ignored
    expect(planKit({ ...DEFAULT_KIT, height: 80, pick: '0.5 HP' }).pump?.hp).not.toBe('0.5 HP');
  });

  it('warnings: too high for a 2 HP pump; main tank deeper than 6 m', () => {
    expect(planKit({ ...DEFAULT_KIT, height: 120 }).warn).toMatch(/high-head or booster/);
    expect(planKit({ ...DEFAULT_KIT, under: true, depth: 25 }).warn).toMatch(/submersible/);
  });

  it('pipe tip when the pipe limits the pump', () => {
    const r = planKit({ ...DEFAULT_KIT, pipe: 0.5, pick: '2 HP' });
    expect(r.pipeTip).toMatch(/^Your ½" pipe is the limit\. With a ¾" pipe/);
  });

  it('formats minutes', () => {
    expect(fmtMin(45)).toBe('45 min');
    expect(fmtMin(65)).toBe('1 h 5 min');
  });
});
