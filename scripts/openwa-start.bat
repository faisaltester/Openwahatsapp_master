@echo off
title OpenWA Services Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0openwa-service-manager.ps1" start
pause
