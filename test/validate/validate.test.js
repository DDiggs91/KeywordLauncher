import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../../scripts/build.js';
import { validateDist, lastChangelogVersion } from '../../scripts/validate.js';

const tmp = mkdtempSync(join(tmpdir(), 'kl-validate-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

let dir;
let n = 0;
const edit = (rel, fn) => {
  const p = join(dir, rel);
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
};
const editManifest = (fn) =>
  edit('manifest.json', (t) => {
    const m = JSON.parse(t);
    fn(m);
    return JSON.stringify(m);
  });

beforeEach(() => {
  dir = join(tmp, `dist-${++n}`);
  build({ out: dir });
});

describe('validate.js', () => {
  it('passes a clean build', () => expect(validateDist(dir)).toEqual([]));

  it('fails on a missing icon', () => {
    rmSync(join(dir, 'icons/icon48.png'));
    expect(validateDist(dir)).toContain('referenced file missing: icons/icon48.png');
  });
  it('fails on an extra <all_urls> permission', () => {
    editManifest((m) => m.permissions.push('<all_urls>'));
    expect(validateDist(dir).join('\n')).toMatch(/unexpected permissions: <all_urls>/);
  });
  it('fails on host permissions', () => {
    editManifest((m) => (m.host_permissions = ['https://*/*']));
    expect(validateDist(dir).join('\n')).toMatch(/host_permissions is not allowed/);
  });
  it('fails on eval and new Function and string timers', () => {
    appendFileSync(
      join(dir, 'lib/xml.js'),
      '\neval("1");\nnew Function("return 1");\nsetTimeout("x()", 1);\n'
    );
    const out = validateDist(dir).join('\n');
    expect(out).toMatch(/eval\(\) found in lib\/xml.js/);
    expect(out).toMatch(/new Function found/);
    expect(out).toMatch(/string timer callback/);
  });
  it('fails on a remote script tag', () => {
    edit('options/options.html', (t) => t.replace('options.js', 'https://evil.example/x.js'));
    expect(validateDist(dir).join('\n')).toMatch(/remote script in options\/options.html/);
  });
  it('fails on a leftover __kl test hook', () => {
    appendFileSync(join(dir, 'background/service-worker.js'), '\nglobalThis.__kl = {};\n');
    expect(validateDist(dir).join('\n')).toMatch(
      /test hook "__kl" found in background\/service-worker.js/
    );
  });
  it('a test build keeps the hook and a normal build strips it', () => {
    const t = build({ out: join(tmp, 'test-build'), test: true });
    expect(readFileSync(join(t, 'background/service-worker.js'), 'utf8')).toContain('__kl');
    expect(readFileSync(join(dir, 'background/service-worker.js'), 'utf8')).not.toContain(
      'KL_TEST'
    );
  });
  it('fails on a version mismatch', () => {
    editManifest((m) => (m.version = '9.9.9'));
    expect(validateDist(dir).join('\n')).toMatch(
      /version mismatch: manifest 9.9.9 vs package.json/
    );
  });
  it('fails on a wrong-sized icon and a non-PNG icon', () => {
    cpSync(join(dir, 'icons/icon16.png'), join(dir, 'icons/icon128.png'));
    writeFileSync(join(dir, 'icons/icon32.png'), 'nope');
    const out = validateDist(dir).join('\n');
    expect(out).toMatch(/icon128.png is 16x16, expected 128x128/);
    expect(out).toMatch(/icon32.png is not a PNG/);
  });
  it('fails on bad default shortcuts', () => {
    edit('defaults/default-shortcuts.json', (t) => t.replace('"docs"', '"bad key"'));
    expect(validateDist(dir).join('\n')).toMatch(/default-shortcuts.json/);
    writeFileSync(join(dir, 'defaults/default-shortcuts.json'), '{');
    expect(validateDist(dir).join('\n')).toMatch(/default-shortcuts.json/);
  });
  it('fails on schema violations and oversize', () => {
    editManifest((m) => {
      m.manifest_version = 2;
      delete m.omnibox;
    });
    const out = validateDist(dir).join('\n');
    expect(out).toMatch(/manifest_version must be 3/);
    expect(out).toMatch(/manifest schema/);
    writeFileSync(join(dir, 'big.bin'), Buffer.alloc(1024 * 1024));
    expect(validateDist(dir).join('\n')).toMatch(/not under 1 MB/);
  });
  it('fails on unreadable manifest', () => {
    writeFileSync(join(dir, 'manifest.json'), '{');
    expect(validateDist(dir)[0]).toMatch(/not valid JSON/);
  });
  it('requires version greater than the last CHANGELOG entry', () => {
    const root = join(tmp, 'root');
    mkdirSync(root, { recursive: true });
    cpSync(join(process.cwd(), 'schemas'), join(root, 'schemas'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    expect(lastChangelogVersion(root)).toBeNull();
    writeFileSync(join(root, 'CHANGELOG.md'), '## [0.9.0]\n## [1.0.0]\n## Unreleased\n');
    expect(lastChangelogVersion(root)).toBe('1.0.0');
    expect(validateDist(dir, { root }).join('\n')).toMatch(
      /must be greater than the last CHANGELOG entry 1.0.0/
    );
    writeFileSync(join(root, 'CHANGELOG.md'), '## [0.9.0]\n');
    expect(validateDist(dir, { root })).toEqual([]);
  });
});
