// Mapeia cada provedor para o jeito de invocá-lo.
// Dois tipos: 'spawn' (CLI externa em modo não-interativo) e 'native'
// (agente próprio com Anthropic SDK + tool_use loop).

export type ProviderId = 'ctbz' | 'claude' | 'gemini' | 'codex' | 'agy';

export interface SpawnProvider {
  kind: 'spawn';
  id: ProviderId;
  label: string;
  bin: string;
  buildArgs: (prompt: string) => string[];
  loginArgs: string[];
  parseChunk: (line: string) => string | null;
}

export interface NativeProvider {
  kind: 'native';
  id: ProviderId;
  label: string;
  // Agente default quando o usuário só digita texto sem `/agent <nome>` antes.
  defaultAgent: string;
}

export type Provider = SpawnProvider | NativeProvider;

export const providers: Record<ProviderId, Provider> = {
  ctbz: {
    kind: 'native',
    id: 'ctbz',
    label: 'ctbz● (interno)',
    defaultAgent: 'briefing',
  },

  claude: {
    kind: 'spawn',
    id: 'claude',
    label: 'Claude Code',
    bin: 'claude',
    buildArgs: (p) => ['-p', p, '--output-format', 'stream-json', '--bare'],
    loginArgs: ['login'],
    parseChunk: (line) => {
      try {
        const ev = JSON.parse(line);
        if (ev.type === 'assistant' && ev.message?.content) {
          return ev.message.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
            .join('');
        }
        return null;
      } catch {
        return null;
      }
    },
  },

  gemini: {
    kind: 'spawn',
    id: 'gemini',
    label: 'Gemini',
    bin: 'gemini',
    buildArgs: (p) => ['-p', p, '--output-format', 'json'],
    loginArgs: [],
    parseChunk: (line) => {
      try {
        const obj = JSON.parse(line);
        return obj.response ?? null;
      } catch {
        return null;
      }
    },
  },

  codex: {
    kind: 'spawn',
    id: 'codex',
    label: 'Codex',
    bin: 'codex',
    buildArgs: (p) => ['exec', '--json', p],
    loginArgs: ['login'],
    parseChunk: (line) => {
      try {
        const ev = JSON.parse(line);
        if (ev.type === 'agent_message' || ev.type === 'message') {
          return ev.message ?? ev.content ?? null;
        }
        return null;
      } catch {
        return null;
      }
    },
  },

  agy: {
    kind: 'spawn',
    id: 'agy',
    label: 'Antigravity (agy)',
    bin: 'agy',
    buildArgs: (p) => ['run', '--non-interactive', p],
    loginArgs: ['login'],
    parseChunk: (line) => line || null,
  },
};
