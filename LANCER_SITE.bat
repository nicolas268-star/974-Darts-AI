@echo off
setlocal
cd /d "%~dp0"

if not exist ".env.local" (
  echo ERREUR : .env.local absent.
  pause
  exit /b 1
)

start "974 Darts AI - FastAPI" cmd /k call "%~dp0LANCER_BACKEND.bat"
timeout /t 3 /nobreak >nul

echo Demarrage de Next.js...
echo Backend : http://127.0.0.1:8000/health
echo Site : http://localhost:3000
call npm run dev
pause
