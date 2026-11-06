import archiver from 'archiver';
import { createWriteStream, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const outDir = join(ROOT, 'release');
const zipPath = join(outDir, `keyword-launcher-${version}.zip`);
mkdirSync(outDir, { recursive: true });

const output = createWriteStream(zipPath);
const zip = archiver('zip', { zlib: { level: 9 } });
zip.on('error', (e) => {
  throw e;
});
output.on('close', () => {
  const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
  console.log(`${zipPath}\n  size:   ${statSync(zipPath).size} bytes\n  sha256: ${sha}`);
});
zip.pipe(output);
zip.directory(join(ROOT, 'dist'), false);
await zip.finalize();
