@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
cd /d "%PROJECT_ROOT%"
REM Inicia o painel local e o orquestrador Express. Use quando PowerShell for bloqueado.
if not defined NODE_ENV set NODE_ENV=production
npm start
exit /b %ERRORLEVEL%
