param(
  [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$TaskName = "SEFAZ RPA EasyMOB Watchdog",
  [string]$StartTime = "07:30",
  [string]$EndTime = "19:30",
  [int]$IntervalMinutes = 2
)

$ErrorActionPreference = "Stop"
# Política restrita: se o PowerShell corporativo bloquear scripts, use:
#   scripts\run_easymob_watchdog.bat
# ou execute diretamente: cd easymob\rpa && python runner.py --watchdog --headless
$runner = Join-Path $ProjectRoot "scripts\run_easymob_watchdog.ps1"
if (-not (Test-Path $runner)) { throw "Arquivo não encontrado: $runner" }

$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runner`" -ProjectRoot `"$ProjectRoot`""

# Agenda recorrente a cada N minutos. A regra de dias úteis fica dentro do runner.py,
# evitando XML complexo e mantendo portabilidade no Windows corporativo.
schtasks.exe /Create /F /TN $TaskName /TR $taskCommand /SC MINUTE /MO $IntervalMinutes /ST $StartTime /ET $EndTime | Out-Host

Write-Host "Tarefa instalada: $TaskName"
Write-Host "Janela: $StartTime até $EndTime, a cada $IntervalMinutes min."
Write-Host "Projeto: $ProjectRoot"
Write-Host "Importante: modo REAL ainda exige EASYMOB_DRY_RUN=false e EASYMOB_CONFIRM_REAL=true."
