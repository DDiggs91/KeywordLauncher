import { test as base, expect, chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect };
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const TEST_EXT = join(ROOT, 'dist-test');
const HEADED = process.env.HEADED === '1';

/** Static server for test pages: no network needed. */
function startServer() {
  return new Promise((res) => {
    const server = createServer((req, resp) => {
      const name = new URL(req.url, 'http://x').pathname.slice(1) || 'start.html';
      try {
        const body = readFileSync(join(HERE, 'pages', name.replace(/[^\w.-]/g, '')));
        resp.writeHead(200, { 'content-type': 'text/html' }).end(body);
      } catch {
        resp.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

/** Launch Chromium with the unpacked extension. New headless (channel "chromium") is required for extensions. */
export async function launch(extPath = TEST_EXT, { testHook = true } = {}) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'kl-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: !HEADED,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  // Nothing may touch the real network: stub every non-local request.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<title>stub</title>stubbed ${route.request().url()}`,
    })
  );
  let sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const consoleErrors = [];
  const watch = (w) => w.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  watch(sw);
  context.on('serviceworker', (w) => {
    sw = w;
    watch(w);
  });
  const extId = new URL(sw.url()).host;
  const api = {
    context,
    extId,
    consoleErrors,
    getSw: () => context.serviceWorkers().at(-1) ?? sw,
    close: async () => {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
  // chrome.* is bound lazily after the worker starts, so wait for it, then for the install handler to seed defaults.
  const ready = () =>
    sw
      .evaluate(
        (hook) =>
          typeof chrome.storage?.sync?.get === 'function' &&
          (!hook || typeof globalThis.__kl === 'object'),
        testHook
      )
      .catch(() => false);
  await expect.poll(ready).toBe(true);
  await expect
    .poll(() => sw.evaluate(() => chrome.storage.sync.get('index').then((r) => Boolean(r.index))))
    .toBe(true);
  return api;
}

export const test = base.extend({
  server: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const { server, port } = await startServer();
      await use({ port, url: (p) => `http://127.0.0.1:${port}/${p}` });
      server.close();
    },
    { scope: 'worker' },
  ],
  ext: async ({ server }, use) => {
    const ext = await launch();
    const sw = () => ext.getSw();
    const helpers = {
      ...ext,
      server,
      /** Run input through the same code path as the omnibox Enter handler. */
      run: (input, disposition = 'currentTab') =>
        sw().evaluate(([i, d]) => globalThis.__kl.run(i, d), [input, disposition]),
      /** Replace all shortcuts (writes the same keys storage.js uses). */
      seed: (shortcuts, settings = { unknownKeyword: 'search', defaultTarget: 'currentTab' }) =>
        sw().evaluate(
          async ([shortcuts, settings]) => {
            await chrome.storage.sync.clear();
            const payload = { index: { version: 1, order: shortcuts.map((s) => s.id) }, settings };
            for (const s of shortcuts) payload[`sc:${s.id}`] = s;
            await chrome.storage.sync.set(payload);
          },
          [shortcuts, settings]
        ),
      storage: () => sw().evaluate(() => chrome.storage.sync.get(null)),
      /** All tabs in index order, waiting for none to be pending. */
      tabs: () =>
        sw().evaluate(async () =>
          (await chrome.tabs.query({}))
            .sort((a, b) => a.index - b.index)
            .map((t) => ({
              id: t.id,
              url: t.url || t.pendingUrl,
              title: t.title,
              groupId: t.groupId,
              active: t.active,
            }))
        ),
      tabUrls: async () => (await helpers.tabs()).map((t) => t.url),
      groups: () => sw().evaluate(() => chrome.tabGroups.query({})),
      /** Navigate the existing first tab to a local page so "current tab" is predictable. */
      async primePage(path = 'start.html') {
        const page = ext.context.pages()[0] ?? (await ext.context.newPage());
        await page.goto(server.url(path));
        await page.bringToFront();
        return page;
      },
      async openOptions() {
        const page = await ext.context.newPage();
        await page.goto(`chrome-extension://${ext.extId}/options/options.html`);
        await page.waitForSelector('#shortcut-list');
        return page;
      },
    };
    await use(helpers);
    await ext.close();
  },
});

/** Shortcut builder for seeding. */
export function sc(id, keyword, steps, extra = {}) {
  return { id, keyword, description: '', requiresQuery: false, steps, ...extra };
}
