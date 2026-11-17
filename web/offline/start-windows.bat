@echo off
rem FleetOps offline for Windows: starts the local server (this computer only) and opens the app.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
