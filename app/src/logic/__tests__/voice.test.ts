import { parseVoicePath, planPumpOn } from '@/logic/voice';

const tank = (pct: number, valve = false, ok = true) => ({ pct, valve, ok });

describe('voice links', () => {
  it('reads the four actions from any link form', () => {
    expect(parseVoicePath('relaxpump://do/pump-on')).toBe('pump-on');
    expect(parseVoicePath('/do/pump-off')).toBe('pump-off');
    expect(parseVoicePath('do/auto-on?source=assistant')).toBe('auto-on');
    expect(parseVoicePath('/do/auto-off/')).toBe('auto-off');
  });
  it('ignores anything else', () => {
    expect(parseVoicePath('/do/explode')).toBeNull();
    expect(parseVoicePath('/home')).toBeNull();
    expect(parseVoicePath('/do/pump-on/extra')).toBeNull();
  });
});

describe('pump on by voice', () => {
  it('does nothing when the pump already runs', () => {
    expect(planPumpOn(true, [tank(40, true)])).toEqual({ kind: 'already' });
  });
  it('uses the open valve', () => {
    expect(planPumpOn(false, [tank(30), tank(80, true)])).toEqual({ kind: 'pump' });
  });
  it('opens the emptiest working tank first', () => {
    expect(planPumpOn(false, [tank(60), tank(20, false, false), tank(35)])).toEqual({
      kind: 'valveThenPump',
      tank: 2,
    });
  });
  it('says full when every tank is full', () => {
    expect(planPumpOn(false, [tank(98), tank(100)])).toEqual({ kind: 'full' });
  });
});
