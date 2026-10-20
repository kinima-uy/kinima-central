$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$candidates = @()
if ($env:KINIMA_ENV_FILE) { $candidates += $env:KINIMA_ENV_FILE }
if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Kinima/kinima.env') }
$candidates += (Join-Path $projectRoot '.env')
$envPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $envPath) { throw 'No se encontró el entorno. Ejecutá scripts/prepare-local-env.ps1.' }
& docker compose --env-file $envPath up -d --wait database
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL con Docker Compose.' }
Write-Host 'PostgreSQL local está listo.'
