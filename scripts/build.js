import { cpSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_BLOCK = /\/\/ KL_TEST_START[\s\S]*?\/\/ KL_TEST_END\n?/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Copy src/ to `out`, stamp the version, and strip the test hook unless `test` is true. */
export function build({ out = join(ROOT, 'dist'), test = false, root = ROOT } = {}) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  rmSync(out, { recursive: true, force: true });
  cpSync(join(root, 'src'), out, { recursive: true });

  const manifestPath = join(out, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  if (!test) {
    for (const file of walk(out)) {
      if (!file.endsWith('.js')) continue;
      const src = readFileSync(file, 'utf8');
      if (TEST_BLOCK.test(src)) writeFileSync(file, src.replace(TEST_BLOCK, ''));
      TEST_BLOCK.lastIndex = 0;
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--out');
  const out = resolve(ROOT, i > -1 ? process.argv[i + 1] : 'dist');
  const test = process.env.KL_TEST === '1';
  build({ out, test });
  console.log(`Built ${test ? 'TEST ' : ''}extension -> ${out}`);
}
