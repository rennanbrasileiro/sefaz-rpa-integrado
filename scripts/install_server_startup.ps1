param(
  [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$TaskName = "SEFAZ RPA Integrado Servidor"
)
$ErrorActionPreference = "Stop"
$runner = Join-Path $ProjectRoot "scripts\run_server.bat"
if (-not (Test-Path $runner)) { throw "Arquivo não encontrado: $runner" }
$taskCommand = "cmd.exe /c `"$runner`""
schtasks.exe /Create /F /TN $TaskName /TR $taskCommand /SC ONLOGON | Out-Host
Write-Host "Tarefa instalada: $TaskName"
Write-Host "Servidor será iniciado no logon do usuário. Painel: http://localhost:3131"
