@echo off
title Wheat Breeding Platform Launcher
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_platform.ps1"
pause
