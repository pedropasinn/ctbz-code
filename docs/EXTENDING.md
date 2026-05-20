# Estendendo o ctbz-code com contexto interno

O ctbz-code é genérico no que entra no git. Tudo que é específico do seu
caso de uso (áreas, líderes, documentos canônicos) carrega via env ou
arquivo local **não-versionado**.

## 1. Briefing com contexto interno

O agente `briefing` carrega o system prompt base + um trecho extra opcional.

### Via env var (inline)

```bash
export CTBZ_BRIEFING_CONTEXT="
CONTEXTO ADICIONAL
- Trilhas internas: A, B, C (líderes: …).
- Documentos canônicos: relatorio-2026-Q1.json (versão atual), relatorio-2026-Q2.json (anterior).
- Foco padrão: a trilha mais ativa no trimestre.
"
```

### Via arquivo (recomendado)

```bash
mkdir -p ~/.config/ctbz
cat > ~/.config/ctbz/briefing_local.md <<'EOF'
CONTEXTO ADICIONAL
- Trilhas internas: ...
- Documentos canônicos: ...
- Foco padrão: ...
EOF
export CTBZ_BRIEFING_CONTEXT_FILE=$HOME/.config/ctbz/briefing_local.md
```

Esse `.md` **não vai pro git** — `.gitignore` cobre `local_context/` e
`*.local.md`, e qualquer path fora do repo.

## 2. Allow-list do `read_confidencial`

A tool é genérica por default: allow-list vazia = nada lido. Defina:

```bash
export CTBZ_CONFIDENCIAL_DIR=$HOME/internal_docs
export CTBZ_CONFIDENCIAL_FILES=relatorioA.json,relatorioB.json,pesquisa-2026.json
```

A tool só lê os basenames listados, dentro de `CTBZ_CONFIDENCIAL_DIR`.

## 3. Novos agentes

Crie `src/lib/agents/<nome>.ts`:

```ts
import { AgentSpec } from './types.js';
import { registerAgent } from './registry.js';

const SPEC: AgentSpec = {
  name: 'meu-agente',
  description: '…',
  system_prompt: '…',
  tools: ['read_confidencial', 'read_file'],
  model_name: 'claude-opus-4-7',
};

registerAgent(SPEC);
```

Importe em `src/lib/agents/index.ts`:

```ts
import './meu-agente.js';
```

`npm run build && npm link` (ou só `npm run dev`) e o agente já aparece em
`/agents` na TUI.

## 4. Channels customizados (Discord, Slack, webhook)

Implemente a interface `Channel` em `src/lib/queue/channels.ts`:

```ts
import { Channel, QueueEvent } from './channels.js';

export class DiscordWebhookChannel implements Channel {
  readonly name = 'discord';
  constructor(private webhookUrl: string) {}
  async emit(ev: QueueEvent): Promise<void> {
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: `[${ev.kind}] ${JSON.stringify(ev.payload).slice(0, 1500)}` }),
    });
  }
}
```

E use ao montar o Multiplexer:

```ts
const mp = new Multiplexer([
  defaultFileChannelFor(queueName),
  new DiscordWebhookChannel(process.env.CTBZ_DISCORD_WEBHOOK!),
]);
```

## 5. Tools customizadas

`src/lib/tools/<nome>.ts` exportando `ToolSpec` + handler. Registre em
`TOOL_FACTORIES` em `src/lib/tools/index.ts`.

Sandboxing obrigatório se a tool toca filesystem ou rede:
- file paths via `safeJoin(root, candidate)` do `paths.ts`
- HTTP via allow-list de domínios
- Shell via allow-list de bins, sem shell, com timeout duro.
