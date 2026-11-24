@echo off
title Inkgrid network server
rem Serves Inkgrid to other devices on your home network. Close this window to stop.
set "APP_DIR=%~dp0..\app"
set HOST=0.0.0.0
if "%PORT%"=="" set PORT=4173
"%~dp0node.exe" "%~dp0serve.mjs"
pause
