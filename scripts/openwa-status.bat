@echo off
title OpenWA Services Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0openwa-service-manager.ps1" status
pause
