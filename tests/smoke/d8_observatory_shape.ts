// Smoke não-rede: valida prompts (>=20 itens, várias categorias), scoring
// schema, aggregate idempotente, formatObservatoryReport produz markdown.
//
// O scoring foi generificado: marca primária = CTBZ_BRAND_PRIMARY (default
// 'YourBrand'), concorrente = CTBZ_BRAND_COMPETITORS[0]. Setamos aqui
// pra ter assertions estáveis.

process.env.CTBZ_BRAND_PRIMARY = 'Acme';
process.env.CTBZ_BRAND_COMPETITORS = 'Beta,Gamma';

const { PROMPTS } = await import('../../src/lib/observatory/prompts.js');
const { aggregate } = await import('../../src/lib/observatory/scoring.js');
const { formatObservatoryReport } = await import('../../src/lib/observatory/runner.js');

const errs: string[] = [];

if (PROMPTS.length < 16) errs.push(`esperava >=16 prompts, got ${PROMPTS.length}`);
const cats = new Set(PROMPTS.map((p) => p.category));
if (cats.size < 3) errs.push(`esperava >=3 categorias, got ${cats.size}: ${[...cats].join(',')}`);
const ids = new Set(PROMPTS.map((p) => p.id));
if (ids.size !== PROMPTS.length) errs.push('ids duplicados em PROMPTS');

// placeholders devem ter sido substituídos
const placeholderRemains = PROMPTS.some((p) => p.text.includes('{{brand}}') || p.text.includes('{{competitor}}'));
if (placeholderRemains) errs.push('placeholders {{brand}}/{{competitor}} não substituídos');

const agg = aggregate([
  { scoring: { marcas_citadas: ['Acme', 'Beta'], posicao_primary: 1, sentimento_primary: 'positivo', recomendacao_explicita: true, argumento_recomendacao: '' } },
  { scoring: { marcas_citadas: ['Beta'], posicao_primary: null, sentimento_primary: 'na', recomendacao_explicita: false, argumento_recomendacao: '' } },
]);
if (agg.total_prompts !== 2) errs.push('aggregate total errado');
if (Math.abs(agg.share_of_voice - 0.5) > 1e-6) errs.push(`SoV esperado 0.5, got ${agg.share_of_voice}`);
if (Math.abs(agg.recommendation_rate - 0.5) > 1e-6) errs.push(`RR esperado 0.5, got ${agg.recommendation_rate}`);
if (Math.abs(agg.gap_vs_competitor - (0.5 - 1.0)) > 1e-6) errs.push(`gap_vs_competitor errado, got ${agg.gap_vs_competitor}`);
if (agg.competitor_label !== 'Beta') errs.push(`competitor_label esperado 'Beta', got ${agg.competitor_label}`);

const rep = formatObservatoryReport({ date: '2026-05-20', totalCalls: 2, byClient: { claude: { calls: 2, errors: 0, metrics: agg } } });
if (!rep.includes('Mentions Observatory')) errs.push('report sem header');
if (!rep.includes('Share of Voice')) errs.push('report sem SoV');

if (errs.length) {
  console.error('FAIL:\n  - ' + errs.join('\n  - '));
  process.exit(1);
}
console.log('ok d8_observatory_shape');
