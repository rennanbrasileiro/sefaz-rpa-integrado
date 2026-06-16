@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "TASK_NAME=SEFAZ RPA EasyMOB Watchdog"
echo [Teste] Command="schtasks.exe" "/Run" "/TN" "%TASK_NAME%"
schtasks.exe /Run /TN "%TASK_NAME%"
set "RUN_CODE=%ERRORLEVEL%"
echo [Teste] exitCode=%RUN_CODE%
timeout /t 3 /nobreak >nul
echo [Teste] Command="schtasks.exe" "/Query" "/TN" "%TASK_NAME%" "/FO" "LIST" "/V"
schtasks.exe /Query /TN "%TASK_NAME%" /FO LIST /V
exit /b %RUN_CODE%
