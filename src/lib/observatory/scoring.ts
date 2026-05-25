// Scoring: usa Claude (modelo configurável) como avaliador. Para cada
// resposta, extrai marcas citadas, posição da marca primária, sentimento,
// recomendação. Marcas/concorrentes vêm de env (ver brands.ts).

import type Anthropic from '@anthropic-ai/sdk';
import { AgentBridge } from '../native/anthropic_bridge.js';
import { DEFAULT_MODEL } from '../constants.js';
import { getBrandConfig, primaryCompetitor, BrandConfig } from './brands.js';

export interface ScoringResult {
  marcas_citadas: string[];
  posicao_primary: number | null;
  sentimento_primary: 'positivo' | 'neutro' | 'negativo' | 'na';
  recomendacao_explicita: boolean;
  argumento_recomendacao: string;
}

function buildEvalSystem(b: BrandConfig): string {
  const known = b.all.length > 0 ? b.all.join(', ') : '(sem marcas configuradas — defina CTBZ_BRAND_PRIMARY e CTBZ_BRAND_COMPETITORS)';
  return `Você é um avaliador imparcial. Receberá a resposta de um LLM a uma pergunta sobre o mercado da marca monitorada. Extraia:
1. Marcas/empresas citadas (lista). Foque em: ${known}.
2. Posição da marca primária (${b.primary}) na lista de recomendações da resposta (1 = 1ª citada/recomendada, null se não citada).
3. Sentimento sobre ${b.primary} (positivo/neutro/negativo/na).
4. Recomendação explícita de ${b.primary} (true/false).
5. Argumento principal usado (1 frase, ou string vazia se não citada).

Retorne SOMENTE JSON válido neste schema:
{"marcas_citadas":[],"posicao_primary":null,"sentimento_primary":"na","recomendacao_explicita":false,"argumento_recomendacao":""}`;
}

function parseJsonLenient(s: string): unknown {
  const start = s.indexOf('{');
  if (start < 0) throw new Error('sem JSON na resposta');
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) {
        const blob = s.slice(start, i + 1);
        return JSON.parse(blob);
      }
    }
  }
  throw new Error('JSON não fechado');
}

export async function scoreResponse(
  response: string,
  modelName = DEFAULT_MODEL,
  client?: Anthropic,
): Promise<ScoringResult> {
  const b = getBrandConfig();
  const c = client ?? AgentBridge.fromEnv(modelName).getClient();
  const resp = await c.messages.create({
    model: modelName,
    max_tokens: 800,
    system: buildEvalSystem(b),
    messages: [{ role: 'user', content: 'Resposta a avaliar:\n\n' + response }],
  });
  const text = resp.content.filter((bk) => bk.type === 'text').map((bk) => (bk as { text: string }).text).join('');
  const parsed = parseJsonLenient(text) as Partial<ScoringResult>;
  return {
    marcas_citadas: Array.isArray(parsed.marcas_citadas) ? parsed.marcas_citadas : [],
    posicao_primary: typeof parsed.posicao_primary === 'number' ? parsed.posicao_primary : null,
    sentimento_primary: (parsed.sentimento_primary as ScoringResult['sentimento_primary']) ?? 'na',
    recomendacao_explicita: !!parsed.recomendacao_explicita,
    argumento_recomendacao: typeof parsed.argumento_recomendacao === 'string' ? parsed.argumento_recomendacao : '',
  };
}

export interface AggregateMetrics {
  total_prompts: number;
  share_of_voice: number;          // % das respostas em que primary é citada
  recommendation_rate: number;     // % com recomendação explícita
  avg_position: number | null;     // posição média quando citada
  sentiment_score: number;         // média ponderada
  gap_vs_competitor: number;       // SoV(primary) - SoV(top competitor) em pp
  competitor_label: string | null; // qual concorrente foi usado no gap
}

interface ScoringSummary {
  scoring: ScoringResult;
}

export function aggregate(rows: ScoringSummary[], brand: BrandConfig = getBrandConfig()): AggregateMetrics {
  const total = rows.length;
  const competitor = primaryCompetitor(brand);
  if (total === 0) {
    return { total_prompts: 0, share_of_voice: 0, recommendation_rate: 0, avg_position: null, sentiment_score: 0, gap_vs_competitor: 0, competitor_label: competitor };
  }
  const citadas = rows.filter((r) => r.scoring.marcas_citadas.includes(brand.primary));
  const rec = rows.filter((r) => r.scoring.recomendacao_explicita);
  const positions = rows.map((r) => r.scoring.posicao_primary).filter((p): p is number => typeof p === 'number');
  const avgPos = positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
  const sentimentMap: Record<string, number> = { positivo: 1, neutro: 0, negativo: -1, na: 0 };
  const sentSum = rows.reduce((a, r) => a + (sentimentMap[r.scoring.sentimento_primary] ?? 0), 0);
  const competitorShare = competitor
    ? rows.filter((r) => r.scoring.marcas_citadas.includes(competitor)).length / total
    : 0;
  return {
    total_prompts: total,
    share_of_voice: citadas.length / total,
    recommendation_rate: rec.length / total,
    avg_position: avgPos,
    sentiment_score: sentSum / total,
    gap_vs_competitor: citadas.length / total - competitorShare,
    competitor_label: competitor,
  };
}
