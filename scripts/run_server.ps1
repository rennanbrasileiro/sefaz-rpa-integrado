param([string]$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path)
$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot
$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { "production" }
npm start
exit $LASTEXITCODE
