@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_ROOT=%%~fI"

echo [SEFAZ RPA] EasyMOB Watchdog
echo ProjectRoot=%PROJECT_ROOT%

pushd "%PROJECT_ROOT%" || exit /b 10

if not defined EASYMOB_WATCHDOG_ENABLED set "EASYMOB_WATCHDOG_ENABLED=true"
if not defined PYTHONUTF8 set "PYTHONUTF8=1"
if not defined PYTHONIOENCODING set "PYTHONIOENCODING=utf-8"

set "PYBIN=%EASYMOB_PYTHON%"
if "%PYBIN%"=="" set "PYBIN=%PYTHON%"
if "%PYBIN%"=="" set "PYBIN=python"

if not exist "%PROJECT_ROOT%\easymob\rpa\runner.py" (
  echo ERRO: runner.py nao encontrado em "%PROJECT_ROOT%\easymob\rpa\runner.py"
  popd
  exit /b 11
)

pushd "%PROJECT_ROOT%\easymob\rpa" || exit /b 12
"%PYBIN%" runner.py --watchdog --headless
set "CODE=%ERRORLEVEL%"
popd
popd
exit /b %CODE%
