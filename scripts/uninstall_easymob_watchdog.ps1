param([string]$TaskName = "SEFAZ RPA EasyMOB Watchdog")
$ErrorActionPreference = "Continue"
Write-Host "Command=schtasks.exe /Delete /F /TN `"$TaskName`""
schtasks.exe /Delete /F /TN "$TaskName"
exit $LASTEXITCODE
