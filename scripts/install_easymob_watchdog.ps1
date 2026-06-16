param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$TaskName = "SEFAZ RPA EasyMOB Watchdog",
  [string]$StartTime = "07:30",
  [string]$EndTime = "19:30",
  [int]$IntervalMinutes = 2
)
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$runner = Join-Path $ProjectRoot "scripts\run_easymob_watchdog.bat"
if (-not (Test-Path -LiteralPath $runner)) { throw "Arquivo não encontrado: $runner" }
$taskCommand = "cmd.exe /d /c `"`"$runner`"`""
Write-Host "Command=$taskCommand"
Write-Host "WorkingDirectory=$ProjectRoot"
schtasks.exe /Create /F /TN "$TaskName" /TR "$taskCommand" /SC MINUTE /MO $IntervalMinutes /ST $StartTime /ET $EndTime | Out-Host
Write-Host "Tarefa instalada: $TaskName"
Write-Host "Janela: $StartTime até $EndTime, a cada $IntervalMinutes min."
Write-Host "Projeto: $ProjectRoot"
