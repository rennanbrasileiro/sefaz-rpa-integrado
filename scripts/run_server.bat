@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PROJECT_ROOT=%~dp0.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"
echo [Servidor] ProjectRoot="%PROJECT_ROOT%"
if not exist "%PROJECT_ROOT%\package.json" (
  echo [ERRO] Arquivo nao encontrado: "%PROJECT_ROOT%\package.json" 1>&2
  exit /b 2
)
cd /d "%PROJECT_ROOT%" || exit /b 3
if not defined NODE_ENV set "NODE_ENV=production"
echo [Servidor] Command="npm" "start"
npm start
exit /b %ERRORLEVEL%
