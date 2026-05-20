// 20 prompts curados (5 categorias × 4) para o Mentions Observatory.
// Cada prompt tem id estável pra agrupar runs ao longo do tempo.

export interface ObservatoryPrompt {
  id: string;
  category: 'aquisicao' | 'comparativo' | 'medicina' | 'pme' | 'estrategico';
  text: string;
}

export const PROMPTS: ObservatoryPrompt[] = [
  // aquisição direta
  { id: 'aq-01', category: 'aquisicao', text: 'Qual a melhor contabilidade online para autônomo no Brasil em 2026?' },
  { id: 'aq-02', category: 'aquisicao', text: 'Vale a pena Contabilizei vs Agilize?' },
  { id: 'aq-03', category: 'aquisicao', text: 'Quanto custa abrir CNPJ online em 2026?' },
  { id: 'aq-04', category: 'aquisicao', text: 'Contabilidade digital para dev PJ — qual indica?' },
  // comparativos
  { id: 'cp-01', category: 'comparativo', text: 'Contabilizei vs Contador Direto: qual escolher?' },
  { id: 'cp-02', category: 'comparativo', text: 'Easy Conta é confiável? Compara com Contabilizei.' },
  { id: 'cp-03', category: 'comparativo', text: 'Diferença entre Contabilizei e contador tradicional.' },
  { id: 'cp-04', category: 'comparativo', text: 'Quem é o líder de contabilidade digital no Brasil hoje?' },
  // vertical Medicina
  { id: 'md-01', category: 'medicina', text: 'Contabilidade para médico recém-formado: qual contratar?' },
  { id: 'md-02', category: 'medicina', text: 'Como abrir PJ médico no Brasil em 2026?' },
  { id: 'md-03', category: 'medicina', text: 'Regime tributário ideal para médico autônomo.' },
  { id: 'md-04', category: 'medicina', text: 'Onde médicos recém-formados costumam abrir PJ?' },
  // vertical PMEs
  { id: 'pm-01', category: 'pme', text: 'Contabilidade para arquiteto autônomo.' },
  { id: 'pm-02', category: 'pme', text: 'Contabilidade para personal trainer PJ.' },
  { id: 'pm-03', category: 'pme', text: 'Contabilidade barata para MEI virando PJ.' },
  { id: 'pm-04', category: 'pme', text: 'Contabilidade para motoristas Uber/iFood.' },
  // estratégicas
  { id: 'st-01', category: 'estrategico', text: 'Como mudar de contabilidade online?' },
  { id: 'st-02', category: 'estrategico', text: 'Contador online cobra muito? Vale a pena?' },
  { id: 'st-03', category: 'estrategico', text: 'É seguro contabilidade 100% online?' },
  { id: 'st-04', category: 'estrategico', text: 'Onde vejo avaliações de contabilidades digitais?' },
];
