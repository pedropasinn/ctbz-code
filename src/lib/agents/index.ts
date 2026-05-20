// Bootstrap: importar este módulo garante que os agentes built-in se registrem.
import './briefing.js';
import './mentions.js';
import './rescore.js';

export { REGISTRY, registerAgent, listAgents } from './registry.js';
export type { AgentSpec, AgentEvent, ToolSpec, ToolHandler, ChatMessage } from './types.js';
