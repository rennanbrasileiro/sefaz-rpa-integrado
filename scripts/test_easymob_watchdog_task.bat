@echo off
setlocal
chcp 65001 >nul
set "TASK_NAME=SEFAZ RPA EasyMOB Watchdog"
echo Testando tarefa "%TASK_NAME%"...
schtasks.exe /Run /TN "%TASK_NAME%"
set "RUN_CODE=%ERRORLEVEL%"
timeout /t 3 /nobreak >nul
schtasks.exe /Query /TN "%TASK_NAME%" /FO LIST /V
exit /b %RUN_CODE%
