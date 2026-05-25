// Prompts default do Mentions Observatory — genéricos, em PT-BR. O usuário
// pode sobrescrever apontando CTBZ_OBSERVATORY_PROMPTS_FILE para um JSON
// com o mesmo shape ({ id, category, text }).
//
// Os defaults usam placeholders {{brand}} e {{competitor}} substituídos em
// runtime pelos valores configurados em CTBZ_BRAND_PRIMARY / CTBZ_BRAND_COMPETITORS.

import fs from 'node:fs';

export interface ObservatoryPrompt {
  id: string;
  category: string;
  text: string;
}

const DEFAULT_PROMPTS: ObservatoryPrompt[] = [
  // aquisição direta
  { id: 'aq-01', category: 'aquisicao', text: 'Qual a melhor opção do mercado de {{brand}} no Brasil em 2026?' },
  { id: 'aq-02', category: 'aquisicao', text: 'Vale a pena {{brand}} vs {{competitor}}?' },
  { id: 'aq-03', category: 'aquisicao', text: 'Quanto custa contratar uma solução como {{brand}} em 2026?' },
  { id: 'aq-04', category: 'aquisicao', text: 'Para um profissional autônomo: qual solução do tipo {{brand}} indicar?' },
  // comparativos
  { id: 'cp-01', category: 'comparativo', text: '{{brand}} vs {{competitor}}: qual escolher?' },
  { id: 'cp-02', category: 'comparativo', text: '{{competitor}} é confiável? Compara com {{brand}}.' },
  { id: 'cp-03', category: 'comparativo', text: 'Diferença entre {{brand}} e o concorrente tradicional do setor.' },
  { id: 'cp-04', category: 'comparativo', text: 'Quem é o líder desse mercado no Brasil hoje?' },
  // vertical 1
  { id: 'v1-01', category: 'vertical-a', text: 'Para um cliente do nicho A recém-iniciado: qual contratar?' },
  { id: 'v1-02', category: 'vertical-a', text: 'Como começar no nicho A no Brasil em 2026?' },
  { id: 'v1-03', category: 'vertical-a', text: 'Qual o regime ideal para clientes do nicho A?' },
  { id: 'v1-04', category: 'vertical-a', text: 'Onde clientes do nicho A costumam contratar este tipo de serviço?' },
  // vertical 2
  { id: 'v2-01', category: 'vertical-b', text: 'Atendimento para clientes do nicho B autônomos.' },
  { id: 'v2-02', category: 'vertical-b', text: 'Atendimento para clientes do nicho B em PJ.' },
  { id: 'v2-03', category: 'vertical-b', text: 'Opção barata para clientes em transição do nicho B.' },
  { id: 'v2-04', category: 'vertical-b', text: 'Para clientes em aplicativos do nicho B: qual solução?' },
  // estratégicas
  { id: 'st-01', category: 'estrategico', text: 'Como trocar do fornecedor atual deste tipo de serviço?' },
  { id: 'st-02', category: 'estrategico', text: 'Soluções como {{brand}} cobram caro? Vale a pena?' },
  { id: 'st-03', category: 'estrategico', text: 'É seguro contratar este tipo de serviço 100% online?' },
  { id: 'st-04', category: 'estrategico', text: 'Onde vejo avaliações de empresas como {{brand}}?' },
];

function applyPlaceholders(prompts: ObservatoryPrompt[]): ObservatoryPrompt[] {
  const brand = process.env.CTBZ_BRAND_PRIMARY || 'YourBrand';
  const competitor = (process.env.CTBZ_BRAND_COMPETITORS || '').split(',')[0]?.trim() || 'CompetitorBrand';
  return prompts.map((p) => ({
    ...p,
    text: p.text.replace(/\{\{brand\}\}/g, brand).replace(/\{\{competitor\}\}/g, competitor),
  }));
}

function loadFromFile(): ObservatoryPrompt[] | null {
  const fp = process.env.CTBZ_OBSERVATORY_PROMPTS_FILE;
  if (!fp) return null;
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((p): p is ObservatoryPrompt => p && typeof p.id === 'string' && typeof p.text === 'string')
      .map((p) => ({ id: p.id, category: p.category ?? 'custom', text: p.text }));
  } catch {
    return null;
  }
}

export const PROMPTS: ObservatoryPrompt[] = applyPlaceholders(loadFromFile() ?? DEFAULT_PROMPTS);
