# One-time: run `supabase login` OR set $env:SUPABASE_ACCESS_TOKEN from
# https://supabase.com/dashboard/account/tokens
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env"
$line = Get-Content $envFile | Where-Object { $_ -match '^DEEPSEEK_API_KEY=' } | Select-Object -First 1
if (-not $line) { throw "DEEPSEEK_API_KEY not found in .env" }
$key = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
$cli = Join-Path $env:TEMP "supabase-cli\supabase.exe"
if (-not (Test-Path $cli)) {
  Write-Host "Downloading Supabase CLI..."
  $dir = Split-Path $cli -Parent
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Invoke-WebRequest -Uri "https://github.com/supabase/cli/releases/download/v2.20.12/supabase_windows_amd64.tar.gz" -OutFile "$env:TEMP\supabase.tar.gz" -UseBasicParsing
  tar -xzf "$env:TEMP\supabase.tar.gz" -C $dir
}
& $cli secrets set "DEEPSEEK_API_KEY=$key" --project-ref lqffeyniustvyegcigvy
& $cli secrets list --project-ref lqffeyniustvyegcigvy
