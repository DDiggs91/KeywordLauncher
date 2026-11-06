import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { installChrome } from '../fakes/chrome.js';
import { runShortcut } from '../../src/background/runner.js';

const step = (type, run, extra = {}) => ({
  step: { type, ...extra },
  action: { type, label: type, run },
});
function setup(defs) {
  const registry = {};
  for (const d of defs) registry[d.action.type] = d.action;
  return { registry, sc: { keyword: 'k', steps: defs.map((d) => d.step) } };
}
beforeEach(() => installChrome());
afterEach(() => vi.useRealTimers());

describe('runner', () => {
  it('R1 runs steps in order', async () => {
    const order = [];
    const { registry, sc } = setup([
      step('a', () => order.push('a')),
      step('b', () => order.push('b')),
    ]);
    const r = await runShortcut(sc, { registry });
    expect(order).toEqual(['a', 'b']);
    expect(r.log.map((l) => l.status)).toEqual(['ok', 'ok']);
    expect(r.ok).toBe(true);
  });
  it('R2 stops on first error', async () => {
    const b = vi.fn();
    const { registry, sc } = setup([
      step('a', () => {
        throw new Error('boom');
      }),
      step('b', b),
    ]);
    const r = await runShortcut(sc, { registry });
    expect(b).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.log[0]).toMatchObject({ status: 'error', message: 'boom' });
  });
  it('R3 continueOnError keeps going', async () => {
    const b = vi.fn();
    const { registry, sc } = setup([
      step('a', () => Promise.reject(new Error('x')), { continueOnError: true }),
      step('b', b),
    ]);
    const r = await runShortcut(sc, { registry });
    expect(b).toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.log.map((l) => l.status)).toEqual(['error', 'ok']);
  });
  it('R4 hung step times out at 10 s', async () => {
    vi.useFakeTimers();
    const { registry, sc } = setup([step('a', () => new Promise(() => {}))]);
    const p = runShortcut(sc, { registry });
    await vi.advanceTimersByTimeAsync(10000);
    const r = await p;
    expect(r.log[0].message).toMatch(/timed out after 10s/);
    expect(r.ok).toBe(false);
  });
  it('R5 disabled and unknown steps are skipped', async () => {
    const a = vi.fn();
    const { registry, sc } = setup([step('a', a, { disabled: true })]);
    sc.steps.push({ type: 'mystery' });
    const r = await runShortcut(sc, { registry });
    expect(a).not.toHaveBeenCalled();
    expect(r.log.map((l) => l.status)).toEqual(['skipped', 'skipped']);
    expect(r.ok).toBe(true);
  });
  it('R6 context carries created tab ids between steps', async () => {
    let seen;
    const { registry, sc } = setup([
      step('open', (_s, ctx) => ctx.tabIds.push(7, 8)),
      step('group', (_s, ctx) => {
        seen = [...ctx.tabIds];
      }),
    ]);
    await runShortcut(sc, { registry });
    expect(seen).toEqual([7, 8]);
  });
  it('blocks the run when requiresQuery and no query', async () => {
    const a = vi.fn();
    const { registry, sc } = setup([step('a', a)]);
    sc.requiresQuery = true;
    const r = await runShortcut(sc, { registry });
    expect(a).not.toHaveBeenCalled();
    expect(r.log[0].message).toMatch(/needs a query/);
  });
  it('wait steps get extra time; non-Error throws are stringified', async () => {
    const { registry, sc } = setup([step('wait', () => Promise.reject('plain'), { ms: 5 })]);
    const r = await runShortcut(sc, { registry });
    expect(r.log[0].message).toBe('plain');
  });
  it('ctx.fill raw mode', async () => {
    let out;
    const { registry, sc } = setup([
      step('a', (_s, ctx) => {
        out = [ctx.fill('{query}'), ctx.fill('{query}', { raw: true })];
      }),
    ]);
    await runShortcut(sc, { registry, query: 'a b' });
    expect(out).toEqual(['a%20b', 'a b']);
  });
});
