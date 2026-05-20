export type ToolHandler = (args: Record<string, unknown>) => Promise<string> | string;

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: ToolHandler;
}

export interface AgentSpec {
  name: string;
  description: string;
  system_prompt: string;
  tools: readonly string[];
  model_name?: string;
}

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool_use_id: string; tool_name: string; tool_input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; tool_name: string; tool_result: string; tool_ok: boolean; elapsed_ms: number }
  | { type: 'error'; error: string }
  | { type: 'done' };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | unknown[];
}
