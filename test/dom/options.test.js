import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installChrome } from '../fakes/chrome.js';
import * as storage from '../../src/lib/storage.js';
import { actions } from '../../src/actions/index.js';

const html = readFileSync(resolve(process.cwd(), 'src/options/options.html'), 'utf8');
const body = /<body>([\s\S]*)<\/body>/.exec(html)[1].replace(/<script[\s\S]*?<\/script>/, '');
const settings = { unknownKeyword: 'search', defaultTarget: 'currentTab' };
const sc = (id, keyword, extra = {}) => ({
  id,
  keyword,
  description: `${keyword} description`,
  requiresQuery: false,
  steps: [
    { type: 'openUrls', urls: ['https://a.example.com'], target: 'newTabs' },
    { type: 'wait', ms: 100 },
  ],
  ...extra,
});
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
const type = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const click = async (el) => {
  el.click();
  await flush();
};
const rows = () => $$('#shortcut-list li');

let c;
const unloadListeners = [];
const realAdd = window.addEventListener.bind(window);
window.addEventListener = (type, fn, o) => {
  if (type === 'beforeunload') unloadListeners.push(fn);
  realAdd(type, fn, o);
};
async function load({
  shortcuts = [sc('1', 'work'), sc('2', 'wolf')],
  chromeOpts,
  dark = false,
} = {}) {
  for (const fn of unloadListeners.splice(0)) window.removeEventListener('beforeunload', fn);
  vi.resetModules();
  document.body.innerHTML = body;
  document.documentElement.className = '';
  c = installChrome(chromeOpts);
  globalThis.matchMedia = dark ? () => ({ matches: true, addEventListener() {} }) : undefined;
  await storage.saveAll({ settings, shortcuts });
  await import('../../src/options/options.js');
  await flush();
}
beforeEach(() => {
  globalThis.matchMedia = undefined;
});

describe('options page', () => {
  it('D1 lists stored shortcuts in order', async () => {
    await load();
    expect(rows().map((r) => r.dataset.id)).toEqual(['1', '2']);
  });

  it('D2 add shortcut and save', async () => {
    await load();
    await click($('#add-shortcut'));
    type($('#ed-keyword'), 'newone');
    type($('.urls input'), 'example.com');
    expect($('#save-btn').disabled).toBe(false);
    await click($('#save-btn'));
    expect(rows()).toHaveLength(3);
    expect(c.storage.sync.data.index.order).toHaveLength(3);
    expect($('#status').textContent).toMatch(/Saved "newone"/);
  });

  it('D3 invalid keyword blocks save', async () => {
    await load();
    await click($('#add-shortcut'));
    type($('.urls input'), 'example.com');
    type($('#ed-keyword'), 'bad key');
    expect($('[data-err="keyword"]').textContent).not.toBe('');
    expect($('#save-btn').disabled).toBe(true);
    c.__calls.length = 0;
    await click($('#save-btn'));
    expect(c.__callsTo('storage.sync.set')).toHaveLength(0);
  });

  it('D4 duplicate keyword names the existing shortcut', async () => {
    await load();
    await click($('#add-shortcut'));
    type($('.urls input'), 'example.com');
    type($('#ed-keyword'), 'Work');
    expect($('[data-err="keyword"]').textContent).toMatch(/"work".*already used/);
    expect($('#save-btn').disabled).toBe(true);
  });

  it('D5 each step type renders its fields', async () => {
    await load();
    await click($('#add-shortcut'));
    for (const a of actions) {
      $('#add-step-type').value = a.type;
      await click($('#add-step-btn'));
      const box = $$('.step').at(-1);
      expect(box.querySelector('h3').textContent).toContain(a.label);
      const text = box.textContent;
      for (const f of a.fields) expect(text).toContain(f.label);
    }
  });

  it('D6 reorder steps and save', async () => {
    await load();
    await click($('#shortcut-list li button.item'));
    await click($('[aria-label="Move step 2 up"]'));
    await click($('#save-btn'));
    expect(c.storage.sync.data['sc:1'].steps.map((s) => s.type)).toEqual(['wait', 'openUrls']);
  });

  it('D7 delete then undo restores same id', async () => {
    await load();
    await click($('[aria-label="Delete work"]'));
    expect(rows().map((r) => r.dataset.id)).toEqual(['2']);
    expect($('#undo-bar').hidden).toBe(false);
    await click($('#undo-btn'));
    expect(rows().map((r) => r.dataset.id)).toEqual(['1', '2']);
    expect(c.storage.sync.data['sc:1'].keyword).toBe('work');
  });

  it('D7b undo bar disappears after 5 s', async () => {
    await load();
    vi.useFakeTimers();
    try {
      $('[aria-label="Delete wolf"]').click();
      await vi.advanceTimersByTimeAsync(10);
      expect($('#undo-bar').hidden).toBe(false);
      await vi.advanceTimersByTimeAsync(5001);
      expect($('#undo-bar').hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('D8 search filters rows', async () => {
    await load({ shortcuts: [sc('1', 'work'), sc('2', 'jira'), sc('3', 'wolf')] });
    type($('#search'), 'wor');
    expect(
      rows()
        .filter((r) => !r.hidden)
        .map((r) => r.dataset.id)
    ).toEqual(['1']);
    type($('#search'), '');
    expect(rows().every((r) => !r.hidden)).toBe(true);
  });

  it('D9 test run goes through a message and shows the log', async () => {
    await load();
    c.runtime.sendMessage = vi.fn(async () => ({
      ok: false,
      log: [{ index: 0, type: 'openUrls', status: 'error', message: 'boom' }],
    }));
    await click($('#shortcut-list li button.item'));
    type($('#test-query'), 'abc');
    await click($('#test-btn'));
    const msg = c.runtime.sendMessage.mock.calls[0][0];
    expect(msg).toMatchObject({ type: 'testRun', query: 'abc' });
    expect(msg.shortcut.keyword).toBe('work');
    expect($('#editor .log').textContent).toContain('boom');
    expect($('#editor').textContent).toContain('Test run failed');
  });

  it('D10 external storage change refreshes the list', async () => {
    await load();
    await storage.saveShortcut(sc('9', 'fresh'));
    await flush();
    expect(rows().map((r) => r.dataset.id)).toEqual(['1', '2', '9']);
  });

  it('D10b external deletion closes the open editor', async () => {
    await load();
    await click($('#shortcut-list li button.item'));
    await storage.deleteShortcut('1');
    await storage.reorder(['2']);
    await flush();
    expect($('#editor').textContent).toContain('Select a shortcut');
  });

  it('D11 unsaved edits set the beforeunload prompt', async () => {
    await load();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await click($('#shortcut-list li button.item'));
    type($('#ed-description'), 'changed');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('D12 runScript step shows an enable button without permission', async () => {
    await load({ chromeOpts: { userScripts: false } });
    await click($('#add-shortcut'));
    $('#add-step-type').value = 'runScript';
    await click($('#add-step-btn'));
    const box = $$('.step').at(-1);
    expect(box.querySelector('textarea')).toBeNull();
    const btn = box.querySelector('.enable-user-scripts');
    expect(btn.textContent).toBe('Enable user scripts');
    c.userScripts = { execute: async () => [] };
    await click(btn);
    expect($$('.step').at(-1).querySelector('textarea')).not.toBeNull();
  });

  it('D13 every control has an accessible name', async () => {
    await load();
    await click($('#shortcut-list li button.item'));
    for (const a of actions) {
      $('#add-step-type').value = a.type;
      await click($('#add-step-btn'));
    }
    const controls = $$('#editor input, #editor select, #editor textarea, #editor button');
    expect(controls.length).toBeGreaterThan(20);
    for (const ctl of controls) {
      const named =
        (ctl.labels && ctl.labels.length) ||
        ctl.getAttribute('aria-label') ||
        ctl.textContent.trim();
      expect(named, ctl.outerHTML).toBeTruthy();
      expect(ctl.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('D14 dark mode class', async () => {
    await load({ dark: true });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('duplicate, move and the size meter', async () => {
    await load();
    await click($('[aria-label="Duplicate work"]'));
    expect(rows()).toHaveLength(3);
    expect(c.storage.sync.data['sc:' + c.storage.sync.data.index.order[2]].keyword).toBe(
      'work-copy'
    );
    await click($('[aria-label="Move wolf up"]'));
    expect(c.storage.sync.data.index.order[0]).toBe('2');
    expect($('#size-text').textContent).toMatch(/of 100,000 bytes/);
  });

  it('import preview, merge, and invalid file', async () => {
    await load();
    const file = (text) => ({ text: async () => text });
    const pick = async (text) => {
      const input = $('#import-file');
      Object.defineProperty(input, 'files', { value: [file(text)], configurable: true });
      input.dispatchEvent(new Event('change'));
      await flush();
    };
    await pick('{nope');
    expect($('#import-panel').textContent).toContain('nothing was changed');
    await pick(
      JSON.stringify({
        version: 1,
        shortcuts: [sc('x', 'imported'), sc('y', 'work', { description: 'new' })],
      })
    );
    expect($('#import-panel').textContent).toContain('2 shortcut(s)');
    await click($('#import-merge'));
    expect(c.storage.sync.data.index.order).toHaveLength(3);
    expect(c.storage.sync.data['sc:1'].description).toBe('new');
    await pick(JSON.stringify({ version: 1, shortcuts: [sc('z', 'only')] }));
    await click($('#import-replace'));
    expect(c.storage.sync.data.index.order).toEqual(['z']);
  });

  it('export triggers a download', async () => {
    await load();
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await click($('#export-btn'));
    expect(clicked).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
