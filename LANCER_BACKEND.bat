@echo off
setlocal
cd /d "%~dp0"
if not exist ".env.local" (
  echo .env.local absent.
  pause
  exit /b 1
)
if not exist "backend\.venv\Scripts\python.exe" (
  echo Backend non installe. Lance INSTALLER_WINDOWS.bat.
  pause
  exit /b 1
)
call backend\.venv\Scripts\activate.bat
set PYTHONPATH=%CD%\backend
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload --env-file .env.local
pause
