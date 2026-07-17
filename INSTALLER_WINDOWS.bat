@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo Installation 974 Darts AI Web v0.8
echo ==========================================

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS est requis.
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.11 ou plus recent est requis.
  pause
  exit /b 1
)

if not exist ".env.local" (
  copy ".env.example" ".env.local"
  echo.
  echo IMPORTANT : complete maintenant .env.local avant de lancer le site.
)

echo Installation Next.js...
call npm install
if errorlevel 1 goto :error

echo Installation FastAPI...
if not exist "backend\.venv\Scripts\python.exe" python -m venv backend\.venv
call backend\.venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
if errorlevel 1 goto :error

echo.
echo Installation terminee.
pause
exit /b 0

:error
echo Installation interrompue par une erreur.
pause
exit /b 1
