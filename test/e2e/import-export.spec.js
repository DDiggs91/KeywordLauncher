import { test, expect, launch } from './fixtures.js';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ROOT } from './fixtures.js';

const fixture = (name) => resolve(ROOT, 'test/fixtures', name);
const readStore = (sw) => sw.evaluate(() => chrome.storage.sync.get(null));
const importFile = async (page, path) => {
  await page.setInputFiles('#import-file', path);
  await page.waitForSelector('#import-panel:not([hidden])');
};

test('E15 export, then import into a fresh profile: shortcuts identical', async ({ ext }) => {
  const valid = JSON.parse(
    readFileSync(fixture('valid-export.json'), 'utf8').replaceAll('{PORT}', ext.server.port)
  );
  await ext.seed(valid.shortcuts, valid.settings);
  const page = await ext.openOptions();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
  const file = join(mkdtempSync(join(tmpdir(), 'kl-export-')), 'export.json');
  await download.saveAs(file);

  const other = await launch();
  try {
    const p2 = await other.context.newPage();
    await p2.goto(`chrome-extension://${other.extId}/options/options.html`);
    await importFile(p2, file);
    await p2.click('#import-replace');
    await expect(p2.locator('#status')).toContainText('Imported 2 shortcut(s)');
    const a = await ext.storage();
    const b = await readStore(other.getSw());
    expect(b.index.order).toEqual(a.index.order);
    for (const id of a.index.order) expect(b[`sc:${id}`]).toEqual(a[`sc:${id}`]);
    expect(b.settings).toEqual(a.settings);
  } finally {
    await other.close();
  }
});

for (const [id, name, message] of [
  ['E16a', 'invalid-export-duplicate.json', /already used/],
  ['E16b', 'invalid-export-bad-url.json', /not allowed|not a valid URL/],
]) {
  test(`${id} importing ${name} shows an error and changes nothing`, async ({ ext }) => {
    const before = await ext.storage();
    const page = await ext.openOptions();
    await importFile(page, fixture(name));
    await expect(page.locator('#import-panel')).toContainText('nothing was changed');
    await expect(page.locator('#import-panel')).toContainText(message);
    await expect(page.locator('#import-merge')).toHaveCount(0);
    expect(await ext.storage()).toEqual(before);
  });
}

test('E17 oversized import is rejected with a size error and nothing is written', async ({
  ext,
}) => {
  const before = await ext.storage();
  const page = await ext.openOptions();
  await importFile(page, fixture('oversized-export.json'));
  await expect(page.locator('#import-panel')).toContainText(/too large|Total size/);
  expect(await ext.storage()).toEqual(before);
});

test('importing a non-JSON file reports a parse error', async ({ ext }) => {
  const file = join(mkdtempSync(join(tmpdir(), 'kl-bad-')), 'bad.json');
  writeFileSync(file, '{nope');
  const page = await ext.openOptions();
  await importFile(page, file);
  await expect(page.locator('#import-panel')).toContainText('Not valid JSON');
});
