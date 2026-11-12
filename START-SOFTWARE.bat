@echo off
setlocal
title OpenWA Local Service Starter

echo Checking safe sending settings, server build and dashboard build...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-safe-sending.ps1" -Build
if errorlevel 1 (
  echo.
  echo OpenWA was not started: the safety check or a build failed. Read the message above.
  pause
  exit /b 1
)

echo Starting OpenWA local services...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\openwa-service-manager.ps1" start
if errorlevel 1 (
  echo.
  echo OpenWA could not start. Read the diagnostic above before trying again.
  pause
  exit /b 1
)
echo.
echo Local URLs:
echo   Core dashboard:  http://127.0.0.1:2886/
echo   Bulk campaign:   http://127.0.0.1:2886/bulk-campaign
echo   API docs:        http://127.0.0.1:2785/api/docs
echo.
echo Safe sending is ON: daily limits per number, 1 campaign at a time per number,
echo and campaigns stop automatically if WhatsApp refuses or restricts the number.
echo No Windows auto-start, browser auto-launch, or public tunnel is enabled.
pause
