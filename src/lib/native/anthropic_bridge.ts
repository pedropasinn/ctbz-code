import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { AgentEvent, AgentSpec, ChatMessage, ToolSpec } from '../agents/types.js';

export const MAX_TOOL_ITERATIONS = 8;
const MAX_TOKENS = 4096;

interface BridgeOptions {
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
  modelName?: string;
}

export class AgentBridge {
  private client: Anthropic;
  private tools = new Map<string, ToolSpec>();
  readonly modelName: string;

  constructor(client: Anthropic, modelName: string) {
    this.client = client;
    this.modelName = modelName;
  }

  static fromEnv(modelName = 'claude-opus-4-7'): AgentBridge {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;

    if (apiKey) {
      return new AgentBridge(new Anthropic({ apiKey }), modelName);
    }
    if (authToken) {
      return new AgentBridge(
        new Anthropic({
          authToken,
          defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
        }),
        modelName,
      );
    }
    // OAuth fallback via ~/.claude/.credentials.json (mesmo shape do Claude Code CLI)
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (fs.existsSync(credPath)) {
      try {
        const j = JSON.parse(fs.readFileSync(credPath, 'utf8'));
        const tok: string | undefined = j?.claudeAiOauth?.accessToken;
        if (tok) {
          return new AgentBridge(
            new Anthropic({
              authToken: tok,
              defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
            }),
            modelName,
          );
        }
      } catch {
        // ignora — cai no erro abaixo
      }
    }
    throw new Error(
      'Sem ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN e sem OAuth em ~/.claude/.credentials.json',
    );
  }

  registerTool(spec: ToolSpec): void {
    this.tools.set(spec.name, spec);
  }

  registeredToolNames(): string[] {
    return [...this.tools.keys()];
  }

  async *stream(
    spec: AgentSpec,
    userInput: string,
    history: ChatMessage[] = [],
  ): AsyncGenerator<AgentEvent, void, void> {
    const messages: ChatMessage[] = [...history, { role: 'user', content: userInput }];
    const toolDefs = spec.tools
      .map((n) => this.tools.get(n))
      .filter((t): t is ToolSpec => !!t)
      .map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema,
      }));

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      let response: Anthropic.Messages.Message;
      try {
        const stream = this.client.messages.stream({
          model: this.modelName,
          max_tokens: MAX_TOKENS,
          system: spec.system_prompt,
          tools: toolDefs.length ? toolDefs : undefined,
          messages: messages as Anthropic.Messages.MessageParam[],
        });

        for await (const ev of stream) {
          if (
            ev.type === 'content_block_delta' &&
            ev.delta.type === 'text_delta' &&
            ev.delta.text
          ) {
            yield { type: 'text', text: ev.delta.text };
          }
        }
        response = await stream.finalMessage();
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        let msg = raw;
        if (raw.includes('429') || raw.includes('rate_limit')) {
          msg = `rate_limit no modelo ${this.modelName}. Tente /model claude-sonnet-4-6 ou /model claude-haiku-4-5-20251001 (mais baratos e com cota maior).`;
        } else if (raw.includes('401') || raw.includes('authentication')) {
          msg = `auth falhou — verifique ANTHROPIC_API_KEY ou ~/.claude/.credentials.json. (${raw})`;
        } else if (raw.includes('overloaded')) {
          msg = `Anthropic overloaded (modelo ${this.modelName}). Retry em alguns segundos ou troque de /model.`;
        }
        yield { type: 'error', error: msg };
        return;
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUses.length === 0) {
        yield { type: 'done' };
        return;
      }

      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const block of toolUses) {
        const tool = this.tools.get(block.name);
        const input = (block.input as Record<string, unknown>) ?? {};
        yield {
          type: 'tool_use',
          tool_use_id: block.id,
          tool_name: block.name,
          tool_input: input,
        };

        const t0 = Date.now();
        let output = '';
        let ok = true;
        if (!tool) {
          output = `tool ${block.name} não registrada`;
          ok = false;
        } else {
          try {
            const raw = await tool.handler(input);
            output = typeof raw === 'string' ? raw : JSON.stringify(raw);
          } catch (e: unknown) {
            ok = false;
            output = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
          }
        }
        const elapsed = Date.now() - t0;
        yield {
          type: 'tool_result',
          tool_use_id: block.id,
          tool_name: block.name,
          tool_result: output,
          tool_ok: ok,
          elapsed_ms: elapsed,
        };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: output,
          is_error: !ok,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    yield { type: 'error', error: `MAX_TOOL_ITERATIONS (${MAX_TOOL_ITERATIONS}) excedido` };
  }
}
