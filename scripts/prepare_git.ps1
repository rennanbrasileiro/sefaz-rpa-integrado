$ErrorActionPreference = "Stop"
if (-not (Test-Path ".git")) { git init }
git add .
git commit -m "chore: base SEFAZ RPA Integrado 1.1.0 codex-ready"
Write-Host "Repositório inicial preparado. Crie o remoto no GitHub e faça push."
