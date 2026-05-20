# Instalar `ctbz` no PC da empresa

Hoje o projeto vive em `Confidencial/` — não tem repo público pra fazer
`npm i -g <nome>` direto da internet. Use o tarball.

## Caminho 1 — tarball (recomendado, conservador)

### No laptop pessoal (aqui)

```bash
cd /home/pedro/repo/Cont/Confidencial/ctbz-code
npm run build && npm pack
# saída: ./ctbz-code-0.1.0.tgz   (~98 KB, só código compilado)
```

### Transferir o `.tgz` pro PC da empresa

Opções (escolha uma que respeite a política da Contabilizei):

- **Pendrive** (mais seguro pra material derivado de Confidencial).
- **Slack DM pra você mesmo** (se a empresa permite — o arquivo são 98K e
  é só código).
- **Google Drive corporativo** (subir pra uma pasta sua, baixar lá).
- **SFTP** se tiver acesso.

### No PC da empresa, **uma linha**:

```bash
# pré-requisito: Node ≥18 instalado (nvm ou pacote do SO)
npm install -g ./ctbz-code-0.1.0.tgz
```

Confere:

```bash
which ctbz                # deve apontar pro PATH global do node
ctbz state                # mostra paths/config
ctbz                      # abre a TUI
```

### Auth no PC da empresa

O bridge nativo precisa de **uma** das três:

1. `export ANTHROPIC_API_KEY=sk-ant-...` (mais simples; pegue no console.anthropic.com)
2. `export ANTHROPIC_AUTH_TOKEN=<token>` (OAuth Bearer)
3. Ter `~/.claude/.credentials.json` do Claude Code CLI já logado.

Coloque no `~/.bashrc` ou `~/.zshrc` se quiser persistir.

## Caminho 2 — uma linha de verdade (futuro)

Quando o código estiver sanitizado (remover referências internas tipo
`NN-QD1`, nomes de líderes de trilha do system prompt do `briefing`) e
você quiser que outros analistas instalem facilmente:

### Opção 2a — repo privado GitHub/GitLab

```bash
# Você (1x):
cd /home/pedro/repo
git clone /home/pedro/repo/Cont/Confidencial/ctbz-code ctbz-code-public
cd ctbz-code-public
# remover system prompts internos, criar versão genérica
git init && git add . && git commit -m "ctbz-code v0.1.0"
gh repo create contabilizei/ctbz-code --private --source=. --push

# Outros analistas:
npm install -g git+https://github.com/contabilizei/ctbz-code.git
```

### Opção 2b — servir o tarball internamente

Se a Contabilizei tem um servidor interno HTTP/S3:

```bash
# Você sobe ctbz-code-0.1.0.tgz pra https://internal.contabilizei.com/ctbz/
# Outros:
curl -fsSL https://internal.contabilizei.com/ctbz/latest.tgz | tar -xz
npm install -g ./package
```

Ou com script:

```bash
curl -fsSL https://internal.contabilizei.com/ctbz/install.sh | bash
```

Não fiz esse script ainda — quando você tiver o servidor interno, é só
me avisar e eu escrevo.

## Pré-requisitos no PC da empresa

```bash
node --version            # >=18
npm --version
which python3             # opcional (pra shell_sandbox)
which git                 # opcional
```

Se faltar Node:

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows: baixar de nodejs.org (LTS)
# macOS: brew install node
```

## Troubleshooting

- **`ctbz: command not found`** → npm global bin não está no PATH.
  Rode `npm bin -g` pra ver o caminho e adicione ao PATH.
- **`better-sqlite3` falha na instalação** → falta toolchain de
  compilação. No Linux: `sudo apt-get install build-essential python3`.
  No Windows: `npm install --global windows-build-tools` (antigo) ou
  Visual Studio Build Tools.
- **`429 rate_limit`** → `/model claude-sonnet-4-6` ou
  `/model claude-haiku-4-5-20251001` dentro da TUI.
- **`Sem ANTHROPIC_API_KEY...`** → exporte a key (ver Auth acima).

## Que arquivos NÃO vão no tarball

Verifiquei: o `npm pack` não inclui:
- nenhum `.json` de `Cont/Confidencial/`
- nenhum `.db`, `.env`, `.credentials`
- arquivos do `notes/`, `ctbz_tasks/` (filas locais)
- pasta `tests/` (smokes locais)
- só `dist/` (build compilado), `bin/`, `package.json`, `README.md`.

Comando pra reconferir:

```bash
tar -tzf ctbz-code-0.1.0.tgz | head -40
tar -tzf ctbz-code-0.1.0.tgz | grep -E "(projetos|pesquisa|slides|estudo|state\.db|\.env)"
# segunda linha deve sair vazia
```
