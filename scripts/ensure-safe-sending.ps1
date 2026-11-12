<#
.SYNOPSIS
  Makes sure OpenWA runs with the anti-restriction sending safeguards, and (optionally) that the
  compiled server in dist\ is up to date with src\.

.DESCRIPTION
  - Creates .env if it is missing (containing only the safety settings).
  - Appends any MISSING safety setting to .env. Existing values are never changed or removed, so an
    operator's own choice always wins; a warning is printed if pacing was explicitly turned off.
  - With -Build: runs `npm run build` when dist\main.js is missing or older than any file in src\.
    The service starts dist\main.js, so source fixes are not live until this build has run.
    It also builds the dashboard (dashboard\dist) when missing or older than dashboard\src, since
    port 2886 serves that prebuilt copy.

  Exit code 0 = ready, 1 = a step failed (the message says which).
#>
param(
    [switch]$Build,
    [switch]$ForceBuild
)

$ErrorActionPreference = 'Stop'
$RootDir = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $RootDir '.env'

# Conservative defaults (same values as the code's built-in schedule). See .env.example for details.
$SafetySettings = [ordered]@{
    'SEND_PACING_ENABLED'                     = 'true'
    'SEND_PACING_WARMUP_SCHEDULE'             = '20,40,80,160,320,640,1000'
    'SEND_PACING_COLD_DAILY_CAP'              = '5,10,20,40,60,80,100'
    'SEND_PACING_BREAKER_THRESHOLD'           = '5'
    'SEND_PACING_BREAKER_COOLDOWN_MS'         = '900000'
    'BULK_MAX_CONCURRENT_BATCHES_PER_SESSION' = '1'
    'BULK_MAX_CONSECUTIVE_FAILURES'           = '3'
}

function Ensure-SafetySettings {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $existing = ''
    if (Test-Path $EnvFile) {
        $existing = [IO.File]::ReadAllText($EnvFile)
    } else {
        Write-Host " [..] .env not found - creating it with the safe sending settings." -ForegroundColor Yellow
    }

    $missing = @()
    foreach ($key in $SafetySettings.Keys) {
        if ($existing -notmatch "(?m)^\s*$([regex]::Escape($key))\s*=") { $missing += $key }
    }

    if ($existing -match '(?m)^\s*SEND_PACING_ENABLED\s*=\s*(.*?)\s*$' -and $Matches[1] -ne 'true') {
        Write-Host " [!!] WARNING: SEND_PACING_ENABLED=$($Matches[1]) in .env - daily limits are OFF." -ForegroundColor Red
        Write-Host "      Sending without limits is the main cause of WhatsApp number bans." -ForegroundColor Red
        Write-Host "      Set SEND_PACING_ENABLED=true in .env to turn the protection back on." -ForegroundColor Red
    }

    if ($missing.Count -eq 0) {
        Write-Host " [OK] Safe sending settings present in .env" -ForegroundColor Green
        return
    }

    $nl = "`r`n"
    $block = ''
    if ($existing.Length -gt 0 -and -not $existing.EndsWith("`n")) { $block += $nl }
    $block += "$nl# --- Anti-restriction send pacing (added automatically; edit values here if needed) ---$nl"
    foreach ($key in $missing) { $block += "$key=$($SafetySettings[$key])$nl" }
    [IO.File]::AppendAllText($EnvFile, $block, $utf8NoBom)
    Write-Host " [OK] Added to .env: $($missing -join ', ')" -ForegroundColor Green
}

function Ensure-Build {
    $mainJs = Join-Path $RootDir 'dist\main.js'
    $needsBuild = $ForceBuild -or -not (Test-Path $mainJs)
    if (-not $needsBuild) {
        $builtAt = (Get-Item $mainJs).LastWriteTimeUtc
        $newer = Get-ChildItem -Path (Join-Path $RootDir 'src') -Recurse -File -Filter '*.ts' |
            Where-Object { $_.Name -notlike '*.spec.ts' -and $_.LastWriteTimeUtc -gt $builtAt } |
            Select-Object -First 1
        $needsBuild = [bool]$newer
    }
    if (-not $needsBuild) {
        Write-Host " [OK] Server build is up to date" -ForegroundColor Green
        return
    }
    Write-Host " [..] Building the OpenWA server (first run or code updated, takes a minute)..." -ForegroundColor Yellow
    Push-Location $RootDir
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
    Write-Host " [OK] Server build complete" -ForegroundColor Green
}

# Port 2886 serves dashboard\dist as-is, so a missing or stale build means a missing or old UI.
function Ensure-DashboardBuild {
    $dashDir = Join-Path $RootDir 'dashboard'
    if (-not (Test-Path $dashDir)) { return }
    $indexHtml = Join-Path $dashDir 'dist\index.html'
    $needsBuild = $ForceBuild -or -not (Test-Path $indexHtml)
    if (-not $needsBuild) {
        $builtAt = (Get-Item $indexHtml).LastWriteTimeUtc
        $newer = Get-ChildItem -Path (Join-Path $dashDir 'src'), (Join-Path $dashDir 'index.html') -Recurse -File |
            Where-Object { $_.Name -notmatch '\.(spec|test)\.' -and $_.LastWriteTimeUtc -gt $builtAt } |
            Select-Object -First 1
        $needsBuild = [bool]$newer
    }
    if (-not $needsBuild) {
        Write-Host " [OK] Dashboard build is up to date" -ForegroundColor Green
        return
    }
    Push-Location $RootDir
    try {
        if (-not (Test-Path (Join-Path $dashDir 'node_modules\vite'))) {
            Write-Host " [..] Installing dashboard dependencies..." -ForegroundColor Yellow
            & npm.cmd run dashboard:ci
            if ($LASTEXITCODE -ne 0) { throw "dashboard npm ci failed with exit code $LASTEXITCODE" }
        }
        Write-Host " [..] Building the dashboard (first run or code updated)..." -ForegroundColor Yellow
        & npm.cmd run dashboard:build
        if ($LASTEXITCODE -ne 0) { throw "dashboard build failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
    Write-Host " [OK] Dashboard build complete" -ForegroundColor Green
}

try {
    Ensure-SafetySettings
    if ($Build -or $ForceBuild) { Ensure-Build; Ensure-DashboardBuild }
    exit 0
} catch {
    Write-Host " [XX] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
