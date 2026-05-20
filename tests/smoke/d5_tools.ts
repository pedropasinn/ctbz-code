// Testa read_file (sandbox), http_get (allow-list), shell_sandbox (allow-list).
// Como ctbz-code mora dentro de Cont/Confidencial, precisamos isolar WORK_DIR
// em /tmp para o read_file não cair na regra "bloqueia tudo em Confidencial".

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpWork = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-work-'));
const tmpConfidencial = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-conf-'));
process.env.CTBZ_WORK_DIR = tmpWork;
process.env.CTBZ_CONFIDENCIAL_DIR = tmpConfidencial;

const { readFile } = await import('../../src/lib/tools/read_file.js');
const { httpGet } = await import('../../src/lib/tools/http_get.js');
const { shellSandbox } = await import('../../src/lib/tools/shell_sandbox.js');

const errs: string[] = [];
function expectThrows(fn: () => unknown, label: string) {
  try { fn(); errs.push(`esperava throw: ${label}`); } catch { /* ok */ }
}
async function expectThrowsAsync(fn: () => Promise<unknown>, label: string) {
  try { await fn(); errs.push(`esperava throw async: ${label}`); } catch { /* ok */ }
}

// read_file: lê algo do workdir
const tmpFile = path.join(tmpWork, 'sample.txt');
fs.writeFileSync(tmpFile, 'hello world\n', 'utf8');
const out = readFile({ path: 'sample.txt' });
if (!out.includes('hello world')) errs.push('read_file não devolveu conteúdo');
expectThrows(() => readFile({ path: '../../etc/passwd' }), 'path traversal');

// http_get: host fora da allow-list bloqueia, IP literal bloqueia
await expectThrowsAsync(() => httpGet({ url: 'http://example.com' }), 'example.com fora da allow-list');
await expectThrowsAsync(() => httpGet({ url: 'http://127.0.0.1' }), 'literal IP');

// shell_sandbox: node -e funciona; rm bloqueado
const r = await shellSandbox({ cmd: 'node', args: ['-e', 'process.stdout.write("ok-shell")'] });
if (!r.includes('ok-shell')) errs.push(`shell_sandbox stdout ausente: ${r.slice(0, 200)}`);
await expectThrowsAsync(() => shellSandbox({ cmd: 'rm', args: ['-rf', '/'] }), 'rm fora da allow-list');

// cleanup
try { fs.unlinkSync(tmpFile); fs.rmdirSync(tmpWork); fs.rmdirSync(tmpConfidencial); } catch { /* */ }

if (errs.length) {
  console.error('FAIL:\n  - ' + errs.join('\n  - '));
  process.exit(1);
}
console.log('ok d5_tools');
