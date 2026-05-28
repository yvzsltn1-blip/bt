@echo off
setlocal

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo Git bulunamadi. Lutfen Git kurulu oldugundan emin olun.
  pause
  exit /b 1
)

for /f "delims=" %%i in ('git branch --show-current 2^>nul') do set "BRANCH=%%i"
if not defined BRANCH (
  echo Aktif branch bulunamadi.
  pause
  exit /b 1
)

for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format ''yyyy-MM-dd HH:mm:ss''"') do set "STAMP=%%i"

git add -A
if errorlevel 1 (
  echo Dosyalar eklenemedi.
  pause
  exit /b 1
)

git diff --cached --quiet
if "%errorlevel%"=="0" (
  echo Degisiklik yok. Yine de GitHub'a push denenecek.
) else (
  git commit -m "Backup: %STAMP%"
  if errorlevel 1 (
    echo Commit olusturulamadi.
    pause
    exit /b 1
  )
)

git push origin %BRANCH%
if errorlevel 1 (
  echo Push basarisiz oldu.
  pause
  exit /b 1
)

echo GitHub yedegi tamamlandi.
timeout /t 3 >nul
exit /b 0
