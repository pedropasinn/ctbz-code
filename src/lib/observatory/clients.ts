// Clientes para os LLMs do observatory. Cada um expõe `ask(prompt) → text`.
// Erros são re-thrown como Error com prefixo do client (ex: "[gemini] ...").

import { AgentBridge } from '../native/anthropic_bridge.js';

export type LlmClientId = 'claude' | 'openai' | 'gemini' | 'perplexity';

export interface LlmClient {
  id: LlmClientId;
  label: string;
  model: string;
  ask(prompt: string): Promise<string>;
}

class ClaudeClient implements LlmClient {
  readonly id = 'claude';
  readonly label = 'Claude Sonnet';
  readonly model = process.env.CTBZ_CLAUDE_MODEL || 'claude-sonnet-4-6';
  private bridge: AgentBridge;
  constructor() {
    this.bridge = AgentBridge.fromEnv(this.model);
  }
  async ask(prompt: string): Promise<string> {
    const client = this.bridge.getClient();
    const resp = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    return resp.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
  }
}

class OpenAiClient implements LlmClient {
  readonly id = 'openai';
  readonly label = 'OpenAI GPT';
  readonly model = process.env.CTBZ_OPENAI_MODEL || 'gpt-4o';
  private apiKey: string;
  constructor() {
    const k = process.env.OPENAI_API_KEY;
    if (!k) throw new Error('OPENAI_API_KEY não definida');
    this.apiKey = k;
  }
  async ask(prompt: string): Promise<string> {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
      }),
    });
    if (!resp.ok) throw new Error(`[openai] HTTP ${resp.status}: ${await resp.text()}`);
    const j = await resp.json() as { choices: Array<{ message: { content: string } }> };
    return j.choices?.[0]?.message?.content ?? '';
  }
}

class GeminiClient implements LlmClient {
  readonly id = 'gemini';
  readonly label = 'Gemini';
  readonly model = process.env.CTBZ_GEMINI_MODEL || 'gemini-2.5-pro';
  private apiKey: string;
  constructor() {
    const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!k) throw new Error('GEMINI_API_KEY/GOOGLE_API_KEY não definida');
    this.apiKey = k;
  }
  async ask(prompt: string): Promise<string> {
    // API key vai no header — não na query string — pra não vazar em logs/proxies.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!resp.ok) throw new Error(`[gemini] HTTP ${resp.status}: ${await resp.text()}`);
    const j = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  }
}

class PerplexityClient implements LlmClient {
  readonly id = 'perplexity';
  readonly label = 'Perplexity Sonar';
  readonly model = process.env.CTBZ_PERPLEXITY_MODEL || 'sonar';
  private apiKey: string;
  constructor() {
    const k = process.env.PERPLEXITY_API_KEY;
    if (!k) throw new Error('PERPLEXITY_API_KEY não definida');
    this.apiKey = k;
  }
  async ask(prompt: string): Promise<string> {
    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!resp.ok) throw new Error(`[perplexity] HTTP ${resp.status}: ${await resp.text()}`);
    const j = await resp.json() as { choices: Array<{ message: { content: string } }> };
    return j.choices?.[0]?.message?.content ?? '';
  }
}

export function createAvailableClients(): LlmClient[] {
  const out: LlmClient[] = [];
  try { out.push(new ClaudeClient()); } catch { /* */ }
  try { out.push(new OpenAiClient()); } catch { /* */ }
  try { out.push(new GeminiClient()); } catch { /* */ }
  try { out.push(new PerplexityClient()); } catch { /* */ }
  return out;
}
