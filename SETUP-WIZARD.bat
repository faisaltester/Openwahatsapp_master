@echo off
title OpenWA Setup Wizard
rem Make sure this copy's .env has the safe sending settings before installing from it.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-safe-sending.ps1"
if errorlevel 1 (
    echo.
    echo The safe sending settings could not be written to .env. Read the message above.
    pause
    exit /b 1
)
if not exist "%~dp0OpenWA-Setup.exe" (
    echo OpenWA-Setup.exe was not found next to this file. Copy the complete OpenWA folder and try again.
    pause
    exit /b 1
)
start "" "%~dp0OpenWA-Setup.exe"
exit /b 0
