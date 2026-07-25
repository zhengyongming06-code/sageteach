# One-time: run `supabase login` OR set $env:SUPABASE_ACCESS_TOKEN from
# https://supabase.com/dashboard/account/tokens
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env"
function Read-EnvValue([string]$name) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^$name=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}

$key = Read-EnvValue "DEEPSEEK_API_KEY"
if (-not $key) { throw "DEEPSEEK_API_KEY not found in .env" }
$projectRef = Read-EnvValue "VITE_SUPABASE_PROJECT_ID"
if (-not $projectRef) { throw "VITE_SUPABASE_PROJECT_ID not found in .env" }
$cli = Join-Path $env:TEMP "supabase-cli\supabase.exe"
if (-not (Test-Path $cli)) {
  Write-Host "Downloading Supabase CLI..."
  $dir = Split-Path $cli -Parent
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Invoke-WebRequest -Uri "https://github.com/supabase/cli/releases/download/v2.20.12/supabase_windows_amd64.tar.gz" -OutFile "$env:TEMP\supabase.tar.gz" -UseBasicParsing
  tar -xzf "$env:TEMP\supabase.tar.gz" -C $dir
}
& $cli secrets set "DEEPSEEK_API_KEY=$key" --project-ref $projectRef
& $cli secrets list --project-ref $projectRef
