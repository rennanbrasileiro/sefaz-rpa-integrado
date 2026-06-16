param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$rpaDir = Join-Path $ProjectRoot "easymob\rpa"
$runner = Join-Path $rpaDir "runner.py"
Write-Host "[EasyMOB Watchdog] ProjectRoot=`"$ProjectRoot`""
Write-Host "[EasyMOB Watchdog] WorkingDirectory=`"$rpaDir`""
if (-not (Test-Path -LiteralPath $runner)) { throw "Arquivo não encontrado: $runner" }
Set-Location -LiteralPath $ProjectRoot

$envPath = Join-Path $ProjectRoot ".env"
if (Test-Path -LiteralPath $envPath) {
  Get-Content -LiteralPath $envPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $idx = $line.IndexOf("=")
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"')
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) { [Environment]::SetEnvironmentVariable($name, $value, "Process") }
  }
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
if (-not $env:EASYMOB_WATCHDOG_ENABLED) { $env:EASYMOB_WATCHDOG_ENABLED = "true" }
$python = if ($env:EASYMOB_PYTHON) { $env:EASYMOB_PYTHON } elseif ($env:PYTHON) { $env:PYTHON } else { "python" }
Set-Location -LiteralPath $rpaDir
Write-Host "[EasyMOB Watchdog] Command=`"$python`" `"runner.py`" `"--watchdog`" `"--headless`""
& $python "runner.py" "--watchdog" "--headless"
exit $LASTEXITCODE
