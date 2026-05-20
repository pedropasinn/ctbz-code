// Cross-platform path config. Tudo controlável via env, com defaults
// sensatos pra Linux e Windows.

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function envOr(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.length > 0 ? v : fallback;
}

// Diretório-base do ctbz (estado, cache, configs). $CTBZ_HOME ou ~/.ctbz.
export const CTBZ_HOME = path.resolve(envOr('CTBZ_HOME', path.join(os.homedir(), '.ctbz')));

// Sandbox de trabalho — tools tipo read_file/shell_sandbox só atuam aqui.
// $CTBZ_WORK_DIR ou cwd.
export const WORK_DIR = path.resolve(envOr('CTBZ_WORK_DIR', process.cwd()));

// Pasta de material confidencial Contabilizei.
// Default = pasta-pai deste projeto (já vivemos dentro de Confidencial/).
// fileURLToPath é seguro em Windows (lida com /C:/...).
const THIS_FILE = fileURLToPath(import.meta.url);
const DEFAULT_CONFIDENCIAL = path.resolve(path.dirname(THIS_FILE), '..', '..', '..');
export const CONFIDENCIAL_DIR = path.resolve(envOr('CTBZ_CONFIDENCIAL_DIR', DEFAULT_CONFIDENCIAL));

// Arquivo SQLite.
export const STATE_DB = path.join(CTBZ_HOME, 'state.db');

// Pasta de filas de tasks (monorepo-like).
export const TASKS_DIR = path.resolve(envOr('CTBZ_TASKS_DIR', path.join(WORK_DIR, 'ctbz_tasks')));
export const TASKS_STATE_DIR = path.join(TASKS_DIR, '.state');

// Pasta de canais (sinks de eventos — log local, webhook, etc).
export const CHANNELS_DIR = path.join(CTBZ_HOME, 'channels');

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// Tenta resolver um path contra uma raiz (sandboxing). Retorna o path absoluto
// se cai dentro de root, ou null se foge.
export function safeJoin(root: string, candidate: string): string | null {
  const abs = path.resolve(root, candidate);
  const rootAbs = path.resolve(root);
  if (abs === rootAbs) return abs;
  const withSep = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;
  return abs.startsWith(withSep) ? abs : null;
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}
