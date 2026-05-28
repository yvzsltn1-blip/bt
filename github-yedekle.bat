@echo off
setlocal

cd /d "%~dp0"

echo ========================================
echo GitHub yedekleme baslatiliyor...
echo Klasor: %cd%
echo ========================================
echo.

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

echo Aktif branch: %BRANCH%

for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format ''yyyy-MM-dd HH:mm:ss''"') do set "STAMP=%%i"

echo.
echo Degisiklikler hazirlaniyor...
git add -A
if errorlevel 1 (
  echo Dosyalar eklenemedi.
  pause
  exit /b 1
)

echo _web-disi/local-backups commit disi birakiliyor...
git reset HEAD -- "_web-disi/local-backups" >nul 2>nul

git diff --cached --quiet
if "%errorlevel%"=="0" (
  echo Commitlenecek degisiklik yok. Yine de push denenecek.
) else (
  echo Commit olusturuluyor...
  git commit -m "Backup: %STAMP%"
  if errorlevel 1 (
    echo Commit olusturulamadi.
    pause
    exit /b 1
  )
)

echo.
echo GitHub'a yukleme basliyor...
git push origin %BRANCH%
if errorlevel 1 (
  echo Push basarisiz oldu.
  pause
  exit /b 1
)

echo.
echo GitHub yedegi tamamlandi.
echo Pencereyi kapatmak icin bir tusa basin.
pause >nul
exit /b 0
