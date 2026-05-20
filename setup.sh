#!/usr/bin/env bash
# Setup do ctbz-code num novo computador (PC da empresa).
# Uso: ./setup.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

echo "▶ ctbz-code setup em $here"

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js não encontrado. Instale Node >= 18 antes:"
  echo "    Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
  echo "    Windows: baixe LTS em https://nodejs.org"
  echo "    macOS: brew install node"
  exit 1
fi
node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 18 ]; then
  echo "✗ Node $node_major < 18. Atualize."
  exit 1
fi

echo "▶ Node $(node --version) OK"
echo "▶ npm install (~30s)…"
npm install --no-audit --no-fund

echo "▶ build…"
npm run build

echo "▶ link global (ctbz no PATH)…"
npm link

echo
echo "✓ pronto. Comandos:"
echo "    ctbz                  → abre a TUI"
echo "    ctbz state            → paths/config"
echo "    npm run smoke         → roda 7 smokes"
echo
echo "Auth: exporte uma destas no ~/.bashrc:"
echo "    export ANTHROPIC_API_KEY=sk-ant-..."
echo "    export ANTHROPIC_AUTH_TOKEN=<bearer>"
echo "Ou tenha ~/.claude/.credentials.json do Claude Code CLI logado."
