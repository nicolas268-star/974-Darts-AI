@echo off
setlocal
cd /d "%~dp0"
call npm run build
if errorlevel 1 pause
call backend\.venv\Scripts\activate.bat
set PYTHONPATH=%CD%\backend
python -m compileall backend\app
pause
