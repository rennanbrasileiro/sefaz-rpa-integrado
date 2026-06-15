param([string]$TaskName = "SEFAZ RPA EasyMOB Watchdog")
# Política restrita: se o PowerShell corporativo bloquear scripts, remova pelo Agendador de Tarefas
# ou execute: schtasks.exe /Delete /F /TN "SEFAZ RPA EasyMOB Watchdog"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Tarefa removida, se existia: $TaskName"
