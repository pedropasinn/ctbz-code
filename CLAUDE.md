# CLAUDE.md — `ctbz-code`

Repositório público com o código do `ctbz-code` — TUI + arquitetura
monorepo-like + Mentions Observatory.

## Regime

O code-base é **genérico e sanitizado**. Nenhuma marca, nome de empresa,
documento interno ou número bruto está hard-coded. Tudo que é específico
de uma instalação vem via **env** ou **arquivos locais** ignorados pelo
`.gitignore`.

Customização sensível mora em (não-versionados):

- `local_context/` e `*.local.md` — ignorados.
- `notes/`, `ctbz_tasks/*.json`, `ctbz_tasks/private_*.md` — ignorados.
- `~/.config/ctbz/*.md` (qualquer caminho fora do repo).

## Como customizar com contexto interno (sem comitar)

### Marca + concorrentes (Mentions Observatory)

```bash
export CTBZ_BRAND_PRIMARY="Acme"
export CTBZ_BRAND_COMPETITORS="Beta,Gamma,Delta"
# opcional: prompts customizados em JSON externo
export CTBZ_OBSERVATORY_PROMPTS_FILE="$HOME/.config/ctbz/prompts.json"
```

O JSON tem shape `[{ "id": "...", "category": "...", "text": "..." }]`,
e o `text` pode usar placeholders `{{brand}}` e `{{competitor}}`
substituídos em runtime.

### Briefing agent — contexto extra

```bash
export CTBZ_BRIEFING_CONTEXT_FILE=$HOME/.config/ctbz/briefing_local.md
export CTBZ_CONFIDENCIAL_DIR=$HOME/internal_docs
export CTBZ_CONFIDENCIAL_FILES=relatorioA.json,relatorioB.json
```

Esse `.md` local descreve qual a área, quais documentos, qual o foco —
nada disso vai pro git.

## Convenções de código

- Edits cross-platform (Linux/Windows/macOS). `node:path` joins, sem `/`
  literais; `fileURLToPath` em ESM.
- Tools que tocam filesystem devem rejeitar paths fora do sandbox.
- Allow-lists em todas as tools que tocam rede ou shell.
- Cada PR deve ter smoke verde (`npm run smoke`) — o CI roda em
  Linux/macOS/Windows × Node 18/20/22, e ainda um pack-roundtrip que
  instala o tarball publicável e roda `ctbz-code state`.
- Não comite logs, dumps de SQLite, ou outputs do Observatory.
- Não comite system prompts com nomes próprios — use `CTBZ_*` envs ou
  arquivos locais.
