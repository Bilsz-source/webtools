@echo off
title GTPS Cloud - Server Control Panel
cd /d "%~dp0"

echo ======================================================
echo    GTPS CLOUD - SERVER CONTROL PANEL LAUNCHER
echo ======================================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
    set NODE_EXEC=node
) else (
    if exist "%APPDATA%\Antigravity\bin\agy-node.cmd" (
        set NODE_EXEC="%APPDATA%\Antigravity\bin\agy-node.cmd"
    ) else (
        echo [ERROR] Node.js runtime not found.
        pause
        exit /b 1
    )
)

echo [INFO] Starting GTPS Cloud Control Server on http://localhost:3000 ...
start "" http://localhost:3000
%NODE_EXEC% server.js

pause
