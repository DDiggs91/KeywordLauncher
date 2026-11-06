// Builds the test extension (with the __kl hook) and runs Playwright. HEADED=1 runs under xvfb-run.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
build({ out: resolve(ROOT, 'dist-test'), test: true });

const args = ['playwright', 'test', ...process.argv.slice(2)];
const [cmd, cmdArgs] =
  process.env.HEADED === '1' ? ['xvfb-run', ['-a', 'npx', ...args]] : ['npx', args];
const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status ?? 1);
