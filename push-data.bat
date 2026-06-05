@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-data.ps1"
exit /b %ERRORLEVEL%
