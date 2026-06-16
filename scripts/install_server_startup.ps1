param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$TaskName = "SEFAZ RPA Integrado Servidor"
)
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$runner = Join-Path $ProjectRoot "scripts\run_server.bat"
if (-not (Test-Path -LiteralPath $runner)) { throw "Arquivo não encontrado: $runner" }
$taskCommand = "cmd.exe /d /c `"`"$runner`"`""
Write-Host "Command=$taskCommand"
Write-Host "WorkingDirectory=$ProjectRoot"
schtasks.exe /Create /F /TN "$TaskName" /TR "$taskCommand" /SC ONLOGON | Out-Host
Write-Host "Tarefa instalada: $TaskName"
Write-Host "Servidor será iniciado no logon do usuário. Painel: http://localhost:3131"
