// Parser de arquivos ctbz_tasks/*.md no estilo monorepo (mas próprio do ctbz-code).
//
// Formato:
//
//   # Título da fila (opcional)
//
//   - [ ] descrição do item (agent=briefing model=claude-opus-4-7 verify="echo ok")
//   - [x] item já feito
//   - [!] item que falhou
//   - [~] item em progresso
//
// Anotações vão entre parens NO FINAL da descrição. Formato `chave=valor` (sem
// espaços) ou `chave="valor com espaços"`. Único multi-token aceito: verify.
// Diferente do monorepo, NÃO suportamos parens aninhadas em verify — use chr
// `|` para múltiplos comandos (não shell — vide queue/runner.ts).

import fs from 'node:fs';

export type ItemStatus = 'pending' | 'completed' | 'failed' | 'in_progress';

export interface ParsedItem {
  lineNo: number;            // 1-based no arquivo
  status: ItemStatus;
  description: string;
  agent?: string;
  model?: string;
  verify?: string;
  raw: string;
}

export interface ParsedFile {
  title: string | null;
  items: ParsedItem[];
}

const STATUS_MAP: Record<string, ItemStatus> = {
  ' ': 'pending',
  'x': 'completed',
  'X': 'completed',
  '!': 'failed',
  '~': 'in_progress',
};

const ITEM_RE = /^- \[([ xX!~])\]\s+(.*)$/;
const TITLE_RE = /^#\s+(.*)$/;

// Extrai anotações `chave=valor` ou `chave="..."` do final da descrição.
// Retorna { stripped, annots }.
function extractAnnotations(desc: string): { stripped: string; annots: Record<string, string> } {
  const annots: Record<string, string> = {};
  // Procura o último bloco entre parens "(...)" como grupo de anotações.
  // Se tem `=` dentro, tratamos como anotações; senão deixa na descrição.
  const m = desc.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!m) return { stripped: desc.trim(), annots };
  const body = m[2];
  if (!body.includes('=')) return { stripped: desc.trim(), annots };

  // tokenize: chave=valor com suporte a aspas duplas.
  const re = /([a-zA-Z_][a-zA-Z_0-9]*)=("([^"]*)"|([^\s]+))/g;
  let mm: RegExpExecArray | null;
  let consumed = 0;
  while ((mm = re.exec(body)) !== null) {
    const key = mm[1];
    const val = mm[3] !== undefined ? mm[3] : mm[4];
    annots[key] = val;
    consumed = mm.index + mm[0].length;
  }
  // Se a tokenização cobriu o body todo (ignorando espaços), achamos anotações de verdade.
  const leftover = body.slice(consumed).trim();
  if (leftover.length > 0) {
    // não eram só anotações — deixa como descrição
    return { stripped: desc.trim(), annots: {} };
  }
  return { stripped: m[1].trim(), annots };
}

export function parseTaskFile(filePath: string): ParsedFile {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  let title: string | null = null;
  const items: ParsedItem[] = [];

  lines.forEach((line, idx) => {
    if (!title) {
      const tm = line.match(TITLE_RE);
      if (tm) title = tm[1].trim();
    }
    const m = line.match(ITEM_RE);
    if (!m) return;
    const status = STATUS_MAP[m[1]] ?? 'pending';
    const rest = m[2];
    const { stripped, annots } = extractAnnotations(rest);
    items.push({
      lineNo: idx + 1,
      status,
      description: stripped,
      agent: annots.agent,
      model: annots.model,
      verify: annots.verify,
      raw: line,
    });
  });

  return { title, items };
}

// Atualiza o checkbox de uma linha específica no arquivo (sem reescrever o resto).
export function setItemStatusInFile(filePath: string, lineNo: number, status: ItemStatus): void {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lineNo < 1 || lineNo > lines.length) throw new Error(`linha ${lineNo} fora do arquivo`);
  const idx = lineNo - 1;
  const mark = status === 'completed' ? 'x' : status === 'failed' ? '!' : status === 'in_progress' ? '~' : ' ';
  lines[idx] = lines[idx].replace(/^- \[[ xX!~]\]/, `- [${mark}]`);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}
