# CLAUDE.md — `ctbz-code` (repo público interno)

Repositório privado da Contabilizei contendo o código do `ctbz-code` —
TUI + arquitetura monorepo-like + Mentions Observatory.

## Regime

- Este repo é privado. **Não publicar dados internos** (JSONs de pesquisa,
  decks estratégicos, números brutos, nomes de clientes/funcionários) no
  code-base, em commits ou em issues. Use env vars + arquivos locais
  ignorados pelo `.gitignore`.
- `local_context/` e `*.local.md` são ignorados — coloque aí qualquer
  customização que precise carregar contexto sensível.
- `notes/`, `ctbz_tasks/*.json` e `ctbz_tasks/private_*.md` também são
  ignorados.

## Como customizar agentes com contexto interno (sem comitar)

O `briefing` agente carrega contexto extra de:

- `CTBZ_BRIEFING_CONTEXT` (env, string inline) ou
- `CTBZ_BRIEFING_CONTEXT_FILE` (env, caminho pra .md local).

Exemplo no `~/.bashrc` do seu PC pessoal:

```bash
export CTBZ_BRIEFING_CONTEXT_FILE=$HOME/.config/ctbz/briefing_local.md
export CTBZ_CONFIDENCIAL_DIR=$HOME/internal_docs
export CTBZ_CONFIDENCIAL_FILES=relatorioA.json,relatorioB.json
```

Esse `.md` local descreve qual a área, quais documentos, qual o foco —
nada disso vai pro git.

## Convenções de código

- Edits cross-platform (Linux/Windows). `node:path` joins, sem `/` literais.
- Tools que tocam filesystem devem rejeitar paths fora do sandbox.
- Cada PR deve ter smoke verde (`npm run smoke`).
- Não comite logs, dumps de SQLite, ou outputs do Observatory.
