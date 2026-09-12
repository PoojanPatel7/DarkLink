@echo off
title DarkLink PC Server
cd /d "%~dp0"
echo ========================================================
echo        Starting DarkLink PC Web Server...
echo ========================================================
echo.
echo Installing dependencies if needed...
call npm install
echo.
echo Launching DarkLink Server...
start "" http://localhost:5000
node server.js
pause
