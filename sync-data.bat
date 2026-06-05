@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-data.ps1"
exit /b %ERRORLEVEL%
