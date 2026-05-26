import fs from 'node:fs';
import { AgentSpec } from './types.js';
import { registerAgent } from './registry.js';
import { DEFAULT_MODEL } from '../constants.js';

// Briefing agent — genérico. Para customizar o contexto (áreas, líderes,
// documentos canônicos), exporte CTBZ_BRIEFING_CONTEXT com um trecho de
// system prompt extra, ou aponte CTBZ_BRIEFING_CONTEXT_FILE para um .md
// local. Veja docs/EXTENDING.md.
function loadExtraContext(): string {
  const inline = process.env.CTBZ_BRIEFING_CONTEXT;
  if (inline && inline.trim()) return '\n\n' + inline.trim();
  const file = process.env.CTBZ_BRIEFING_CONTEXT_FILE;
  if (file) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      if (text.trim()) return '\n\n' + text.trim();
    } catch {
      // arquivo opcional — silencia
    }
  }
  return '';
}

const BASE_PROMPT = `Você é o agente \`briefing\`. Produz briefings executivos curtos
(Markdown) a partir de documentos disponíveis via tool \`read_confidencial\`.

FERRAMENTAS
- \`read_confidencial(file, max_chars?)\` — lê um arquivo da allow-list
  local (controlada por env CTBZ_CONFIDENCIAL_FILES).

ESTRUTURA DA RESPOSTA (Markdown, sem cabeçalhos extras):

## Sinais críticos
- 3 a 5 bullets, cada um com a evidência (arquivo + seção/página) + 1 frase.

## Variações relevantes
- 2 a 4 bullets sobre o que mudou entre versões/períodos, se aplicável.

## Próxima ação recomendada
- 1 a 2 ações concretas e datadas, derivadas dos sinais acima.

REGRAS DE CONFIDENCIALIDADE
- NÃO incluir nomes pessoais de clientes/usuários nem documentos pessoais.
- Agregar números brutos em ranges/percentuais quando o material for
  granular demais.
- Saídas são restritas ao consumidor interno; NÃO produza versões pensadas
  para publicação externa.

ESTILO
- Direto, sem floreios. Cada bullet < 25 palavras.
- Cite a fonte ao final do bullet entre parênteses, ex: \`(relatorio.json §3)\`.
- Em caso de dúvida sobre o foco, escreva o briefing geral e pergunte ao
  usuário ao fim, em uma linha, qual ponto aprofundar.`;

const SYSTEM_PROMPT = BASE_PROMPT + loadExtraContext();

export const briefingSpec: AgentSpec = {
  name: 'briefing',
  description: 'Briefing executivo a partir dos arquivos da allow-list local.',
  system_prompt: SYSTEM_PROMPT,
  tools: ['read_confidencial'],
  model_name: DEFAULT_MODEL,
};

registerAgent(briefingSpec);
