import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// CTBZ_HOME em tmp pra não poluir nem colidir com outros smokes
process.env.CTBZ_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-smoke-'));

// Importa depois que CTBZ_HOME está setado (paths.ts lê env na importação).
const { newSession, addMessage, addToolCall, getDb, closeDb } = await import('../../src/lib/state.js');

const db = getDb();
const sid = newSession('briefing', 'claude-opus-4-7');
if (typeof sid !== 'number' || sid < 1) { console.error('FAIL: newSession não retornou id'); process.exit(1); }
const mid = addMessage(sid, 'user', 'oi');
if (typeof mid !== 'number') { console.error('FAIL: addMessage'); process.exit(1); }
const tid = addToolCall({ sessionId: sid, messageId: mid, toolUseId: 'tu_1', toolName: 'read_confidencial', toolInput: { file: 'x' }, output: 'ok', ok: true, durationMs: 5 });
if (typeof tid !== 'number') { console.error('FAIL: addToolCall'); process.exit(1); }

const row = db.prepare('SELECT count(*) as n FROM tool_calls WHERE session_id=?').get(sid) as { n: number };
if (row.n !== 1) { console.error(`FAIL: esperava 1 tool_call, got ${row.n}`); process.exit(1); }

closeDb();
console.log('ok d5_state');
