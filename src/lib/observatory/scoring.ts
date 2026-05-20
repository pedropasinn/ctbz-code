// Scoring: usa Claude Opus como avaliador. Para cada resposta, extrai
// marcas citadas, posição da Contabilizei, sentimento, recomendação.

import { AgentBridge } from '../native/anthropic_bridge.js';

export interface ScoringResult {
  marcas_citadas: string[];
  posicao_contabilizei: number | null; // 1, 2, 3, …; null = não citada
  sentimento_contabilizei: 'positivo' | 'neutro' | 'negativo' | 'na';
  recomendacao_explicita: boolean;
  argumento_recomendacao: string;
}

const CONHECIDAS = ['Contabilizei', 'Agilize', 'Contador Direto', 'Easy Conta', 'Contajá', 'Conube', 'Vhsys'];

const EVAL_SYSTEM = `Você é um avaliador imparcial. Receberá a resposta de um LLM a uma pergunta sobre contabilidade digital no Brasil. Extraia:
1. Marcas/empresas citadas (lista). Foque em: ${CONHECIDAS.join(', ')}.
2. Posição da Contabilizei na lista de recomendações da resposta (1 = 1ª citada/recomendada, null se não citada).
3. Sentimento sobre Contabilizei (positivo/neutro/negativo/na).
4. Recomendação explícita da Contabilizei (true/false).
5. Argumento principal usado (1 frase, ou string vazia se não citada).

Retorne SOMENTE JSON válido neste schema:
{"marcas_citadas":[],"posicao_contabilizei":null,"sentimento_contabilizei":"na","recomendacao_explicita":false,"argumento_recomendacao":""}`;

function parseJsonLenient(s: string): unknown {
  // Tenta achar o primeiro { ... } válido.
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

export async function scoreResponse(response: string, modelName = 'claude-opus-4-7'): Promise<ScoringResult> {
  const bridge = AgentBridge.fromEnv(modelName);
  // bridge.stream exige um AgentSpec; em vez disso usamos messages.create direto.
  // @ts-expect-error acesso interno controlado
  const client = bridge.client as import('@anthropic-ai/sdk').default;
  const resp = await client.messages.create({
    model: modelName,
    max_tokens: 800,
    system: EVAL_SYSTEM,
    messages: [{ role: 'user', content: 'Resposta a avaliar:\n\n' + response }],
  });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
  const parsed = parseJsonLenient(text) as Partial<ScoringResult>;
  return {
    marcas_citadas: Array.isArray(parsed.marcas_citadas) ? parsed.marcas_citadas : [],
    posicao_contabilizei: typeof parsed.posicao_contabilizei === 'number' ? parsed.posicao_contabilizei : null,
    sentimento_contabilizei: (parsed.sentimento_contabilizei as ScoringResult['sentimento_contabilizei']) ?? 'na',
    recomendacao_explicita: !!parsed.recomendacao_explicita,
    argumento_recomendacao: typeof parsed.argumento_recomendacao === 'string' ? parsed.argumento_recomendacao : '',
  };
}

export interface AggregateMetrics {
  total_prompts: number;
  share_of_voice: number;          // % das respostas em que Contabilizei é citada
  recommendation_rate: number;     // % com recomendação explícita
  avg_position: number | null;     // posição média quando citada
  sentiment_score: number;         // média ponderada
  gap_vs_agilize: number;          // SoV(ctbz) - SoV(agilize) em pp
}

interface ScoringSummary {
  scoring: ScoringResult;
}

export function aggregate(rows: ScoringSummary[]): AggregateMetrics {
  const total = rows.length;
  if (total === 0) {
    return { total_prompts: 0, share_of_voice: 0, recommendation_rate: 0, avg_position: null, sentiment_score: 0, gap_vs_agilize: 0 };
  }
  const citadas = rows.filter((r) => r.scoring.marcas_citadas.includes('Contabilizei'));
  const rec = rows.filter((r) => r.scoring.recomendacao_explicita);
  const positions = rows.map((r) => r.scoring.posicao_contabilizei).filter((p): p is number => typeof p === 'number');
  const avgPos = positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
  const sentimentMap: Record<string, number> = { positivo: 1, neutro: 0, negativo: -1, na: 0 };
  const sentSum = rows.reduce((a, r) => a + (sentimentMap[r.scoring.sentimento_contabilizei] ?? 0), 0);
  const agilizeShare = rows.filter((r) => r.scoring.marcas_citadas.includes('Agilize')).length / total;
  return {
    total_prompts: total,
    share_of_voice: citadas.length / total,
    recommendation_rate: rec.length / total,
    avg_position: avgPos,
    sentiment_score: sentSum / total,
    gap_vs_agilize: citadas.length / total - agilizeShare,
  };
}
