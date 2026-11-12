@echo off
title OpenWA Services Stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0openwa-service-manager.ps1" stop
pause
