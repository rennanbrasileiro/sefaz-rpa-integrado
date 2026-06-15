$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$TaskName = "RPA_EasyMOB_Integrado"
$Bat = Join-Path $Root "run_headless.bat"

$Action = New-ScheduledTaskAction -Execute $Bat -WorkingDirectory $Root
$Triggers = @(
  New-ScheduledTaskTrigger -Daily -At 08:00,
  New-ScheduledTaskTrigger -Daily -At 12:00,
  New-ScheduledTaskTrigger -Daily -At 13:00,
  New-ScheduledTaskTrigger -Daily -At 17:00
)
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Triggers -Settings $Settings -Description "RPA EasyMOB Integrado" -Force
Write-Host "Tarefa criada/atualizada: $TaskName"
