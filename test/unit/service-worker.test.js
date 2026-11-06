import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installChrome } from '../fakes/chrome.js';
import defaults from '../../src/defaults/default-shortcuts.json';

let c;
beforeEach(async () => {
  vi.resetModules();
  c = installChrome();
  globalThis.fetch = vi.fn(async () => ({ json: async () => defaults }));
  await import('../../src/background/service-worker.js');
});

describe('service worker', () => {
  it('registers listeners and default suggestion', () => {
    expect(c.omnibox.onInputChanged.listeners).toHaveLength(1);
    expect(c.omnibox.onInputEntered.listeners).toHaveLength(1);
    expect(c.__callsTo('omnibox.setDefaultSuggestion')).toHaveLength(1);
  });
  it('seeds defaults on install and startup (idempotent)', async () => {
    await c.runtime.onInstalled.emit({ reason: 'install' });
    expect(c.storage.sync.data.index.order).toHaveLength(2);
    await c.runtime.onStartup.emit();
    expect(c.storage.sync.data.index.order).toHaveLength(2);
  });
  it('toolbar click opens options', async () => {
    await c.action.onClicked.emit();
    expect(c.__callsTo('runtime.openOptionsPage')).toHaveLength(1);
  });
  it('testRun message runs the draft shortcut in a new tab', async () => {
    const sc = {
      keyword: 't',
      steps: [{ type: 'openUrls', urls: ['http://127.0.0.1/a.html'], target: 'currentTab' }],
    };
    const reply = await new Promise((resolve) => {
      const handled = c.runtime.onMessage.listeners[0](
        { type: 'testRun', shortcut: sc },
        {},
        resolve
      );
      expect(handled).toBe(true);
    });
    expect(reply.ok).toBe(true);
    expect(c.__callsTo('tabs.update')).toHaveLength(0);
    expect(c.__callsTo('tabs.create')).toHaveLength(1);
    expect(c.runtime.onMessage.listeners[0]({ type: 'other' })).toBe(false);
  });
  it('run message executes a known shortcut and reports unknown ones', async () => {
    await c.runtime.onInstalled.emit({});
    const ask = (input) =>
      new Promise((resolve) =>
        c.runtime.onMessage.listeners[0]({ type: 'run', input }, {}, resolve)
      );
    expect(await ask('nope')).toEqual({ handled: false });
    expect(await ask('work')).toMatchObject({ handled: true });
    expect(
      await new Promise((r) => c.runtime.onMessage.listeners[0]({ type: 'run' }, {}, r))
    ).toEqual({ handled: false });
  });
  it('test hook runs input', async () => {
    await c.runtime.onInstalled.emit({});
    await globalThis.__kl.run('work', 'newForegroundTab');
    expect(c.__callsTo('tabs.create')).toHaveLength(2);
    await globalThis.__kl.run('zzz');
  });
});
