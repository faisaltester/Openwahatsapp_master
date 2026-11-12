@echo off
setlocal
title OpenWA Setup On New Computer
rem Work from this folder even when started via "Run as administrator" (which starts in System32).
cd /d "%~dp0"
rem Failures are caught with "||": npm can exit with a NEGATIVE code (e.g. -4048 EPERM), which
rem "if errorlevel 1" does not see.

where node >nul 2>nul || (
    echo Node.js v22.13 or later is required: https://nodejs.org/
    pause
    exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" || (
    echo Node.js v22.13 or later is required. This computer has:
    node -v
    echo Download the current LTS from https://nodejs.org/
    pause
    exit /b 1
)

rem npm install also installs the dashboard's own packages (postinstall).
set "NEED_INSTALL="
if not exist "node_modules\" set NEED_INSTALL=1
if not exist "dashboard\node_modules\" set NEED_INSTALL=1
if defined NEED_INSTALL (
    echo Installing packages, this can take a few minutes...
    call npm install || (
        echo.
        echo Setup did not finish: npm install failed. Check the internet connection and read the message above.
        pause
        exit /b 1
    )
)

echo Applying WhatsApp Web and Baileys compatibility patches...
set "PATCH_FAILED="
for %%P in (patch-wwebjs-201832 patch-wwebjs-newsletter-preview patch-wwebjs-status patch-wwebjs-ready-sync patch-wwebjs-participant-arity patch-wwebjs-block patch-wwebjs-group-description patch-baileys-appstate patch-baileys-newsletter-create) do (
    if exist "scripts\%%P.js" (
        node "scripts\%%P.js" --best-effort || (
            echo  [XX] %%P failed
            set PATCH_FAILED=1
        )
    )
)
if defined PATCH_FAILED (
    echo.
    echo Setup did not finish: a compatibility patch failed. Delete node_modules and run this setup again.
    pause
    exit /b 1
)

echo Enabling safe sending settings and building the server and dashboard...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-safe-sending.ps1" -ForceBuild || (
    echo.
    echo Setup did not finish: the safety settings or a build failed. Read the message above.
    pause
    exit /b 1
)

echo Setup complete. Windows auto-start is disabled; run START-SOFTWARE.bat manually.
echo Tip: a new WhatsApp number may send only 20 messages on day 1; the limit grows daily.
pause
