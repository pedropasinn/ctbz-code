// Valida allow-list + path traversal + truncamento usando tmp files
// e env CTBZ_CONFIDENCIAL_FILES.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-conf-'));
const sample = path.join(dir, 'sample.json');
fs.writeFileSync(sample, JSON.stringify({ x: 'y'.repeat(500) }), 'utf8');

process.env.CTBZ_CONFIDENCIAL_DIR = dir;
process.env.CTBZ_CONFIDENCIAL_FILES = 'sample.json';

const { readConfidencial, ConfidencialReaderError } = await import('../../src/lib/tools/confidencial_reader.js');

const errs: string[] = [];

function expectThrows(fn: () => unknown, msg: string) {
  try { fn(); errs.push(`esperava throw: ${msg}`); }
  catch (e) {
    if (!(e instanceof ConfidencialReaderError) && !(e instanceof Error))
      errs.push(`tipo de erro inesperado em ${msg}`);
  }
}

// 1. fora da allow-list
expectThrows(() => readConfidencial({ file: 'outro.json' }), 'outro.json fora da allow-list');

// 2. path traversal
expectThrows(() => readConfidencial({ file: '../etc/passwd' }), 'path traversal');
expectThrows(() => readConfidencial({ file: 'subdir/x' }), 'subdir');

// 3. file ok com max_chars pequeno (trunca)
const out = readConfidencial({ file: 'sample.json', max_chars: 50 });
if (!out.includes('…[truncado em 50')) errs.push('esperava marcador de truncamento');
if (out.length > 150) errs.push(`truncamento não respeitado: len=${out.length}`);

// 4. max_chars inválido
expectThrows(() => readConfidencial({ file: 'sample.json', max_chars: -1 }), 'max_chars negativo');

// cleanup
try { fs.unlinkSync(sample); fs.rmdirSync(dir); } catch { /* */ }

if (errs.length) {
  console.error('FAIL:\n  - ' + errs.join('\n  - '));
  process.exit(1);
}
console.log('ok d4_confidencial');
