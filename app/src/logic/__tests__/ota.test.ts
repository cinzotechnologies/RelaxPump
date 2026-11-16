import { normalizeInfo, normalizeState } from '@/model/state';
import type { FirmwareStable } from '@/model/types';

import { eventRow, eventToast } from '../events';
import { cmpVersion, hasUpdate, otaError, updateView } from '../ota';

const info = normalizeInfo({ fw: '3.0.0', type: 'household' });
const stable: FirmwareStable = {
  version: '3.1.0',
  notes: ['Faster Wi-Fi'],
  size: 1,
  date: '2026-11-20',
  minFw: '2.0.0',
  rollout: 10,
};
const st = (v: Record<string, unknown>) => normalizeState({ online: true, tanks: [], ...v });

describe('versions', () => {
  it('compares x.y.z numerically', () => {
    expect(cmpVersion('3.10.0', '3.9.9')).toBe(1);
    expect(cmpVersion('3.0.0', '3.0.0')).toBe(0);
    expect(cmpVersion('2.3.0', '3.0.0')).toBe(-1);
    expect(cmpVersion('3.1', '3.1.0')).toBe(0);
  });
});

describe('Software update card', () => {
  it('up to date when the board offers nothing newer', () => {
    expect(updateView(info, st({}), stable, true)).toEqual({ kind: 'uptodate', current: '3.0.0' });
    expect(updateView(info, st({ fwAvailable: '3.0.0' }), stable, true).kind).toBe('uptodate');
  });
  it('available with the notes of that release', () => {
    expect(updateView(info, st({ fwAvailable: '3.1.0' }), stable, true)).toEqual({
      kind: 'available',
      current: '3.0.0',
      version: '3.1.0',
      notes: ['Faster Wi-Fi'],
      blocked: null,
    });
    // notes belong to another version → none shown
    expect(updateView(info, st({ fwAvailable: '3.2.0' }), stable, true)).toMatchObject({ notes: [] });
  });
  it('disabled while the pump runs or the board is offline', () => {
    expect(updateView(info, st({ fwAvailable: '3.1.0', pump: true }), stable, true)).toMatchObject({
      kind: 'available',
      blocked: expect.stringMatching(/Stop the pump/),
    });
    expect(updateView(info, st({ fwAvailable: '3.1.0' }), stable, false)).toMatchObject({
      blocked: 'The controller is offline.',
    });
  });
  it('running phases with percent', () => {
    const v = updateView(info, st({ ota: { phase: 'download', pct: 37, to: '3.1.0' } }), stable, true);
    expect(v).toMatchObject({ kind: 'running', label: 'Downloading 37%', version: '3.1.0' });
    expect(updateView(info, st({ ota: { phase: 'verify', pct: 100, to: '3.1.0' } }), stable, true)).toMatchObject({
      label: 'Checking…',
    });
    expect(updateView(info, st({ ota: { phase: 'restart', pct: 100, to: '3.1.0' } }), stable, true)).toMatchObject({
      label: 'Restarting…',
    });
  });
  it('done and failed', () => {
    expect(updateView(info, st({ ota: { phase: 'done', pct: 100, to: '3.1.0' } }), stable, true).kind).toBe('done');
    expect(
      updateView(info, st({ ota: { phase: 'failed', pct: 0, to: '3.1.0', err: 'rolled back' } }), stable, true),
    ).toMatchObject({ kind: 'failed', message: expect.stringMatching(/back on 3\.0\.0/) });
  });
  it('a "busy" refusal shows the button again', () => {
    const v = updateView(
      info,
      st({ fwAvailable: '3.1.0', ota: { phase: 'failed', pct: 0, to: '3.1.0', err: 'busy' } }),
      stable,
      true,
    );
    expect(v).toMatchObject({ kind: 'available', blocked: null });
  });
  it('error texts', () => {
    expect(otaError('sha256', '3.0.0')).toMatch(/damaged/);
    expect(otaError('http 404', '3.0.0')).toMatch(/Wi-Fi/);
    expect(otaError('no room', '3.0.0')).toMatch(/cable/);
    expect(otaError('weird', '3.0.0')).toMatch(/Try again/);
  });
  it('UPDATE badge', () => {
    expect(hasUpdate(st({ fwAvailable: '3.1.0' }), info)).toBe(true);
    expect(hasUpdate(st({ fwAvailable: null }), info)).toBe(false);
    expect(hasUpdate(st({ fwAvailable: '3.1.0' }), null)).toBe(false);
  });
});

describe('PHE and OTA events', () => {
  const ev = (type: string, tank = 0) => ({ id: 'x', type, tank, ts: 0 }) as Parameters<typeof eventRow>[0];
  it('rows', () => {
    expect(eventRow(ev('flow_start', -1), 85, 0).title).toBe('PHE water is coming');
    expect(eventRow(ev('phe_full', 1), 85, 0, ['Main', 'Shop'], true).title).toBe('Shop is full');
    expect(eventRow(ev('overflow'), 85, 0, ['Main'], true)).toMatchObject({ title: 'Main keeps rising', tone: 'warn' });
    expect(eventRow(ev('sensor'), 85, 0, ['Main'], true).sub).toMatch(/^Valve closed/);
    expect(eventRow(ev('sensor'), 85, 0, ['Roof']).sub).toMatch(/^Filling stopped/);
    expect(eventRow(ev('ota_done', -1), 85, 0).title).toBe('Software updated');
    expect(eventRow(ev('ota_failed', -1), 85, 0).tone).toBe('warn');
  });
  it('toasts', () => {
    expect(eventToast(ev('flow_start', -1))).toBe('PHE water is coming');
    expect(eventToast(ev('overflow', 0), ['Main'])).toBe('Check the valve of Main');
    expect(eventToast(ev('flow_stop', -1))).toBeNull();
  });
});
