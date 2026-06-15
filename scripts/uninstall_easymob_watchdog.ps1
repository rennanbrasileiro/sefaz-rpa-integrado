param([string]$TaskName = "SEFAZ RPA EasyMOB Watchdog")
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Tarefa removida, se existia: $TaskName"
