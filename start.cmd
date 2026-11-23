@echo off
title Inkgrid
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 18 or newer is required: https://nodejs.org & pause & exit /b 1)
if not exist dist-server\serve.mjs (
  call npm install || goto :fail
  call npm run build || goto :fail
)
if not exist .env (
  echo No passphrase set yet. Pick one now.
  node dist-server\serve.mjs --set-passphrase || goto :fail
)
start "" http://localhost:4173
node dist-server\serve.mjs
pause
exit /b 0
:fail
echo Something went wrong, see the messages above.
pause
exit /b 1
