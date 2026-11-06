import { describe, it, expect, beforeEach } from 'vitest';
import { installChrome } from '../fakes/chrome.js';
import * as storage from '../../src/lib/storage.js';

const sc = (id, keyword, extra = {}) => ({
  id,
  keyword,
  description: '',
  steps: [{ type: 'openUrls', urls: ['https://a.com'], target: 'newTabs' }],
  ...extra,
});
const settings = { unknownKeyword: 'search', defaultTarget: 'currentTab' };
let c;
beforeEach(() => {
  c = installChrome();
});

describe('storage', () => {
  it('ST1 round-trips', async () => {
    const data = { settings, shortcuts: [sc('a', 'one'), sc('b', 'two')] };
    await storage.saveAll(data);
    expect(await storage.loadAll()).toEqual({ version: 1, ...data });
  });
  it('ST2 oversized shortcut rejected, nothing written', async () => {
    const big = sc('a', 'big', {
      steps: [{ type: 'copyText', text: 'x'.repeat(8100) }],
    });
    await expect(storage.saveAll({ settings, shortcuts: [big] })).rejects.toThrow(/too large/);
    expect(c.__callsTo('storage.sync.set')).toHaveLength(0);
  });
  it('ST3 total over 100,000 rejected, nothing written', async () => {
    const shortcuts = Array.from({ length: 20 }, (_, i) =>
      sc(`id${i}`, `k${i}`, { steps: [{ type: 'copyText', text: 'x'.repeat(6000) }] })
    );
    await expect(storage.saveAll({ settings, shortcuts })).rejects.toThrow(/Total size/);
    expect(c.__callsTo('storage.sync.set')).toHaveLength(0);
  });
  it('ST4 quota error leaves previous data intact', async () => {
    await storage.saveAll({ settings, shortcuts: [sc('a', 'one')] });
    c.__state.failSet = new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
    await expect(storage.saveShortcut(sc('b', 'two'))).rejects.toThrow(/quota/);
    expect((await storage.loadAll()).shortcuts.map((s) => s.keyword)).toEqual(['one']);
  });
  it('ST5 delete removes key and index entry', async () => {
    await storage.saveAll({ settings, shortcuts: [sc('a', 'one'), sc('b', 'two')] });
    await storage.deleteShortcut('a');
    expect('sc:a' in c.storage.sync.data).toBe(false);
    expect(c.storage.sync.data.index.order).toEqual(['b']);
  });
  it('ST6 reorder writes only index', async () => {
    await storage.saveAll({ settings, shortcuts: [sc('a', 'one'), sc('b', 'two')] });
    c.__calls.length = 0;
    await storage.reorder(['b', 'a']);
    const sets = c.__callsTo('storage.sync.set');
    expect(sets).toHaveLength(1);
    expect(Object.keys(sets[0][1])).toEqual(['index']);
  });
  it('ST7 v0 data migrated once', async () => {
    c.storage.sync.data.shortcuts = [{ keyword: 'Old', urls: ['https://old.com'] }];
    const first = await storage.loadAll();
    expect(first.shortcuts[0].keyword).toBe('old');
    expect(first.shortcuts[0].steps[0].urls).toEqual(['https://old.com']);
    expect('shortcuts' in c.storage.sync.data).toBe(false);
    c.__calls.length = 0;
    const second = await storage.loadAll();
    expect(second.shortcuts).toEqual(first.shortcuts);
    expect(c.__callsTo('storage.sync.set')).toHaveLength(0);
  });
  it('ST8 seeds defaults on first install only', async () => {
    const defaults = { settings, shortcuts: [sc('d', 'docs')] };
    expect(await storage.initStorage(defaults)).toBe(true);
    expect((await storage.loadAll()).shortcuts).toHaveLength(1);
    expect(await storage.initStorage({ settings, shortcuts: [] })).toBe(false);
  });
  it('ST8b init migrates v0 instead of seeding', async () => {
    c.storage.sync.data.shortcuts = [{ id: 'z', keyword: 'zed', urls: [] }];
    expect(await storage.initStorage({ settings, shortcuts: [sc('d', 'docs')] })).toBe(false);
    expect(c.storage.sync.data.index.order).toEqual(['z']);
  });
  it('ST9 orphan sc: keys ignored and cleaned up', async () => {
    await storage.saveAll({ settings, shortcuts: [sc('a', 'one')] });
    c.storage.sync.data['sc:ghost'] = sc('ghost', 'ghost');
    expect((await storage.loadAll()).shortcuts).toHaveLength(1);
    expect('sc:ghost' in c.storage.sync.data).toBe(false);
  });
  it('saveAll drops removed shortcuts; invalid data throws with errors', async () => {
    await storage.saveAll({ settings, shortcuts: [sc('a', 'one'), sc('b', 'two')] });
    await storage.saveAll({ settings, shortcuts: [sc('b', 'two')] });
    expect('sc:a' in c.storage.sync.data).toBe(false);
    const err = await storage
      .saveAll({ settings, shortcuts: [sc('x', 'bad key')] })
      .catch((e) => e);
    expect(err.errors.length).toBeGreaterThan(0);
  });
  it('saveShortcut adds, replaces in place and validates', async () => {
    await storage.saveShortcut(sc('a', 'one'));
    await storage.saveShortcut(sc('b', 'two'));
    await storage.saveShortcut(sc('a', 'uno'));
    expect((await storage.loadAll()).shortcuts.map((s) => s.keyword)).toEqual(['uno', 'two']);
    await expect(storage.saveShortcut(sc('c', 'uno'))).rejects.toThrow(/already used/);
  });
  it('settings and usage', async () => {
    await storage.saveSettings({ unknownKeyword: 'nothing' });
    expect((await storage.loadAll()).settings).toEqual({
      unknownKeyword: 'nothing',
      defaultTarget: 'currentTab',
    });
    await storage.touchUsage('a', 5);
    expect(await storage.getUsage()).toEqual({ a: 5 });
  });
  it('deleteShortcut with no index is harmless', async () => {
    await storage.deleteShortcut('nope');
    expect(c.storage.sync.data.index.order).toEqual([]);
  });
  it('measure reports sizes', async () => {
    const m = storage.measure({ settings, shortcuts: [sc('a', 'one')] });
    expect(m.total).toBeGreaterThan(0);
    expect(m.largest).toBeGreaterThan(0);
  });
});
