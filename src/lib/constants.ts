// Constantes centrais. Mantenha uma única fonte de verdade.

// Modelo default usado por agentes e clients quando nenhum override é dado.
// Pode ser sobrescrito por agente (AgentSpec.model_name) ou na chamada.
export const DEFAULT_MODEL = process.env.CTBZ_DEFAULT_MODEL || 'claude-opus-4-7';

// Limite de turns mantidos em history pra evitar inflação de contexto.
// Um "turn" = uma mensagem user + uma assistant. Truncagem fica nas mais
// recentes 2*MAX_HISTORY_TURNS mensagens.
export const MAX_HISTORY_TURNS = Number(process.env.CTBZ_MAX_HISTORY_TURNS) || 20;
