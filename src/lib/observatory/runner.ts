// Roda o Observatory: para cada prompt × cliente, chama, escora, grava.
// Suporta --dry (corta a 2 prompts) e callback de progresso.

import { PROMPTS, ObservatoryPrompt } from './prompts.js';
import { createAvailableClients, LlmClient } from './clients.js';
import { scoreResponse, aggregate, AggregateMetrics } from './scoring.js';
import { addMentionsRun } from '../state.js';

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

export async function runObservatory(opts: ObservatoryRunOptions = {}): Promise<ObservatoryRunResult> {
  const today = new Date().toISOString().slice(0, 10);
  let prompts: ObservatoryPrompt[] = PROMPTS;
  if (opts.promptIds && opts.promptIds.length) {
    prompts = prompts.filter((p) => opts.promptIds!.includes(p.id));
  }
  if (opts.dry) prompts = prompts.slice(0, 2);

  const clients = createAvailableClients();
  if (clients.length === 0) throw new Error('Nenhum cliente LLM disponível (faltam keys). Defina ANTHROPIC_API_KEY/OPENAI_API_KEY/GEMINI_API_KEY/PERPLEXITY_API_KEY.');

  const byClient: Record<string, { calls: number; errors: number; rows: { scoring: import('./scoring.js').ScoringResult }[] }> = {};
  let total = 0;

  for (const c of clients) byClient[c.id] = { calls: 0, errors: 0, rows: [] };

  for (const p of prompts) {
    for (const c of clients) {
      opts.onProgress?.({ kind: 'ask_start', promptId: p.id, clientId: c.id });
      try {
        const response = await c.ask(p.text);
        opts.onProgress?.({ kind: 'ask_done', promptId: p.id, clientId: c.id });
        const scoring = await scoreResponse(response);
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
    lines.push(`## ${id} (${s.calls} ok, ${s.errors} erro)`);
    lines.push(`- Share of Voice: ${(m.share_of_voice * 100).toFixed(1)}%`);
    lines.push(`- Recommendation Rate: ${(m.recommendation_rate * 100).toFixed(1)}%`);
    lines.push(`- Avg Position: ${m.avg_position == null ? '—' : m.avg_position.toFixed(2)}`);
    lines.push(`- Sentiment Score: ${m.sentiment_score.toFixed(2)}`);
    lines.push(`- Gap vs Agilize: ${(m.gap_vs_agilize * 100).toFixed(1)} pp`);
    lines.push('');
  }
  return lines.join('\n');
}
