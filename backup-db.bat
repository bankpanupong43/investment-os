@echo off
setlocal enabledelayedexpansion

set DB_SRC=%~dp0prisma\dev.db
set BACKUP_DIR=%~dp0backups

:: Locale-safe timestamp via PowerShell
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"') do set TS=%%i

set BACKUP_FILE=%BACKUP_DIR%\dev_%TS%.db

echo [backup-db] Backing up investment-os database...
echo.

:: Check source exists
if not exist "%DB_SRC%" (
    echo [ERROR] Database not found: %DB_SRC%
    echo [ERROR] Run sync-data.bat first, or start the dev server to create a fresh database.
    exit /b 1
)

:: Create backups dir if missing
if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
    echo [INFO]  Created backups directory
)

:: Copy
copy /Y "%DB_SRC%" "%BACKUP_FILE%" >nul
if errorlevel 1 (
    echo [ERROR] Backup failed: %BACKUP_FILE%
    exit /b 1
)

echo [OK]    Saved: backups\dev_%TS%.db

:: Show last 5 backups
echo.
echo [backup-db] Recent backups ^(newest first^):
set COUNT=0
for /f "tokens=*" %%f in ('dir /B /O-D "%BACKUP_DIR%\dev_*.db" 2^>nul') do (
    set /a COUNT+=1
    if !COUNT! leq 5 echo          %%f
)
if %COUNT% gtr 5 (
    set /a OLDER=%COUNT%-5
    echo          ... and !OLDER! older backup^(s^)
)

echo.
echo [backup-db] Done. Total backups: %COUNT%
exit /b 0
