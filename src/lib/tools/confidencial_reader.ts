// Tool read_confidencial — leitura controlada de arquivos numa pasta sensível.
// Allow-list literal vem da env CTBZ_CONFIDENCIAL_FILES (comma-separated).
// Diretório-base vem de CTBZ_CONFIDENCIAL_DIR (ver paths.ts). Sem env =
// allow-list vazia (tudo rejeitado).

import fs from 'node:fs';
import path from 'node:path';
import { ToolSpec } from '../agents/types.js';
import { CONFIDENCIAL_DIR } from '../paths.js';

function loadAllowlist(): string[] {
  const raw = process.env.CTBZ_CONFIDENCIAL_FILES;
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

let _allowed: Set<string> | null = null;
function getAllowed(): Set<string> {
  if (_allowed) return _allowed;
  _allowed = new Set(loadAllowlist());
  return _allowed;
}

const DEFAULT_MAX_CHARS = 20_000;
const HARD_MAX_CHARS = 200_000;
const BASE_DIR = CONFIDENCIAL_DIR;

export class ConfidencialReaderError extends Error {}

export function readConfidencial(args: Record<string, unknown>): string {
  const fileRaw = args.file;
  if (typeof fileRaw !== 'string' || !fileRaw) {
    throw new ConfidencialReaderError("campo 'file' obrigatório (string)");
  }
  if (fileRaw.includes('/') || fileRaw.includes('\\') || fileRaw.startsWith('..')) {
    throw new ConfidencialReaderError(`nome inválido: ${JSON.stringify(fileRaw)} (apenas basename)`);
  }
  const allowed = getAllowed();
  if (allowed.size === 0) {
    throw new ConfidencialReaderError(
      'allow-list vazia. Defina CTBZ_CONFIDENCIAL_FILES=arq1.json,arq2.json para liberar leitura.',
    );
  }
  if (!allowed.has(fileRaw)) {
    throw new ConfidencialReaderError(
      `arquivo ${JSON.stringify(fileRaw)} fora da allow-list; permitidos: ${[...allowed].join(', ')}`,
    );
  }

  let maxChars = DEFAULT_MAX_CHARS;
  if (args.max_chars !== undefined) {
    const n = Number(args.max_chars);
    if (!Number.isFinite(n) || n <= 0) {
      throw new ConfidencialReaderError(`max_chars inválido: ${args.max_chars}`);
    }
    maxChars = Math.min(Math.floor(n), HARD_MAX_CHARS);
  }

  const full = path.resolve(BASE_DIR, fileRaw);
  if (!full.startsWith(BASE_DIR + path.sep) && full !== BASE_DIR) {
    throw new ConfidencialReaderError(`caminho fora de ${BASE_DIR}: ${full}`);
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    throw new ConfidencialReaderError(`arquivo não encontrado: ${full}`);
  }

  const text = fs.readFileSync(full, 'utf8');
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n…[truncado em ${maxChars} de ${text.length} chars]`;
}

export const confidencialReaderTool: ToolSpec = {
  name: 'read_confidencial',
  description:
    'Lê um arquivo da allow-list em CTBZ_CONFIDENCIAL_DIR (controlada por env CTBZ_CONFIDENCIAL_FILES). Suporta max_chars (default 20000, teto 200000).',
  input_schema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Basename do arquivo (sem subpastas).' },
      max_chars: {
        type: 'integer',
        minimum: 1,
        maximum: HARD_MAX_CHARS,
        description: `Máximo de caracteres a devolver (default ${DEFAULT_MAX_CHARS}).`,
      },
    },
    required: ['file'],
    additionalProperties: false,
  },
  handler: readConfidencial,
};

export const ALLOWED_FILES_GETTER = () => [...getAllowed()];
