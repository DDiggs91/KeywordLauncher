import { describe, it, expect, beforeEach } from 'vitest';
import { installChrome } from '../fakes/chrome.js';
import { runShortcut } from '../../src/background/runner.js';
import { registry, stepValidators, portableValidators, actions } from '../../src/actions/index.js';
import runScript, { userScriptsAvailable } from '../../src/actions/runScript.js';

let c;
beforeEach(() => {
  c = installChrome();
});
const run = (steps, opts = {}) =>
  runShortcut({ keyword: 'k', steps, requiresQuery: opts.requiresQuery }, opts);
const urls = ['http://127.0.0.1/a.html', 'http://127.0.0.1/b.html', 'http://127.0.0.1/c.html'];

describe('actions', () => {
  it('A1 openUrls newTabs creates tabs in order', async () => {
    const r = await run([{ type: 'openUrls', urls, target: 'newTabs' }]);
    expect(r.ok).toBe(true);
    expect(c.__callsTo('tabs.create').map((x) => x[1].url)).toEqual(urls);
    expect(c.__callsTo('tabs.create').map((x) => x[1].active)).toEqual([true, false, false]);
  });
  it('A2 currentTab updates first, creates the rest', async () => {
    await run([{ type: 'openUrls', urls, target: 'currentTab' }]);
    expect(c.__callsTo('tabs.update')[0][2].url).toBe(urls[0]);
    expect(c.__callsTo('tabs.create')).toHaveLength(2);
  });
  it('A2b currentTab with no active tab just creates', async () => {
    c.__tabs.length = 0;
    await run([{ type: 'openUrls', urls: urls.slice(0, 2), target: 'currentTab' }]);
    expect(c.__callsTo('tabs.create')).toHaveLength(2);
  });
  it('A2c Alt+Enter leaves the current tab alone; background flags', async () => {
    await run([{ type: 'openUrls', urls: urls.slice(0, 2), target: 'currentTab' }], {
      disposition: 'newForegroundTab',
    });
    expect(c.__callsTo('tabs.update')).toHaveLength(0);
    expect(c.__callsTo('tabs.create').map((x) => x[1].active)).toEqual([true, false]);
    c.__calls.length = 0;
    await run([{ type: 'openUrls', urls: urls.slice(0, 2), target: 'newTabs', background: true }]);
    expect(c.__callsTo('tabs.create').map((x) => x[1].active)).toEqual([false, false]);
    c.__calls.length = 0;
    await run([{ type: 'openUrls', urls: urls.slice(0, 1) }], { disposition: 'newBackgroundTab' });
    expect(c.__callsTo('tabs.create')[0][1].active).toBe(false);
  });
  it('A3 newWindow makes one windows.create', async () => {
    await run([{ type: 'openUrls', urls, target: 'newWindow' }]);
    expect(c.__callsTo('windows.create')).toHaveLength(1);
    expect(c.__callsTo('windows.create')[0][1].url).toEqual(urls);
  });
  it('openUrls templates the query and rejects bad URLs', async () => {
    await run([{ type: 'openUrls', urls: ['http://x.test/?q={query}'] }], { query: 'a b' });
    expect(c.__callsTo('tabs.create')[0][1].url).toBe('http://x.test/?q=a%20b');
    const r = await run([{ type: 'openUrls', urls: ['javascript:1'] }]);
    expect(r.ok).toBe(false);
  });
  it('tabGroup groups tabs opened in the run (E6 shape)', async () => {
    const r = await run([
      { type: 'openUrls', urls, target: 'newTabs' },
      { type: 'tabGroup', name: 'Work', color: 'red' },
    ]);
    expect(r.ok).toBe(true);
    const gid = c.__tabs.find((t) => t.url === urls[0]).groupId;
    expect(c.__tabs.filter((t) => t.groupId === gid)).toHaveLength(3);
    expect(c.__groups[gid]).toMatchObject({ title: 'Work', color: 'red' });
  });
  it('A4 tabGroup with no tabs is a warning no-op', async () => {
    const r = await run([{ type: 'tabGroup', name: 'x', color: 'blue' }]);
    expect(r.ok).toBe(true);
    expect(r.log[0]).toMatchObject({ status: 'warning' });
    expect(c.__callsTo('tabs.group')).toHaveLength(0);
  });
  it('closeTabs closes matches only', async () => {
    c.__addTab({ url: 'http://127.0.0.1/ad.html' });
    c.__addTab({ url: 'http://127.0.0.1/keep.html' });
    await run([{ type: 'closeTabs', pattern: 'ad.html' }]);
    expect(c.__tabs.map((t) => t.url)).toEqual([
      'http://127.0.0.1/start.html',
      'http://127.0.0.1/keep.html',
    ]);
    const r = await run([{ type: 'closeTabs', pattern: 'nomatch' }]);
    expect(r.ok).toBe(true);
  });
  it('A5 closeTabs matching everything leaves one tab', async () => {
    c.__addTab({ url: 'http://127.0.0.1/x' });
    const r = await run([{ type: 'closeTabs', pattern: '127.0.0.1' }]);
    expect(c.__tabs).toHaveLength(1);
    expect(r.log.some((l) => l.status === 'warning')).toBe(true);
  });
  it('closeTabs with all-matching and no active tab keeps the first', async () => {
    c.__tabs[0].active = false;
    c.__addTab({ url: 'http://127.0.0.1/x' });
    await run([{ type: 'closeTabs', pattern: '127' }]);
    expect(c.__tabs).toHaveLength(1);
  });
  it('A6 pin / unpin / mute / unmute only touch matches', async () => {
    c.__addTab({ url: 'http://127.0.0.1/mail' });
    await run([{ type: 'pinTabs', pattern: 'mail' }]);
    expect(c.__tabs.map((t) => t.pinned)).toEqual([false, true]);
    await run([{ type: 'pinTabs', pattern: 'mail', mode: 'unpin' }]);
    expect(c.__tabs[1].pinned).toBe(false);
    await run([{ type: 'muteTabs', pattern: 'mail' }]);
    expect(c.__tabs.map((t) => t.mutedInfo.muted)).toEqual([false, true]);
    await run([{ type: 'muteTabs', pattern: '', mode: 'mute' }]);
    expect(c.__tabs.every((t) => t.mutedInfo.muted)).toBe(true);
    await run([{ type: 'muteTabs', mode: 'unmute' }]);
    expect(c.__tabs.some((t) => t.mutedInfo.muted)).toBe(false);
  });
  it('A7 copyText creates the offscreen doc once and templates text', async () => {
    await run([{ type: 'copyText', text: 'id {query}' }], { query: 'a b' });
    await run([{ type: 'copyText', text: 'again' }]);
    expect(c.__callsTo('offscreen.createDocument')).toHaveLength(1);
    const msgs = c.__callsTo('runtime.sendMessage').map((m) => m[1]);
    expect(msgs[0]).toMatchObject({ type: 'copy', text: 'id a b' });
    expect(msgs).toHaveLength(2);
  });
  it('copyText surfaces offscreen failures', async () => {
    c.runtime.sendMessage = async () => ({ ok: false, error: 'nope' });
    const r = await run([{ type: 'copyText', text: 'x' }]);
    expect(r.log[0]).toMatchObject({ status: 'error', message: 'nope' });
    c.runtime.sendMessage = async () => undefined;
    expect((await run([{ type: 'copyText', text: 'x' }])).log[0].message).toMatch(/failed/);
  });
  it('wait runs for the given time', async () => {
    const r = await run([{ type: 'wait', ms: 0 }]);
    expect(r.ok).toBe(true);
  });
  it('A8 wait 20,000 ms rejected by validate', () => {
    expect(registry.wait.validate({ ms: 20000 })).toHaveLength(1);
    expect(registry.wait.validate({ ms: 1.5 })).toHaveLength(1);
    expect(registry.wait.validate({ ms: 500 })).toEqual([]);
  });
  it('A9 runScript without permission fails validation', () => {
    installChrome({ userScripts: false });
    expect(userScriptsAvailable()).toBe(false);
    expect(runScript.validate({ code: 'x' })[0].message).toMatch(/Enable user scripts/);
  });
  it('runScript runs in the active tab with QUERY', async () => {
    expect(registry.runScript.validate({ code: '' })).toHaveLength(1);
    expect(registry.runScript.validate({ code: 'x' })).toEqual([]);
    await run([{ type: 'runScript', code: 'document.title = QUERY' }], { query: 'hi' });
    const call = c.__callsTo('userScripts.execute')[0][1];
    expect(call.target.tabId).toBe(1);
    expect(call.js[0].code).toContain('document.title = QUERY');
    expect(call.js[0].code).toContain('("hi")');
  });
  it('runScript errors without API or tab', async () => {
    c.__tabs.length = 0;
    expect((await run([{ type: 'runScript', code: 'x' }])).log[0].message).toMatch(/No active tab/);
    installChrome({ userScripts: false });
    expect((await run([{ type: 'runScript', code: 'x' }])).log[0].message).toMatch(/not enabled/);
  });
  it('validators for each action', () => {
    expect(registry.openUrls.validate({ urls: [] })).toHaveLength(1);
    expect(registry.openUrls.validate({ urls: ['bad url'], target: 'x' })).toHaveLength(2);
    expect(registry.openUrls.validate({ urls: ['a.com'] })).toEqual([]);
    expect(registry.tabGroup.validate({ color: 'nope', name: 'x'.repeat(61) })).toHaveLength(2);
    expect(registry.tabGroup.validate({})).toEqual([]);
    expect(registry.closeTabs.validate({ pattern: ' ' })).toHaveLength(1);
    expect(registry.closeTabs.validate({ pattern: 'a' })).toEqual([]);
    expect(registry.pinTabs.validate({})).toHaveLength(1);
    expect(registry.muteTabs.validate({})).toEqual([]);
    expect(registry.copyText.validate({})).toHaveLength(1);
    expect(registry.copyText.validate({ text: 'x' })).toEqual([]);
  });
  it('registry exposes metadata for the editor', () => {
    for (const a of actions) {
      expect(a.fields.length).toBeGreaterThan(0);
      expect(a.defaults().type).toBe(a.type);
      expect(stepValidators[a.type]).toBeTypeOf('function');
    }
    installChrome({ userScripts: false });
    expect(portableValidators.runScript({ code: 'x' })).toEqual([]);
    expect(portableValidators.runScript({ code: '' })).toHaveLength(1);
  });
});
