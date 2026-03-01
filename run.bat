@echo off
echo ============================================
echo   FORGE OF ARTIFACTS - Multiplayer Node Server
echo ============================================
echo.
echo Starting server at http://localhost:3000
echo Keep this window open while playing!
echo.

cd /d "%~dp0"
start http://localhost:3000

node server.js
pause
