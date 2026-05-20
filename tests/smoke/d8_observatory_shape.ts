// Smoke não-rede: valida prompts (20 itens, 5 categorias), scoring schema,
// aggregate idempotente, formatObservatoryReport produz markdown.

import { PROMPTS } from '../../src/lib/observatory/prompts.js';
import { aggregate } from '../../src/lib/observatory/scoring.js';
import { formatObservatoryReport } from '../../src/lib/observatory/runner.js';

const errs: string[] = [];

if (PROMPTS.length !== 20) errs.push(`esperava 20 prompts, got ${PROMPTS.length}`);
const cats = new Set(PROMPTS.map((p) => p.category));
if (cats.size !== 5) errs.push(`esperava 5 categorias, got ${cats.size}: ${[...cats].join(',')}`);
const ids = new Set(PROMPTS.map((p) => p.id));
if (ids.size !== PROMPTS.length) errs.push('ids duplicados em PROMPTS');

const agg = aggregate([
  { scoring: { marcas_citadas: ['Contabilizei', 'Agilize'], posicao_contabilizei: 1, sentimento_contabilizei: 'positivo', recomendacao_explicita: true, argumento_recomendacao: '' } },
  { scoring: { marcas_citadas: ['Agilize'], posicao_contabilizei: null, sentimento_contabilizei: 'na', recomendacao_explicita: false, argumento_recomendacao: '' } },
]);
if (agg.total_prompts !== 2) errs.push('aggregate total errado');
if (Math.abs(agg.share_of_voice - 0.5) > 1e-6) errs.push(`SoV esperado 0.5, got ${agg.share_of_voice}`);
if (Math.abs(agg.recommendation_rate - 0.5) > 1e-6) errs.push(`RR esperado 0.5, got ${agg.recommendation_rate}`);
if (Math.abs(agg.gap_vs_agilize - (0.5 - 1.0)) > 1e-6) errs.push(`gap_vs_agilize errado, got ${agg.gap_vs_agilize}`);

const rep = formatObservatoryReport({ date: '2026-05-20', totalCalls: 2, byClient: { claude: { calls: 2, errors: 0, metrics: agg } } });
if (!rep.includes('Mentions Observatory')) errs.push('report sem header');
if (!rep.includes('Share of Voice')) errs.push('report sem SoV');

if (errs.length) {
  console.error('FAIL:\n  - ' + errs.join('\n  - '));
  process.exit(1);
}
console.log('ok d8_observatory_shape');
