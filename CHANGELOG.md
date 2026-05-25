# Changelog

Padrão [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versionamento
[SemVer](https://semver.org/lang/pt-BR/).

## [0.2.0] — 2026-05-25

### Security

- **`http_get`**: tudo permanece como na 0.1.0 (allow-list + IP literal block).
- **Gemini API key**: agora enviada no header `x-goog-api-key` em vez de
  query string (`?key=...`), eliminando vazamento via logs/proxies/CDN.
- **`runVerify` da fila**: por default executa via `shell_sandbox` (allow-list
  de binários, sem expansão de shell). Pipes/`&&` requerem opt-in explícito
  via `CTBZ_QUEUE_VERIFY_SHELL=1` — proteção contra `verify="rm -rf …"`
  em PRs maliciosos.
- **Pack manifest**: `package.json` agora declara `"files"` + `.npmignore`
  defensivo. `npm pack` não inclui `src/`, `tests/`, `local_context/`,
  `notes/`, `*.db`, `*.env`, `CLAUDE.md`.

### Changed (breaking-ish)

- **Sanitização do repo**: prompts default do Observatory, lista de marcas
  e system prompts são genéricos. Configuração de marca vem de:
  - `CTBZ_BRAND_PRIMARY` (default `YourBrand`)
  - `CTBZ_BRAND_COMPETITORS` (comma-sep)
  - `CTBZ_OBSERVATORY_PROMPTS_FILE` (JSON externo opcional com prompts
    customizados; suporta placeholders `{{brand}}` / `{{competitor}}`)
- **`ScoringResult`**: campos `posicao_contabilizei` → `posicao_primary`,
  `sentimento_contabilizei` → `sentimento_primary`.
- **`AggregateMetrics`**: campo `gap_vs_agilize` → `gap_vs_competitor`;
  adicionado `competitor_label` (string ou null).

### Fixed

- **ESM build**: `briefing.ts` usava `require('node:fs')` que quebrava no
  build compilado (`dist/`). Agora usa `import fs` no topo.
- **Encapsulamento**: `AgentBridge.getClient()` é público; removidos
  todos os `@ts-expect-error` que acessavam `bridge.client` privado.
- **handleSubmit (TUI)**: erros assíncronos eram engolidos; agora viram
  mensagens de sistema na tela.
- **index.tsx**: detecção de execução direta via `fileURLToPath` em vez
  de heurística com `endsWith`.
- **Cancel real**: trocar de agente / `Ctrl+C` durante chamada agora
  aborta a request HTTP via `AbortSignal` em vez de só ignorar chunks.

### Added

- **Persistência de sessão (TUI)**: o schema `sessions`/`messages` já
  existia mas estava morto; mensagens user/assistant agora gravam em
  `~/.ctbz/state.db`.
- **History cap**: `MAX_HISTORY_TURNS` (default 20, configurável via
  `CTBZ_MAX_HISTORY_TURNS`) limita o histórico enviado ao LLM —
  conversas longas pararam de inflar o context window.
- **Observatory rate-limiting**: `CTBZ_OBSERVATORY_DELAY_MS` (default 500ms)
  entre chamadas + retry exponencial (até 3x) em 429/overloaded/5xx.
- **Bridge reuse no Observatory**: era 1 `AgentBridge` criado por scoring;
  agora 1 bridge serve todas as 80 chamadas típicas (20 prompts × 4 LLMs).
- **`DEFAULT_MODEL`**: constante única em `src/lib/constants.ts`,
  sobrescrevível via `CTBZ_DEFAULT_MODEL`.
- **CI**: workflow GitHub Actions roda build + smoke + pack-roundtrip em
  Linux/macOS/Windows. O pack-roundtrip pega bugs do build compilado
  (como o `require()` que escapou em 0.1.0).

## [0.1.0] — 2026-05-20

Release inicial. TUI + monorepo-like queue + Mentions Observatory.
