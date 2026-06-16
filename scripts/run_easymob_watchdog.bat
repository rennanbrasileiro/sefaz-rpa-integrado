@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PROJECT_ROOT=%~dp0.."
for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"
set "RPA_DIR=%PROJECT_ROOT%\easymob\rpa"
set "RUNNER=%RPA_DIR%\runner.py"
echo [EasyMOB Watchdog] ProjectRoot="%PROJECT_ROOT%"
echo [EasyMOB Watchdog] WorkingDirectory="%RPA_DIR%"
if not exist "%RUNNER%" (
  echo [ERRO] Arquivo nao encontrado: "%RUNNER%" 1>&2
  exit /b 2
)
if not defined EASYMOB_WATCHDOG_ENABLED set "EASYMOB_WATCHDOG_ENABLED=true"
if not defined PYTHONUTF8 set "PYTHONUTF8=1"
if not defined PYTHONIOENCODING set "PYTHONIOENCODING=utf-8"
set "PYBIN=%EASYMOB_PYTHON%"
if "%PYBIN%"=="" set "PYBIN=python"
cd /d "%RPA_DIR%" || exit /b 3
echo [EasyMOB Watchdog] Command="%PYBIN%" "runner.py" "--watchdog" "--headless"
"%PYBIN%" "runner.py" "--watchdog" "--headless"
exit /b %ERRORLEVEL%
