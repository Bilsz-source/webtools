@echo off
title PYROCK GTPS - Server Control Panel Launcher
cd /d "%~dp0"

echo ======================================================
echo    PYROCK GTPS - SERVER CONTROL PANEL LAUNCHER
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

echo [INFO] Starting Local Control Daemon (Port 3000)...
echo [INFO] Connecting & Opening Vercel Web Panel: https://pyrock-server.vercel.app/ ...
start "" https://pyrock-server.vercel.app/
%NODE_EXEC% server.js

pause
