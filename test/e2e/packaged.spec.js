import { test, expect, launch, ROOT } from './fixtures.js';
import { unzip } from './unzip.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir;
test.beforeAll(() => {
  // Build and package the production extension so the zip under test is current.
  execFileSync('node', ['scripts/build.js'], { cwd: ROOT, stdio: 'pipe' });
  execFileSync('node', ['scripts/package.js'], { cwd: ROOT, stdio: 'pipe' });
  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  dir = mkdtempSync(join(tmpdir(), 'kl-packaged-'));
  unzip(join(ROOT, 'release', `keyword-launcher-${version}.zip`), dir);
});
test.afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('E18 the release zip loads: E1 passes, no test hook, Test run opens the default shortcut tabs', async () => {
  const ext = await launch(dir, { testHook: false });
  try {
    const sw = ext.getSw();
    expect(sw.url()).toContain(ext.extId);
    expect(await sw.evaluate(() => typeof globalThis.__kl)).toBe('undefined');

    const page = await ext.context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${ext.extId}/options/options.html`);
    await expect(page.locator('h1')).toHaveText('Keyword Launcher');
    await page.locator('#shortcut-list li', { hasText: 'work' }).locator('button.item').click();
    await page.click('#test-btn');
    await expect(page.locator('#editor .log')).toContainText('openUrls: ok');
    await expect
      .poll(
        () =>
          ext.context
            .pages()
            .map((p) => p.url())
            .filter((u) => /mail\.google\.com|calendar\.google\.com/.test(u)).length
      )
      .toBe(2);
    expect(errors).toEqual([]);
    expect(ext.consoleErrors).toEqual([]);
  } finally {
    await ext.close();
  }
});
