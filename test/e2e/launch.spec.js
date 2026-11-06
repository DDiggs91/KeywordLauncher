import { test, expect, sc } from './fixtures.js';

test('E1 extension loads: worker running, no console errors, options page opens', async ({
  ext,
}) => {
  expect(ext.getSw().url()).toContain(ext.extId);
  const page = await ext.openOptions();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expect(page.locator('h1')).toHaveText('Keyword Launcher');
  expect(errors).toEqual([]);
  expect(ext.consoleErrors).toEqual([]);
});

test('E2 first install seeds the 2 default shortcuts', async ({ ext }) => {
  const data = await ext.storage();
  expect(data.index.order).toHaveLength(2);
  const keywords = data.index.order.map((id) => data[`sc:${id}`].keyword).sort();
  expect(keywords).toEqual(['docs', 'work']);
});

test('E3 run opens 3 new tabs in order', async ({ ext }) => {
  const urls = ['page-a.html', 'page-b.html', 'page-c.html'].map(ext.server.url);
  await ext.seed([sc('w', 'work', [{ type: 'openUrls', urls, target: 'newTabs' }])]);
  await ext.primePage();
  const before = (await ext.tabs()).length;
  await ext.run('work');
  await expect.poll(async () => (await ext.tabUrls()).slice(before)).toEqual(urls);
});

test('E4 currentTab navigates the current tab, rest open as new tabs', async ({ ext }) => {
  const urls = ['page-a.html', 'page-b.html', 'page-c.html'].map(ext.server.url);
  await ext.seed([sc('w', 'work', [{ type: 'openUrls', urls, target: 'currentTab' }])]);
  await ext.primePage();
  const before = (await ext.tabs()).length;
  await ext.run('work');
  await expect
    .poll(async () => (await ext.tabUrls()).filter((u) => urls.includes(u)).length)
    .toBe(3);
  const tabs = await ext.tabs();
  expect(tabs).toHaveLength(before + 2);
  expect(tabs[0].url).toBe(urls[0]);
});

test('E5 default docs shortcut puts the encoded query in the URL', async ({ ext }) => {
  await ext.primePage();
  await ext.run('docs hello world');
  await expect.poll(async () => (await ext.tabUrls()).join(' ')).toContain('q=hello%20world');
});

test('E6 openUrls + tabGroup makes one named, colored group of exactly the new tabs', async ({
  ext,
}) => {
  const urls = ['page-a.html', 'page-b.html', 'page-c.html'].map(ext.server.url);
  await ext.seed([
    sc('w', 'work', [
      { type: 'openUrls', urls, target: 'newTabs' },
      { type: 'tabGroup', name: 'Work', color: 'blue' },
    ]),
  ]);
  await ext.primePage();
  await ext.run('work');
  await expect.poll(async () => (await ext.groups()).length).toBe(1);
  const [group] = await ext.groups();
  expect(group).toMatchObject({ title: 'Work', color: 'blue' });
  const inGroup = (await ext.tabs()).filter((t) => t.groupId === group.id);
  expect(inGroup.map((t) => t.url)).toEqual(urls);
});

test('E7 closeTabs removes matching tabs only', async ({ ext }) => {
  await ext.seed([sc('c', 'tidy', [{ type: 'closeTabs', pattern: 'page-b' }])]);
  await ext.primePage();
  for (const p of ['page-a.html', 'page-b.html', 'page-c.html']) {
    const page = await ext.context.newPage();
    await page.goto(ext.server.url(p));
  }
  await ext.run('tidy');
  await expect
    .poll(async () => (await ext.tabUrls()).some((u) => u.includes('page-b')))
    .toBe(false);
  const urls = await ext.tabUrls();
  expect(urls.some((u) => u.includes('page-a'))).toBe(true);
  expect(urls.some((u) => u.includes('page-c'))).toBe(true);
});

test('E8 copyText sends the templated text to the offscreen clipboard document', async ({
  ext,
}) => {
  await ext.seed([sc('k', 'cp', [{ type: 'copyText', text: 'ticket {query}' }])]);
  const page = await ext.primePage();
  await ext.context.grantPermissions(['clipboard-read'], { origin: new URL(page.url()).origin });
  const result = await ext.run('cp ABC-1');
  const offscreen = ext.context.pages().find((p) => p.url().includes('offscreen/clipboard.html'));
  const cdp = await ext.context.newCDPSession(page);
  const { targetInfos } = await cdp.send('Target.getTargets');
  expect(
    targetInfos.some((t) => t.url.endsWith('offscreen/clipboard.html')) || offscreen
  ).toBeTruthy();
  if (result.ok) {
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe('ticket ABC-1');
  } else {
    // Headless Chromium never focuses offscreen documents, so the browser refuses the write there.
    // Anything other than that known refusal is a real failure. Real Chrome is covered by the manual checklist.
    expect(result.log[0].message).toMatch(/not focused|Copying to the clipboard failed/);
  }
});

test('E9 runScript changes the page title (needs Chromium 135+ with user scripts enabled)', async ({
  ext,
  browserName,
}) => {
  const major = Number(
    (await ext.getSw().evaluate(() => navigator.userAgent)).match(/Chrome\/(\d+)/)[1]
  );
  const available = await ext
    .getSw()
    .evaluate(() => typeof chrome.userScripts?.execute === 'function');
  test.skip(
    major < 135 || !available,
    `chrome.userScripts.execute unavailable (Chromium ${major}, ${browserName})`
  );
  await ext.seed([
    sc('s', 'scr', [{ type: 'runScript', code: 'document.title = "changed " + QUERY;' }]),
  ]);
  const page = await ext.primePage();
  await ext.run('scr hi');
  await expect.poll(() => page.title()).toBe('changed hi');
});

test('E10 unknown keyword opens a Google search (request stubbed)', async ({ ext }) => {
  await ext.primePage();
  await ext.run('zzzunknown some words');
  await expect
    .poll(async () => (await ext.tabUrls()).join(' '))
    .toContain('https://www.google.com/search?q=zzzunknown%20some%20words');
});

test('E11 run still works after the service worker is killed', async ({ ext }) => {
  const url = ext.server.url('page-a.html');
  const page = await ext.primePage();
  const options = await ext.openOptions();
  const cdp = await ext.context.newCDPSession(page);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const swTarget = targetInfos.find(
    (t) => t.type === 'service_worker' && t.url.includes(ext.extId)
  );
  expect(swTarget).toBeTruthy();
  await cdp.send('Target.closeTarget', { targetId: swTarget.targetId });
  // A message from an extension page cold-starts the worker; its top-level listeners must be registered by then.
  const shortcut = sc('t', 'cold', [{ type: 'openUrls', urls: [url], target: 'newTabs' }]);
  await expect
    .poll(async () => {
      const reply = await options.evaluate(
        (s) =>
          chrome.runtime
            .sendMessage({ type: 'testRun', shortcut: s })
            .catch((e) => ({ ok: false, error: e.message })),
        shortcut
      );
      return reply?.ok;
    })
    .toBe(true);
  // The old worker handle is stale after a restart, so check the pages Playwright sees instead.
  await expect
    .poll(() => ext.context.pages().filter((p) => p.url() === url).length)
    .toBeGreaterThan(0);
});
