@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or later is required.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:5173 in Chrome or Edge.
echo Keep this window open while using AI-ON.
node scripts/local-server.mjs
pause
