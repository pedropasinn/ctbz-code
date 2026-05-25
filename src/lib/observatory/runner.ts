// Roda o Observatory: para cada prompt × cliente, chama, escora, grava.
// Suporta --dry (corta a 2 prompts) e callback de progresso.
// Inclui delay configurável entre chamadas (CTBZ_OBSERVATORY_DELAY_MS,
// default 500ms) e retry exponencial em 429/overloaded.

import { PROMPTS, ObservatoryPrompt } from './prompts.js';
import { createAvailableClients } from './clients.js';
import { scoreResponse, aggregate, AggregateMetrics } from './scoring.js';
import { addMentionsRun } from '../state.js';
import { AgentBridge } from '../native/anthropic_bridge.js';
import { DEFAULT_MODEL } from '../constants.js';

export interface ObservatoryRunOptions {
  dry?: boolean;
  promptIds?: string[];
  onProgress?: (ev: { kind: 'ask_start' | 'ask_done' | 'score_done' | 'error'; promptId: string; clientId: string; err?: string }) => void;
}

export interface ObservatoryRunResult {
  date: string;
  totalCalls: number;
  byClient: Record<string, { calls: number; errors: number; metrics: AggregateMetrics }>;
}

const DELAY_MS = Number(process.env.CTBZ_OBSERVATORY_DELAY_MS) || 500;
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetriable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|rate_limit|overloaded|503|500|ETIMEDOUT|ECONNRESET/.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === MAX_RETRIES || !isRetriable(e)) throw e;
      const backoff = Math.min(2000 * Math.pow(2, i), 15000);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

export async function runObservatory(opts: ObservatoryRunOptions = {}): Promise<ObservatoryRunResult> {
  const today = new Date().toISOString().slice(0, 10);
  let prompts: ObservatoryPrompt[] = PROMPTS;
  if (opts.promptIds && opts.promptIds.length) {
    prompts = prompts.filter((p) => opts.promptIds!.includes(p.id));
  }
  if (opts.dry) prompts = prompts.slice(0, 2);

  const clients = createAvailableClients();
  if (clients.length === 0) throw new Error('Nenhum cliente LLM disponível (faltam keys). Defina ANTHROPIC_API_KEY/OPENAI_API_KEY/GEMINI_API_KEY/PERPLEXITY_API_KEY.');

  // Bridge único para o scoring — reutilizado em todas as chamadas (antes
  // criávamos 1 bridge por scoring × N chamadas, que é desperdício).
  const scoringBridge = AgentBridge.fromEnv(DEFAULT_MODEL);
  const scoringClient = scoringBridge.getClient();

  const byClient: Record<string, { calls: number; errors: number; rows: { scoring: import('./scoring.js').ScoringResult }[] }> = {};
  let total = 0;

  for (const c of clients) byClient[c.id] = { calls: 0, errors: 0, rows: [] };

  let callIdx = 0;
  for (const p of prompts) {
    for (const c of clients) {
      if (callIdx > 0 && DELAY_MS > 0) await sleep(DELAY_MS);
      callIdx++;

      opts.onProgress?.({ kind: 'ask_start', promptId: p.id, clientId: c.id });
      try {
        const response = await withRetry(() => c.ask(p.text));
        opts.onProgress?.({ kind: 'ask_done', promptId: p.id, clientId: c.id });
        const scoring = await withRetry(() => scoreResponse(response, DEFAULT_MODEL, scoringClient));
        opts.onProgress?.({ kind: 'score_done', promptId: p.id, clientId: c.id });
        addMentionsRun({ runDate: today, promptId: p.id, model: c.model, response, scoringJson: scoring as unknown as Record<string, unknown> });
        byClient[c.id].calls++;
        byClient[c.id].rows.push({ scoring });
        total++;
      } catch (e: unknown) {
        byClient[c.id].errors++;
        opts.onProgress?.({ kind: 'error', promptId: p.id, clientId: c.id, err: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  const result: ObservatoryRunResult = { date: today, totalCalls: total, byClient: {} };
  for (const c of clients) {
    result.byClient[c.id] = {
      calls: byClient[c.id].calls,
      errors: byClient[c.id].errors,
      metrics: aggregate(byClient[c.id].rows),
    };
  }
  return result;
}

export function formatObservatoryReport(r: ObservatoryRunResult): string {
  const lines: string[] = [`# Mentions Observatory · ${r.date}`, '', `Total de chamadas: ${r.totalCalls}`, ''];
  for (const [id, s] of Object.entries(r.byClient)) {
    const m = s.metrics;
    const gapLabel = m.competitor_label ? `Gap vs ${m.competitor_label}` : 'Gap vs concorrente';
    lines.push(`## ${id} (${s.calls} ok, ${s.errors} erro)`);
    lines.push(`- Share of Voice: ${(m.share_of_voice * 100).toFixed(1)}%`);
    lines.push(`- Recommendation Rate: ${(m.recommendation_rate * 100).toFixed(1)}%`);
    lines.push(`- Avg Position: ${m.avg_position == null ? '—' : m.avg_position.toFixed(2)}`);
    lines.push(`- Sentiment Score: ${m.sentiment_score.toFixed(2)}`);
    lines.push(`- ${gapLabel}: ${(m.gap_vs_competitor * 100).toFixed(1)} pp`);
    lines.push('');
  }
  return lines.join('\n');
}
