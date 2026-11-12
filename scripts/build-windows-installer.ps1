[CmdletBinding()]
param(
  [switch]$SkipPackage
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not $SkipPackage) {
  & (Join-Path $PSScriptRoot 'prepare-windows-package.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Windows runtime package preparation failed.' }
}

$isccCandidates = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 7\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 7\ISCC.exe"
) | Where-Object { Test-Path -LiteralPath $_ }

if (-not $isccCandidates) {
  throw "Inno Setup compiler (ISCC.exe) is required only to build the installer. Install Inno Setup 6/7, then run this script again. The ready-to-package payload is in release\\windows."
}

$iscc = @($isccCandidates)[0]
& $iscc (Join-Path $root 'installer\OpenWA-Automation.iss')
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup failed to build the installer.' }

$setup = Join-Path $root 'release\OpenWA-Automation-Setup.exe'
if (-not (Test-Path -LiteralPath $setup)) { throw "Installer output was not created: $setup" }
Write-Host "Installer created: $setup" -ForegroundColor Green
