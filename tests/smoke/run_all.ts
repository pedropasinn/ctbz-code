// Roda todos os smokes em sequência. Cada um é um processo separado para
// evitar interferência (sqlite, mocks).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((f) => /^d\d+_.*\.ts$/.test(f) && f !== 'run_all.ts')
  .sort();

let failed = 0;
for (const f of files) {
  process.stdout.write(`▶ ${f} ... `);
  const r = spawnSync('npx', ['tsx', path.join(here, f)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (r.status === 0) {
    const last = (r.stdout.trim().split('\n').pop() ?? '').trim();
    console.log(last || 'ok');
  } else {
    failed++;
    console.log('FAIL');
    if (r.stdout) console.log(r.stdout);
    if (r.stderr) console.error(r.stderr);
  }
}
if (failed > 0) {
  console.error(`\n${failed} smoke(s) falharam.`);
  process.exit(1);
}
console.log(`\n${files.length} smokes verdes.`);
