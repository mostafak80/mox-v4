@echo off
chcp 65001 >nul
title MOX-V4 Server
echo ===================================================
echo   MOX-V4 - Store Finance OS
echo   Starting local server and opening browser...
echo ===================================================
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0server.ps1"
pause
