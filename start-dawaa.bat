@echo off
REM Start Dawaa if it is down. Safe to run again: a second launch only opens the app.
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
start "Dawaa" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dawaa.ps1"
