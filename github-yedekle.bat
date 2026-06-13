@echo off
chcp 65001 >nul
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0github-yedekle.ps1"
set "RC=%ERRORLEVEL%"

echo.
echo Pencereyi kapatmak icin bir tusa basin...
pause >nul
exit /b %RC%
