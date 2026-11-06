import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installChrome } from '../fakes/chrome.js';
import * as storage from '../../src/lib/storage.js';
import {
  handleInputChanged,
  handleInputEntered,
  notify,
  runKnown,
} from '../../src/background/omnibox.js';

const settings = { unknownKeyword: 'search', defaultTarget: 'currentTab' };
const sc = (id, keyword, extra = {}) => ({
  id,
  keyword,
  description: '',
  steps: [
    {
      type: 'openUrls',
      urls: ['http://127.0.0.1/a.html', 'http://127.0.0.1/b.html'],
      target: 'currentTab',
    },
  ],
  ...extra,
});
let c;
beforeEach(async () => {
  c = installChrome();
  await storage.saveAll({
    settings,
    shortcuts: [sc('1', 'work', { description: '<b>&' }), sc('2', 'wolf'), sc('3', 'jira')],
  });
});

describe('omnibox', () => {
  it('O1 suggestions are XML-escaped', async () => {
    const suggest = vi.fn();
    await handleInputChanged('wo', suggest);
    const list = suggest.mock.calls[0][0];
    expect(list[0]).toEqual({
      content: 'work',
      description: '<match>work</match> <dim>&lt;b&gt;&amp;</dim>',
    });
    expect(list.map((s) => s.content)).toEqual(['work', 'wolf']);
  });
  it('suggestions keep the typed query; empty input lists all', async () => {
    const suggest = vi.fn();
    await handleInputChanged('jira <1>', suggest);
    expect(suggest.mock.calls[0][0][0]).toEqual({
      content: 'jira <1>',
      description: '<match>jira</match> <url>&lt;1&gt;</url>',
    });
    await handleInputChanged('', suggest);
    expect(suggest.mock.calls[1][0]).toHaveLength(3);
  });
  it('O2 Enter runs the shortcut in the current tab', async () => {
    const r = await handleInputEntered('work', 'currentTab');
    expect(r.ok).toBe(true);
    expect(c.__callsTo('tabs.update')[0][2].url).toBe('http://127.0.0.1/a.html');
    expect((await storage.getUsage())['1']).toBeGreaterThan(0);
  });
  it('O2b defaultTarget setting applies to plain Enter', async () => {
    await storage.saveSettings({ defaultTarget: 'newForegroundTab' });
    await handleInputEntered('work', 'currentTab');
    expect(c.__callsTo('tabs.update')).toHaveLength(0);
    expect(c.__callsTo('tabs.create')).toHaveLength(2);
  });
  it('O3 Alt+Enter opens first URL in a new tab', async () => {
    await handleInputEntered('work', 'newForegroundTab');
    expect(c.__callsTo('tabs.create')[0][1]).toEqual({
      url: 'http://127.0.0.1/a.html',
      active: true,
    });
    expect(c.__callsTo('tabs.update')).toHaveLength(0);
  });
  it('O4 unknown keyword searches Google', async () => {
    await handleInputEntered('zzz hello world', 'currentTab');
    expect(c.__callsTo('tabs.update')[0][2].url).toBe(
      'https://www.google.com/search?q=zzz%20hello%20world'
    );
    await handleInputEntered('zzz', 'newBackgroundTab');
    expect(c.__callsTo('tabs.create')[0][1]).toEqual({
      url: 'https://www.google.com/search?q=zzz',
      active: false,
    });
    c.__tabs.length = 0;
    await handleInputEntered('zzz', 'currentTab');
    expect(c.__callsTo('tabs.create')).toHaveLength(2);
  });
  it('O5 unknown keyword with "nothing" opens no tabs and shows a notice', async () => {
    await storage.saveSettings({ unknownKeyword: 'nothing' });
    await handleInputEntered('zzz', 'currentTab');
    expect(c.__callsTo('tabs.create')).toHaveLength(0);
    expect(c.__callsTo('tabs.update')).toHaveLength(0);
    expect(c.action.badge).toBe('!');
    expect(c.action.title).toMatch(/No shortcut named "zzz"/);
  });
  it('failed run shows a notice; next run clears it', async () => {
    await storage.saveShortcut(sc('4', 'bad', { requiresQuery: true }));
    await handleInputEntered('bad', 'currentTab');
    expect(c.action.badge).toBe('!');
    expect(c.action.title).toMatch(/needs a query/);
    await handleInputEntered('work', 'currentTab');
    expect(c.action.badge).toBe('');
    await notify('x');
  });
  it('generic failure message and empty input', async () => {
    expect(await handleInputEntered('   ')).toBeUndefined();
    await storage.saveShortcut(
      sc('5', 'oops', { steps: [{ type: 'openUrls', urls: ['javascript:1'] }] })
    );
    await handleInputEntered('oops');
    expect(c.action.title).toMatch(/not allowed|not a valid URL/);
  });
  it('runKnown runs matching shortcuts and reports unmatched text', async () => {
    expect(await runKnown('')).toEqual({ handled: false });
    expect(await runKnown('nothing here')).toEqual({ handled: false });
    expect(c.__callsTo('tabs.create')).toHaveLength(0);
    expect(await runKnown('work')).toEqual({ handled: true, ok: true });
    expect(c.__callsTo('tabs.update')).toHaveLength(1);
  });
});
