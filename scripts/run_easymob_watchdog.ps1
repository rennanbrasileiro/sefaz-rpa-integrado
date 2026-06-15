param(
  [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot

# Carrega .env simples, sem dependência externa. Variáveis já existentes prevalecem.
$envPath = Join-Path $ProjectRoot ".env"
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $idx = $line.IndexOf("=")
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"')
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:EASYMOB_WATCHDOG_ENABLED = if ($env:EASYMOB_WATCHDOG_ENABLED) { $env:EASYMOB_WATCHDOG_ENABLED } else { "true" }

$python = if ($env:EASYMOB_PYTHON) { $env:EASYMOB_PYTHON } elseif ($env:PYTHON) { $env:PYTHON } else { "python" }
$rpaDir = Join-Path $ProjectRoot "easymob\rpa"
Set-Location $rpaDir
& $python "runner.py" "--watchdog" "--headless"
exit $LASTEXITCODE
