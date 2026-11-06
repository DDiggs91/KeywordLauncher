import { test, expect, sc } from './fixtures.js';

const urlsOf = (ext, names) => names.map(ext.server.url);

test('E12 create a shortcut in the UI, then run it without reloading', async ({ ext }) => {
  const [url] = urlsOf(ext, ['page-a.html']);
  await ext.primePage();
  const page = await ext.openOptions();
  await page.click('#add-shortcut');
  await page.fill('#ed-keyword', 'ui1');
  await page.fill('.urls input', url);
  await page.click('#save-btn');
  await expect(page.locator('#status')).toContainText('Saved "ui1"');
  await ext.run('ui1');
  await expect.poll(async () => (await ext.tabUrls()).includes(url)).toBe(true);
});

test('E13 edit a URL, save, run: the new URL opens', async ({ ext }) => {
  const [oldUrl, newUrl] = urlsOf(ext, ['page-a.html', 'page-b.html']);
  await ext.seed([sc('1', 'site', [{ type: 'openUrls', urls: [oldUrl], target: 'newTabs' }])]);
  await ext.primePage();
  const page = await ext.openOptions();
  await page.click('#shortcut-list li button.item');
  await page.fill('.urls input', newUrl);
  await page.click('#save-btn');
  await expect(page.locator('#status')).toContainText('Saved "site"');
  await ext.run('site');
  await expect.poll(async () => (await ext.tabUrls()).includes(newUrl)).toBe(true);
  expect(await ext.tabUrls()).not.toContain(oldUrl);
});

test('E14 Test run opens the same tabs as run', async ({ ext }) => {
  const urls = urlsOf(ext, ['page-a.html', 'page-b.html']);
  await ext.seed([sc('1', 'two', [{ type: 'openUrls', urls, target: 'newTabs' }])]);
  await ext.primePage();
  const page = await ext.openOptions();
  await page.click('#shortcut-list li button.item');
  await page.click('#test-btn');
  await expect(page.locator('#editor .log')).toContainText('openUrls: ok');
  await expect
    .poll(async () => (await ext.tabUrls()).filter((u) => urls.includes(u)))
    .toEqual(urls);
  const afterTestRun = (await ext.tabUrls()).filter((u) => urls.includes(u));
  await ext.run('two', 'newForegroundTab');
  await expect
    .poll(async () => (await ext.tabUrls()).filter((u) => urls.includes(u)).length)
    .toBe(afterTestRun.length * 2);
});
