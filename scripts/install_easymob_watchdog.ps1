param(
  [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$TaskName = "SEFAZ RPA EasyMOB Watchdog",
  [string]$StartTime = "07:30",
  [string]$EndTime = "19:30",
  [int]$IntervalMinutes = 2
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$runBat = Join-Path $ProjectRoot "scripts\run_easymob_watchdog.bat"
if (-not (Test-Path $runBat)) { throw "Arquivo não encontrado: $runBat" }

# Usa .bat como ação principal para evitar bloqueios de política do PowerShell corporativo.
# A aspagem dupla é intencional para suportar OneDrive, espaços e acentos no caminho.
$taskCommand = "cmd.exe /d /c `"`"$runBat`"`""

Write-Host "Instalando tarefa: $TaskName"
Write-Host "Projeto: $ProjectRoot"
Write-Host "Comando: $taskCommand"

$createArgs = @('/Create','/F','/TN',$TaskName,'/TR',$taskCommand,'/SC','MINUTE','/MO',"$IntervalMinutes",'/ST',$StartTime,'/ET',$EndTime)
& schtasks.exe @createArgs
$createCode = $LASTEXITCODE
if ($createCode -ne 0) { throw "Falha ao criar tarefa. ExitCode=$createCode" }

Write-Host "Tarefa instalada: $TaskName"
Write-Host "Janela: $StartTime até $EndTime, a cada $IntervalMinutes min."
Write-Host "Validando status..."
& schtasks.exe /Query /TN $TaskName /FO LIST /V
exit $LASTEXITCODE
