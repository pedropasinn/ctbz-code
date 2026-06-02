# Instalar o `ctbz-code` (Linux do trabalho, via git clone)

Repo público: `github.com/pedropasinn/ctbz-code`. Pré-requisito: **Node ≥ 18** e
**git**.

## 1. Clone + setup (uma vez)

```bash
git clone https://github.com/pedropasinn/ctbz-code.git
cd ctbz-code
./setup.sh
```

O `setup.sh` checa o Node, roda `npm install`, builda (`npm run build`) e tenta
um `npm link` global (deixa `ctbz` no PATH). Confira:

```bash
ctbz state                # paths/config (ou: npm start -- state)
npm run smoke             # 8 smokes — devem ficar verdes
```

Se o `npm link` falhar por permissão global, use `npm start -- <args>` ou
`node bin/ctbz-code.js <args>`.

## 2. Autenticação

O bridge nativo precisa de **uma** destas (ordem de precedência):

1. `export ANTHROPIC_API_KEY=sk-ant-...` (console.anthropic.com)
2. `export ANTHROPIC_AUTH_TOKEN=<bearer>`
3. `~/.claude/.credentials.json` do Claude Code CLI já logado (basta `claude`
   logado na máquina).

Para persistir, copie `.env.example` para `.env`, preencha e carregue:

```bash
cp .env.example .env       # edite
set -a; source .env; set +a
```

## 3. Usar

```bash
ctbz                              # abre a TUI
ctbz state                        # paths/config
ctbz queue show ctbz_tasks/x.md   # parseia uma fila
ctbz queue run  ctbz_tasks/x.md   # executa as tarefas pendentes
ctbz agent briefing -q "pergunta" # agente headless
```

Filas ficam em `ctbz_tasks/*.md` (env `CTBZ_TASKS_DIR`). Formato e anotações
no `README.md`.

## 4. Customização sensível (sem comitar)

Nada interno entra no git. Use env / arquivos locais:

```bash
export CTBZ_BRAND_PRIMARY="Acme"
export CTBZ_BRAND_COMPETITORS="Beta,Gamma"
export CTBZ_BRIEFING_CONTEXT_FILE=$HOME/.config/ctbz/briefing_local.md
export CTBZ_CONFIDENCIAL_DIR=$HOME/internal_docs
export CTBZ_CONFIDENCIAL_FILES=relatorioA.json,relatorioB.json
```

Ver a tabela completa de envs no `README.md` e mais detalhes no `CLAUDE.md`.

## Atualizar

```bash
git pull && npm install && npm run build
```

## Troubleshooting

- **`ctbz: command not found`** → o bin global do npm não está no PATH. Rode
  `npm prefix -g` / `npm bin -g` e adicione ao PATH, ou use `npm start -- …`.
- **`better-sqlite3` falha ao instalar** → falta toolchain. Linux:
  `sudo apt-get install build-essential python3`. (Em x64 Linux normalmente o
  prebuilt baixa pronto e não precisa compilar.)
- **`429 rate_limit`** → na TUI, `/model claude-sonnet-4-6` ou
  `/model claude-haiku-4-5-20251001`.
- **`Sem ANTHROPIC_API_KEY...`** → exporte a key ou tenha o
  `~/.claude/.credentials.json` (ver Auth).
