// SQLite local (~/.ctbz/state.db) com schema espelhando o que tínhamos no
// ctbz-agents Python: sessions, messages, tool_calls, mentions_runs, e
// tabelas novas pro queue monorepo-like: task_files, task_items, task_runs.

import Database, { Database as DB } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { CTBZ_HOME, STATE_DB, ensureDir } from './paths.js';

let _db: DB | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_session_idx ON messages(session_id);

CREATE TABLE IF NOT EXISTS tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  tool_use_id TEXT,
  tool_name TEXT NOT NULL,
  tool_input TEXT NOT NULL,
  output TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS tool_calls_session_idx ON tool_calls(session_id);

CREATE TABLE IF NOT EXISTS mentions_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  model TEXT NOT NULL,
  response TEXT NOT NULL,
  scoring_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS mentions_runs_date_idx ON mentions_runs(run_date);

CREATE TABLE IF NOT EXISTS task_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  title TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES task_files(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  agent_name TEXT,
  model_name TEXT,
  verify_cmd TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  UNIQUE(file_id, line_no)
);
CREATE INDEX IF NOT EXISTS task_items_status_idx ON task_items(status);

CREATE TABLE IF NOT EXISTS task_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  outcome TEXT,
  exit_code INTEGER,
  verify_exit_code INTEGER,
  stdout_tail TEXT,
  stderr_tail TEXT
);
CREATE INDEX IF NOT EXISTS task_runs_item_idx ON task_runs(item_id);
`;

export function getDb(): DB {
  if (_db) return _db;
  ensureDir(CTBZ_HOME);
  ensureDir(path.dirname(STATE_DB));
  const db = new Database(STATE_DB);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  _db = db;
  return db;
}

export function closeDb(): void {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
    _db = null;
  }
}

// ---- conversação (chat) ----
export function newSession(agent: string, model: string): number {
  const db = getDb();
  const info = db.prepare('INSERT INTO sessions (agent_name, model_name) VALUES (?, ?)').run(agent, model);
  return info.lastInsertRowid as number;
}

export function addMessage(sessionId: number, role: 'user' | 'assistant' | 'system', content: string): number {
  const db = getDb();
  const info = db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)').run(sessionId, role, content);
  return info.lastInsertRowid as number;
}

export interface ToolCallRecord {
  sessionId: number;
  messageId?: number | null;
  toolUseId?: string | null;
  toolName: string;
  toolInput: Record<string, unknown>;
  output?: string | null;
  ok: boolean;
  durationMs: number;
}

export function addToolCall(rec: ToolCallRecord): number {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO tool_calls
       (session_id, message_id, tool_use_id, tool_name, tool_input, output, ok, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      rec.sessionId,
      rec.messageId ?? null,
      rec.toolUseId ?? null,
      rec.toolName,
      JSON.stringify(rec.toolInput),
      rec.output ?? null,
      rec.ok ? 1 : 0,
      rec.durationMs,
    );
  return info.lastInsertRowid as number;
}

// ---- mentions observatory ----
export interface MentionsRunRecord {
  runDate: string;
  promptId: string;
  model: string;
  response: string;
  scoringJson?: Record<string, unknown> | null;
}

export function addMentionsRun(rec: MentionsRunRecord): number {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO mentions_runs (run_date, prompt_id, model, response, scoring_json)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      rec.runDate,
      rec.promptId,
      rec.model,
      rec.response,
      rec.scoringJson ? JSON.stringify(rec.scoringJson) : null,
    );
  return info.lastInsertRowid as number;
}

export function listMentionsRuns(runDate?: string): Array<{ id: number; run_date: string; prompt_id: string; model: string; response: string; scoring_json: string | null }> {
  const db = getDb();
  if (runDate) {
    return db.prepare('SELECT * FROM mentions_runs WHERE run_date = ? ORDER BY id').all(runDate) as Array<{ id: number; run_date: string; prompt_id: string; model: string; response: string; scoring_json: string | null }>;
  }
  return db.prepare('SELECT * FROM mentions_runs ORDER BY run_date DESC, id ASC').all() as Array<{ id: number; run_date: string; prompt_id: string; model: string; response: string; scoring_json: string | null }>;
}

// ---- task files (monorepo-like queue) ----
export function upsertTaskFile(filePath: string, title: string | null, totalItems: number): number {
  const db = getDb();
  db
    .prepare(
      `INSERT INTO task_files (path, title, total_items) VALUES (?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET title=excluded.title, total_items=excluded.total_items`,
    )
    .run(filePath, title, totalItems);
  const row = db.prepare('SELECT id FROM task_files WHERE path = ?').get(filePath) as { id: number };
  return row.id;
}

export interface TaskItemRecord {
  fileId: number;
  lineNo: number;
  description: string;
  agentName?: string | null;
  modelName?: string | null;
  verifyCmd?: string | null;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export function upsertTaskItem(rec: TaskItemRecord): number {
  const db = getDb();
  db
    .prepare(
      `INSERT INTO task_items (file_id, line_no, description, agent_name, model_name, verify_cmd, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_id, line_no) DO UPDATE SET
         description=excluded.description,
         agent_name=excluded.agent_name,
         model_name=excluded.model_name,
         verify_cmd=excluded.verify_cmd`,
    )
    .run(
      rec.fileId,
      rec.lineNo,
      rec.description,
      rec.agentName ?? null,
      rec.modelName ?? null,
      rec.verifyCmd ?? null,
      rec.status ?? 'pending',
    );
  const row = db.prepare('SELECT id FROM task_items WHERE file_id = ? AND line_no = ?').get(rec.fileId, rec.lineNo) as { id: number };
  return row.id;
}

export function setTaskItemStatus(itemId: number, status: 'pending' | 'in_progress' | 'completed' | 'failed', bumpAttempt = false): void {
  const db = getDb();
  if (bumpAttempt) {
    db.prepare('UPDATE task_items SET status = ?, attempts = attempts + 1 WHERE id = ?').run(status, itemId);
  } else {
    db.prepare('UPDATE task_items SET status = ? WHERE id = ?').run(status, itemId);
  }
}

export interface TaskRunStart { itemId: number; }
export interface TaskRunFinish {
  runId: number;
  exitCode: number;
  verifyExitCode: number | null;
  stdoutTail: string;
  stderrTail: string;
  outcome: 'ok' | 'failed' | 'cancelled' | 'verify_failed';
}

export function startTaskRun(item: TaskRunStart): number {
  const db = getDb();
  const info = db.prepare('INSERT INTO task_runs (item_id) VALUES (?)').run(item.itemId);
  return info.lastInsertRowid as number;
}

export function finishTaskRun(r: TaskRunFinish): void {
  const db = getDb();
  db
    .prepare(
      `UPDATE task_runs SET ended_at=datetime('now'), outcome=?, exit_code=?, verify_exit_code=?, stdout_tail=?, stderr_tail=? WHERE id=?`,
    )
    .run(r.outcome, r.exitCode, r.verifyExitCode, r.stdoutTail, r.stderrTail, r.runId);
}

export function listTaskItems(fileId?: number): Array<{ id: number; file_id: number; line_no: number; description: string; agent_name: string | null; model_name: string | null; verify_cmd: string | null; status: string; attempts: number }> {
  const db = getDb();
  if (fileId) {
    return db.prepare('SELECT * FROM task_items WHERE file_id = ? ORDER BY line_no').all(fileId) as Array<{ id: number; file_id: number; line_no: number; description: string; agent_name: string | null; model_name: string | null; verify_cmd: string | null; status: string; attempts: number }>;
  }
  return db.prepare('SELECT * FROM task_items ORDER BY file_id, line_no').all() as Array<{ id: number; file_id: number; line_no: number; description: string; agent_name: string | null; model_name: string | null; verify_cmd: string | null; status: string; attempts: number }>;
}

export function listTaskFiles(): Array<{ id: number; path: string; title: string | null; total_items: number }> {
  const db = getDb();
  return db.prepare('SELECT * FROM task_files ORDER BY id').all() as Array<{ id: number; path: string; title: string | null; total_items: number }>;
}
