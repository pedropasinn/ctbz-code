import { parseTaskFile, setItemStatusInFile } from '../../src/lib/queue/parser.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const errs: string[] = [];
const tmp = path.join(os.tmpdir(), `ctbz-queue-${Date.now()}.md`);
fs.writeFileSync(tmp, `# Demo

- [ ] Primeiro item
- [x] Segundo item já feito
- [!] Terceiro falhado (agent=briefing model=claude-opus-4-7 verify="echo ok")
- [~] Em progresso (agent=mentions)
`, 'utf8');

try {
  const parsed = parseTaskFile(tmp);
  if (parsed.title !== 'Demo') errs.push(`title esperado 'Demo', got ${parsed.title}`);
  if (parsed.items.length !== 4) errs.push(`esperava 4 items, got ${parsed.items.length}`);
  if (parsed.items[0].status !== 'pending') errs.push('item 1 deveria ser pending');
  if (parsed.items[1].status !== 'completed') errs.push('item 2 deveria ser completed');
  if (parsed.items[2].status !== 'failed') errs.push('item 3 deveria ser failed');
  if (parsed.items[2].agent !== 'briefing') errs.push(`agent annot falhou: ${parsed.items[2].agent}`);
  if (parsed.items[2].model !== 'claude-opus-4-7') errs.push(`model annot falhou: ${parsed.items[2].model}`);
  if (parsed.items[2].verify !== 'echo ok') errs.push(`verify annot falhou: ${parsed.items[2].verify}`);
  if (parsed.items[2].description !== 'Terceiro falhado') errs.push(`desc strip falhou: ${parsed.items[2].description}`);
  if (parsed.items[3].agent !== 'mentions') errs.push('item 4 agent annot');

  // setItemStatusInFile: vira [ ] em [x]
  setItemStatusInFile(tmp, parsed.items[0].lineNo, 'completed');
  const parsed2 = parseTaskFile(tmp);
  if (parsed2.items[0].status !== 'completed') errs.push('setItemStatusInFile não persistiu');

  if (errs.length) {
    console.error('FAIL:\n  - ' + errs.join('\n  - '));
    process.exit(1);
  }
  console.log('ok d6_queue_parser');
} finally {
  fs.unlinkSync(tmp);
}
