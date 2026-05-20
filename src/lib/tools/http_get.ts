import { ToolSpec } from '../agents/types.js';

const DEFAULT_ALLOWLIST = [
  'docs.anthropic.com',
  'platform.openai.com',
  'ai.google.dev',
  'docs.perplexity.ai',
  'github.com',
  'raw.githubusercontent.com',
  'developer.mozilla.org',
];

const HARD_MAX_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export class HttpGetError extends Error {}

function getAllowlist(): string[] {
  const raw = process.env.CTBZ_HTTP_ALLOWLIST;
  if (!raw) return DEFAULT_ALLOWLIST;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function hostAllowed(host: string, allowlist: string[]): boolean {
  const h = host.toLowerCase();
  return allowlist.some((a) => h === a || h.endsWith('.' + a));
}

function isLiteralIp(host: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (host.includes(':')) return true; // IPv6 literal
  return false;
}

export async function httpGet(args: Record<string, unknown>): Promise<string> {
  const url = args.url;
  if (typeof url !== 'string' || !url) throw new HttpGetError("campo 'url' obrigatório");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new HttpGetError(`URL inválida: ${url}`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpGetError(`protocolo não suportado: ${parsed.protocol}`);
  }
  if (isLiteralIp(parsed.hostname)) throw new HttpGetError(`literal IP bloqueado: ${parsed.hostname}`);
  const allow = getAllowlist();
  if (!hostAllowed(parsed.hostname, allow)) {
    throw new HttpGetError(`host fora da allow-list (${parsed.hostname}). Permitidos: ${allow.join(', ')}`);
  }
  const maxChars = Math.min(Number(args.max_chars ?? 8_000), HARD_MAX_BYTES);
  const timeoutMs = Math.min(Math.max(Number(args.timeout_ms ?? DEFAULT_TIMEOUT_MS), 1000), 60_000);

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(parsed.href, { signal: ctrl.signal, redirect: 'manual' });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (loc) {
        try {
          const ru = new URL(loc, parsed.href);
          if (!hostAllowed(ru.hostname, allow)) {
            throw new HttpGetError(`redirect bloqueado para host fora da allow-list: ${ru.hostname}`);
          }
        } catch { /* ignore malformed */ }
      }
      return `[${resp.status}] redirect → ${loc ?? ''}`;
    }
    const text = await resp.text();
    const status = `[${resp.status} ${resp.statusText || ''}] ${parsed.href}\n`;
    const body = text.length > maxChars ? text.slice(0, maxChars) + `\n…[truncado em ${maxChars}/${text.length}]` : text;
    return status + body;
  } finally {
    clearTimeout(to);
  }
}

export const httpGetTool: ToolSpec = {
  name: 'http_get',
  description: 'GET HTTP(S) restrito a uma allow-list de domínios (env CTBZ_HTTP_ALLOWLIST ou default). Bloqueia IP literal, IPv6 literal, e redirects que saem da allow-list. Trunca resposta.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      max_chars: { type: 'integer', minimum: 256, maximum: HARD_MAX_BYTES },
      timeout_ms: { type: 'integer', minimum: 1000, maximum: 60_000 },
    },
    required: ['url'],
    additionalProperties: false,
  },
  handler: httpGet,
};
