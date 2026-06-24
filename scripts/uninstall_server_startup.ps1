param([string]$TaskName = "SEFAZ RPA Integrado Servidor")
$ErrorActionPreference = "Stop"
schtasks.exe /Delete /F /TN $TaskName | Out-Host
Write-Host "Tarefa removida: $TaskName"
