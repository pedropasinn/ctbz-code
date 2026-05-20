import fs from 'node:fs';
import { ToolSpec } from '../agents/types.js';
import { WORK_DIR, CONFIDENCIAL_DIR, safeJoin } from '../paths.js';

const DEFAULT_MAX_CHARS = 16_000;
const HARD_MAX_CHARS = 200_000;

export class ReadFileError extends Error {}

export function readFile(args: Record<string, unknown>): string {
  const p = args.path;
  if (typeof p !== 'string' || !p) throw new ReadFileError("campo 'path' obrigatório");
  let maxChars = DEFAULT_MAX_CHARS;
  if (args.max_chars !== undefined) {
    const n = Number(args.max_chars);
    if (!Number.isFinite(n) || n <= 0) throw new ReadFileError(`max_chars inválido`);
    maxChars = Math.min(Math.floor(n), HARD_MAX_CHARS);
  }
  let offset = 0;
  if (args.offset !== undefined) {
    const n = Number(args.offset);
    if (!Number.isFinite(n) || n < 0) throw new ReadFileError('offset inválido');
    offset = Math.floor(n);
  }

  const full = safeJoin(WORK_DIR, p);
  if (!full) throw new ReadFileError(`path '${p}' fora do sandbox WORK_DIR=${WORK_DIR}`);
  // bloqueia toques em Confidencial via read_file genérico
  if (full.startsWith(CONFIDENCIAL_DIR)) {
    throw new ReadFileError('use a tool read_confidencial para arquivos em CONFIDENCIAL_DIR');
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    throw new ReadFileError(`arquivo não encontrado: ${full}`);
  }
  const text = fs.readFileSync(full, 'utf8').slice(offset);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n…[truncado em ${maxChars} de ${text.length} chars]`;
}

export const readFileTool: ToolSpec = {
  name: 'read_file',
  description: 'Lê um arquivo de texto sob CTBZ_WORK_DIR (cwd default). Bloqueia paths fora do sandbox e tudo dentro de Cont/Confidencial. Suporta offset + max_chars.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path relativo ao WORK_DIR (sem ".." escapando).' },
      offset: { type: 'integer', minimum: 0 },
      max_chars: { type: 'integer', minimum: 1, maximum: HARD_MAX_CHARS },
    },
    required: ['path'],
    additionalProperties: false,
  },
  handler: readFile,
};
