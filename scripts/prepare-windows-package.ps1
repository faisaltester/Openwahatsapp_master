[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\release\windows'),
  [string]$NodeVersion = '22.14.0',
  [string]$ChromeSource = (Join-Path $env:USERPROFILE '.cache\puppeteer\chrome'),
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out = [IO.Path]::GetFullPath($OutputDirectory)
$app = Join-Path $out 'app'
$runtime = Join-Path $out 'runtime'

function Copy-Tree([string]$From, [string]$To) {
  if (-not (Test-Path -LiteralPath $From)) { throw "Required package input is missing: $From" }
  New-Item -ItemType Directory -Force -Path $To | Out-Null
  & robocopy $From $To /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Robocopy failed from $From to $To with exit code $LASTEXITCODE" }
  $global:LASTEXITCODE = 0
}

function Copy-RequiredPath([string]$RelativePath) {
  Copy-Tree (Join-Path $root $RelativePath) (Join-Path $app $RelativePath)
}

if (-not $SkipBuild) {
  Write-Host 'Building OpenWA API and dashboard...' -ForegroundColor Cyan
  Push-Location $root
  try { & npm.cmd run build:all; if ($LASTEXITCODE -ne 0) { throw 'Build failed.' } }
  finally { Pop-Location }
}

if (Test-Path -LiteralPath $app) { Remove-Item -LiteralPath $app -Recurse -Force }
New-Item -ItemType Directory -Force -Path $app, $runtime | Out-Null

Write-Host 'Collecting application runtime...' -ForegroundColor Cyan
foreach ($path in @('dist', 'node_modules', 'dashboard\dist', 'bulk-messaging', 'scripts', 'package.json', 'package-lock.json')) {
  $source = Join-Path $root $path
  $destination = Join-Path $app $path
  if (Test-Path -LiteralPath $source -PathType Leaf) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  } else {
    Copy-Tree $source $destination
  }
}

# The backend's production static host reads the Bulk workspace from dashboard/dist/bulk.
Copy-Tree (Join-Path $root 'bulk-messaging') (Join-Path $app 'dashboard\dist\bulk')
Remove-Item -LiteralPath (Join-Path $app 'dashboard\dist\bulk\node_modules') -Recurse -Force -ErrorAction SilentlyContinue

$targetNode = Join-Path $runtime 'node.exe'
if (-not (Test-Path -LiteralPath $targetNode)) {
  Write-Host "Downloading bundled Node.js $NodeVersion..." -ForegroundColor Cyan
  $nodeZip = Join-Path $env:TEMP "node-v$NodeVersion-win-x64.zip"
  if (-not (Test-Path -LiteralPath $nodeZip)) {
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" -OutFile $nodeZip
  }
  Expand-Archive -LiteralPath $nodeZip -DestinationPath $runtime -Force
  $nodeExtracted = Join-Path $runtime "node-v$NodeVersion-win-x64"
  Move-Item -LiteralPath (Join-Path $nodeExtracted 'node.exe') -Destination $targetNode -Force
  Remove-Item -LiteralPath $nodeExtracted -Recurse -Force
}

$targetChrome = Join-Path $runtime 'chrome\chrome.exe'
if (-not (Test-Path -LiteralPath $targetChrome)) {
  Write-Host 'Bundling Chromium used by WhatsApp Web...' -ForegroundColor Cyan
  $chromeExe = Get-ChildItem -LiteralPath $ChromeSource -Filter chrome.exe -Recurse -File | Select-Object -First 1
  if (-not $chromeExe) { throw "Bundled Chromium was not found under $ChromeSource. Run `npx puppeteer browsers install chrome` first." }
  $chromeRoot = Split-Path -Parent $chromeExe.FullName
  Copy-Tree $chromeRoot (Join-Path $runtime 'chrome')
}

@"
NODE_ENV=production
PORT=2785
# The desktop build is served directly over localhost HTTP, not behind TLS.
CSP_UPGRADE_INSECURE_REQUESTS=false
PUPPETEER_EXECUTABLE_PATH=../runtime/chrome/chrome.exe
"@ | Set-Content -LiteralPath (Join-Path $app '.env') -NoNewline -Encoding ascii

@"
@echo off
setlocal
set "OPENWA_HOME=%~dp0"
cd /d "%OPENWA_HOME%app"
start "OpenWA Automation" /b "%OPENWA_HOME%runtime\node.exe" "%OPENWA_HOME%app\dist\main.js"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:2785/"
"@ | Set-Content -LiteralPath (Join-Path $out 'OpenWA Automation.bat') -NoNewline -Encoding ascii

@"
@echo off
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :2785 ^| findstr LISTENING') do taskkill /PID %%a /T /F
"@ | Set-Content -LiteralPath (Join-Path $out 'Stop OpenWA Automation.bat') -NoNewline -Encoding ascii

Write-Host "Windows package ready: $out" -ForegroundColor Green
$global:LASTEXITCODE = 0
