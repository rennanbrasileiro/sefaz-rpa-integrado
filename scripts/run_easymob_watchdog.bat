@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
cd /d "%PROJECT_ROOT%"
REM Alternativa para ambientes onde a política do PowerShell bloqueia .ps1.
REM Modo REAL continua exigindo EASYMOB_DRY_RUN=false e EASYMOB_CONFIRM_REAL=true.
if not defined EASYMOB_WATCHDOG_ENABLED set EASYMOB_WATCHDOG_ENABLED=true
if not defined PYTHONUTF8 set PYTHONUTF8=1
if not defined PYTHONIOENCODING set PYTHONIOENCODING=utf-8
set "PYBIN=%EASYMOB_PYTHON%"
if "%PYBIN%"=="" set "PYBIN=python"
cd /d "%PROJECT_ROOT%\easymob\rpa"
"%PYBIN%" runner.py --watchdog --headless
exit /b %ERRORLEVEL%
