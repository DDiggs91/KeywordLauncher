import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import { validateExport } from '../src/lib/schema.js';
import { checkSizes } from '../src/lib/storage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERMISSIONS = ['tabs', 'tabGroups', 'storage', 'offscreen'];
const OPTIONAL = ['userScripts'];
const MAX_BYTES = 1024 * 1024;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
};

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** Latest released version in CHANGELOG.md (headings like "## [1.0.0]"), or null. */
export function lastChangelogVersion(root) {
  const p = join(root, 'CHANGELOG.md');
  if (!existsSync(p)) return null;
  const versions = [...readFileSync(p, 'utf8').matchAll(/^##\s*\[?v?(\d+(?:\.\d+){1,3})\]?/gm)].map(
    (m) => m[1]
  );
  return versions.sort(cmp).at(-1) ?? null;
}

/** Run every release check on a built extension directory. Returns a list of failure messages. */
export function validateDist(dir, { root = ROOT } = {}) {
  const fails = [];
  const fail = (m) => fails.push(m);

  // manifest
  let manifest;
  try {
    manifest = readJson(join(dir, 'manifest.json'));
  } catch (e) {
    return [`manifest.json missing or not valid JSON: ${e.message}`];
  }
  const ajv = new Ajv({ allErrors: true });
  const checkManifest = ajv.compile(readJson(join(root, 'schemas/manifest.schema.json')));
  if (!checkManifest(manifest)) {
    for (const e of checkManifest.errors)
      fail(`manifest schema: ${e.instancePath || '/'} ${e.message}`);
  }
  if (manifest.manifest_version !== 3) fail('manifest_version must be 3');

  // version
  const pkg = readJson(join(root, 'package.json'));
  if (manifest.version !== pkg.version) {
    fail(`version mismatch: manifest ${manifest.version} vs package.json ${pkg.version}`);
  }
  const last = lastChangelogVersion(root);
  if (last && cmp(manifest.version, last) <= 0) {
    fail(`version ${manifest.version} must be greater than the last CHANGELOG entry ${last}`);
  }

  // permissions
  const perms = manifest.permissions ?? [];
  const extra = perms.filter((p) => !PERMISSIONS.includes(p));
  const missing = PERMISSIONS.filter((p) => !perms.includes(p));
  if (extra.length) fail(`unexpected permissions: ${extra.join(', ')}`);
  if (missing.length) fail(`missing permissions: ${missing.join(', ')}`);
  const optExtra = (manifest.optional_permissions ?? []).filter((p) => !OPTIONAL.includes(p));
  if (optExtra.length) fail(`unexpected optional permissions: ${optExtra.join(', ')}`);
  for (const k of [
    'host_permissions',
    'optional_host_permissions',
    'content_scripts',
    'externally_connectable',
  ]) {
    if (manifest[k]) fail(`${k} is not allowed (no host access)`);
  }

  // referenced files
  const refs = [
    ...Object.values(manifest.icons ?? {}),
    manifest.options_ui?.page,
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    'offscreen/clipboard.html',
    'offscreen/clipboard.js',
    'defaults/default-shortcuts.json',
  ].filter(Boolean);
  for (const r of refs) if (!existsSync(join(dir, r))) fail(`referenced file missing: ${r}`);

  // code scans
  let totalBytes = 0;
  for (const file of walk(dir)) {
    const rel = file.slice(dir.length + 1);
    const size = statSync(file).size;
    totalBytes += size;
    const ext = extname(file);
    if (!['.js', '.html', '.json', '.css'].includes(ext)) continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes('__kl')) fail(`test hook "__kl" found in ${rel}`);
    if (ext === '.js') {
      if (/\beval\s*\(/.test(text)) fail(`eval() found in ${rel}`);
      if (/\bnew\s+Function\b/.test(text)) fail(`new Function found in ${rel}`);
      if (/\bset(?:Timeout|Interval)\s*\(\s*['"`]/.test(text))
        fail(`string timer callback found in ${rel}`);
    }
    if (ext === '.html' && /<script[^>]+src\s*=\s*["']?\s*(?:https?:)?\/\//i.test(text)) {
      fail(`remote script in ${rel}`);
    }
  }
  if (totalBytes >= MAX_BYTES) fail(`unpacked size ${totalBytes} bytes is not under 1 MB`);

  // default shortcuts
  try {
    const defaults = readJson(join(dir, 'defaults/default-shortcuts.json'));
    const check = ajv.compile(readJson(join(root, 'schemas/export.schema.json')));
    if (!check(defaults))
      for (const e of check.errors) fail(`default-shortcuts.json: ${e.instancePath} ${e.message}`);
    const r = validateExport(defaults);
    for (const e of r.errors) fail(`default-shortcuts.json: ${e.path}: ${e.message}`);
    if (!r.errors.length) checkSizes(r.data);
  } catch (e) {
    fail(`default-shortcuts.json: ${e.message}`);
  }

  // icons
  for (const size of [16, 32, 48, 128]) {
    const rel = manifest.icons?.[String(size)] ?? `icons/icon${size}.png`;
    const file = join(dir, rel);
    if (!existsSync(file)) continue; // already reported as missing
    const dims = pngSize(file);
    if (!dims) fail(`${rel} is not a PNG`);
    else if (dims.w !== size || dims.h !== size)
      fail(`${rel} is ${dims.w}x${dims.h}, expected ${size}x${size}`);
  }
  return fails;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = resolve(ROOT, process.argv[2] ?? 'dist');
  const fails = validateDist(dir);
  if (fails.length) {
    console.error(`Validation failed for ${dir}:\n` + fails.map((f) => `  ✗ ${f}`).join('\n'));
    process.exit(1);
  }
  console.log(`Validation passed for ${dir}`);
}
