@echo off
setlocal

:: Shared data lives one level above this project: ..\shared\investment-os-data
set SHARED=%~dp0..\shared\investment-os-data

set SRC_ENV=%SHARED%\.env
set SRC_DB=%SHARED%\dev.db
set DST_ENV=%~dp0.env
set DST_DB=%~dp0prisma\dev.db

echo [sync-data] Syncing investment-os data files...
echo [sync-data] Source: %SHARED%
echo.

:: Copy .env
if not exist "%SRC_ENV%" (
    echo [ERROR] Source not found: %SRC_ENV%
    set ERRORS=1
) else (
    copy /Y "%SRC_ENV%" "%DST_ENV%" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy .env
        set ERRORS=1
    ) else (
        echo [OK]    .env  ^>  %DST_ENV%
    )
)

:: Copy dev.db
if not exist "%SRC_DB%" (
    echo [ERROR] Source not found: %SRC_DB%
    set ERRORS=1
) else (
    copy /Y "%SRC_DB%" "%DST_DB%" >nul
    if errorlevel 1 (
        echo [ERROR] Failed to copy prisma\dev.db
        set ERRORS=1
    ) else (
        echo [OK]    dev.db  ^>  %DST_DB%
    )
)

echo.
if defined ERRORS (
    echo [sync-data] Completed with errors.
    exit /b 1
) else (
    echo [sync-data] Done.
    exit /b 0
)
