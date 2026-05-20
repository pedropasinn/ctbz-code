# CTBZ.code

> TUI + monorepo-like de orquestração de agentes IA para a Contabilizei.
> Roda no Linux, macOS e Windows.

`ctbz-code` é a CLI/TUI interna que junta:

1. **TUI** estilo Claude Code (Ink + React) com branding Contabilizei.
2. **Provedor nativo `ctbz`** — agentes próprios (Anthropic SDK + tool_use
   loop) com tools internas: `read_confidencial`, `read_file`, `http_get`,
   `shell_sandbox`.
3. **Provedores externos** — launcher para Claude Code, Gemini CLI, Codex,
   Antigravity em modo não-interativo, com chat unificado.
4. **Arquitetura de fila monorepo-like** — `ctbz_tasks/*.md` parseados como
   filas de tarefas; runner próprio dispatcha pra agentes, persiste em
   SQLite, dispara eventos via channels (NDJSON local, função, webhook).
5. **Mentions Observatory** — sonda Claude/OpenAI/Gemini/Perplexity em 20
   prompts curados, escora com Claude Opus, gera report Markdown semanal.

## Quickstart

```bash
git clone git@github.com:pedropasinn/ctbz-code.git
cd ctbz-code
./setup.sh                  # ou .\setup.ps1 no Windows
export ANTHROPIC_API_KEY=sk-ant-...
ctbz                        # abre a TUI
```

Pré-req: Node ≥18.

## Variáveis de ambiente

| Env                          | Default                              | Descrição |
|------------------------------|--------------------------------------|-----------|
| `CTBZ_HOME`                  | `~/.ctbz`                            | Estado/cache/canais |
| `CTBZ_WORK_DIR`              | `process.cwd()`                      | Sandbox de `read_file`/`shell_sandbox` |
| `CTBZ_CONFIDENCIAL_DIR`      | pasta-pai do projeto                 | Onde `read_confidencial` busca |
| `CTBZ_CONFIDENCIAL_FILES`    | (vazio = rejeita tudo)               | Lista comma-sep de basenames permitidos |
| `CTBZ_TASKS_DIR`             | `WORK_DIR/ctbz_tasks`                | Filas estilo monorepo |
| `CTBZ_BRIEFING_CONTEXT`      | —                                    | Trecho inline pra estender o system prompt do `briefing` |
| `CTBZ_BRIEFING_CONTEXT_FILE` | —                                    | Caminho pra .md local com contexto extra |
| `CTBZ_HTTP_ALLOWLIST`        | docs.anthropic.com, platform.openai.com, ai.google.dev, docs.perplexity.ai, github.com, raw.githubusercontent.com, developer.mozilla.org | Domínios permitidos em `http_get` |
| `CTBZ_SHELL_ALLOWLIST`       | node,npm,npx,git,python,python3,pwd,echo | Executáveis permitidos em `shell_sandbox` |
| `ANTHROPIC_API_KEY`          | —                                    | Auth do bridge nativo |
| `ANTHROPIC_AUTH_TOKEN`       | —                                    | OAuth Bearer (header `oauth-2025-04-20`) |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `PERPLEXITY_API_KEY` | — | Para o Observatory |

Auth do bridge nativo (`AgentBridge.fromEnv()`) tenta nesta ordem:
1. `ANTHROPIC_API_KEY`
2. `ANTHROPIC_AUTH_TOKEN`
3. Fallback: `~/.claude/.credentials.json` → `claudeAiOauth.accessToken`

## Modos de uso

### TUI (default)

```bash
ctbz
```

Slash-commands:

```
/use <ctbz|claude|gemini|codex|agy>   troca o provedor ativo
/agent <name>                         troca o agente nativo (provider ctbz)
/agents                               lista agentes nativos
/model <id|reset>                     troca/reseta o modelo do agente atual
/models                               lista modelos sugeridos
/login <provedor>                     autentica num provedor externo
/providers                            lista provedores
/queue list                           lista filas conhecidas
/queue show <file>                    mostra items parseados
/queue run <file> [dry]               executa items pendentes
/mentions [dry]                       roda o Mentions Observatory
/state                                mostra paths/config
/clear                                limpa histórico
/help                                 esta ajuda
/exit                                 sair
```

### CLI headless

```bash
ctbz agent briefing -q "resumo dos relatórios"
ctbz queue show ctbz_tasks/exemplo.md
ctbz queue run ctbz_tasks/exemplo.md --max 2
ctbz queue list
ctbz observatory run --dry
ctbz observatory report
ctbz state
```

## Agentes built-in

| Nome      | Descrição | Tools |
|-----------|-----------|-------|
| `briefing`| Briefing executivo a partir dos arquivos da allow-list local. | `read_confidencial` |
| `mentions`| Analisa report semanal do Observatory; propõe ações de AEO. | `read_file`, `shell_sandbox` |
| `rescore` | Reescora itens classificados; identifica falsos-positivos. | `read_confidencial`, `read_file` |

Para customizar `briefing` com contexto interno sem comitar, veja
`docs/EXTENDING.md`.

## Tools built-in

| Tool | O que faz | Sandboxing |
|------|-----------|-----------|
| `read_confidencial` | Leitura controlada na allow-list `CTBZ_CONFIDENCIAL_FILES` dentro de `CONFIDENCIAL_DIR`. | Allow-list literal + path-traversal block + truncamento. |
| `read_file`          | Lê arquivo de texto em `WORK_DIR`. | Path-traversal block + recusa qualquer path em `CONFIDENCIAL_DIR`. |
| `http_get`           | GET HTTP(S) restrito por allow-list de domínios. | Bloqueia IP literal, IPv6 literal, redirects fora da allow-list. |
| `shell_sandbox`      | Exec de bin da allow-list, sem shell, sob `WORK_DIR`. | Allow-list + args não tocam Confidencial + timeout 30s. |

## Filas monorepo-like

Formato `ctbz_tasks/<nome>.md`:

```markdown
# Título da fila

- [ ] descrição do item (agent=briefing model=claude-sonnet-4-6 verify="echo ok")
- [x] item já feito
- [!] item que falhou
- [~] item em progresso
```

Anotações entre parens no fim: `agent=`, `model=`, `verify="…"`.

O runner:
1. Parseia o `.md`, sincroniza no SQLite (`task_files` + `task_items`).
2. Para cada item pendente: chama agente nativo, stream de texto + tool
   events, executa `verify` em shell se houver.
3. Persiste `task_runs` (start/end, exit codes, stdout/stderr tails).
4. Flip do checkbox no arquivo (`[ ]` → `[~]` → `[x]` ou `[!]`).
5. Emite eventos via Multiplexer de channels (NDJSON local, callback,
   webhook customizado — veja `docs/EXTENDING.md`).

## Mentions Observatory

```bash
ctbz observatory run            # roda 20 prompts × N LLMs
ctbz observatory run --dry      # só 2 prompts × N LLMs
ctbz observatory report         # lista runs por data
```

20 prompts curados × até 4 LLMs (conforme keys disponíveis) → scoring com
Claude Opus extraindo marcas citadas, posição Contabilizei, sentimento,
recomendação. Métricas: Share-of-Voice, Recommendation Rate, Avg Position,
Sentiment Score, Gap vs principal concorrente. Report Markdown em
`site_observatory/<yyyy-ww>.md`.

## Estado em SQLite

`~/.ctbz/state.db` (ou `$CTBZ_HOME/state.db`). Schema:

- `sessions`, `messages`, `tool_calls` — conversas da TUI.
- `mentions_runs` — runs do Observatory (raw + scoring JSON).
- `task_files`, `task_items`, `task_runs` — filas monorepo-like.

WAL + foreign keys on. Cross-platform via better-sqlite3 com prebuilds.

## Smokes

```bash
npm run smoke
```

Roda `tests/smoke/d4_*`, `d5_*`, `d6_*`, `d8_*`, `d12_*` em processos
separados.

## Cross-platform

- Paths via `node:path`; `fileURLToPath` em ESM (Windows-safe).
- `shell_sandbox` allow-list cobre bins disponíveis em ambas plataformas.
- `better-sqlite3` v11 com prebuilds Linux x64, macOS, Windows x64.
- `verify` de fila roda via `spawn(cmd, {shell: true})` — usa shell default
  do SO. Prefira `node -e "…"` no verify para portabilidade.

## Limitações

- TUI nativa de outras CLIs não roda dentro do ctbz-code (duas TUIs brigam).
- Slash-commands de CLIs filhas não são expostos — use a CLI nativa direto.
- Parser de anotações não aceita parens aninhadas em `verify="…"` — use `&&`.

## Roadmap

- **Fase 2**: widget React embedável na plataforma CTBZ+.
- **Fase 3**: agentes viram MCP servers; consumidos por Claude Code/Cursor/widget.
- **Fase 4**: SDK público para parceiros plugarem agentes próprios.
