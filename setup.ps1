# Setup do ctbz-code no Windows. Uso (PowerShell): .\setup.ps1
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host "▶ ctbz-code setup em $here"

try { $null = node --version } catch {
  Write-Host "✗ Node.js não encontrado. Baixe LTS em https://nodejs.org"
  exit 1
}
$nodeMajor = (node -p "process.versions.node.split('.')[0]")
if ([int]$nodeMajor -lt 18) {
  Write-Host "✗ Node $nodeMajor < 18. Atualize."
  exit 1
}

Write-Host "▶ Node $(node --version) OK"
Write-Host "▶ npm install (~30s)…"
npm install --no-audit --no-fund

Write-Host "▶ build…"
npm run build

Write-Host "▶ link global (ctbz no PATH)…"
npm link

Write-Host ""
Write-Host "✓ pronto. Comandos:"
Write-Host "    ctbz                  → abre a TUI"
Write-Host "    ctbz state            → paths/config"
Write-Host "    npm run smoke         → roda 7 smokes"
Write-Host ""
Write-Host "Auth: defina uma destas (PowerShell):"
Write-Host "    [Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY', 'sk-ant-...', 'User')"
