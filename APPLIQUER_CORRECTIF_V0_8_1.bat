@echo off
setlocal
cd /d "%~dp0"

echo ===============================================
echo Correctif 974 Darts AI v0.8.1
echo Pagination Supabase au-dela de 1000 legs
echo ===============================================
echo.

if not exist "backend\app\publisher.py" (
  echo ERREUR : ce patch doit etre copie a la racine du projet v0.8.
  echo Place ces fichiers a cote de package.json puis relance.
  pause
  exit /b 1
)

if exist "backend\.venv\Scripts\python.exe" (
  backend\.venv\Scripts\python.exe apply_patch_v0_8_1.py
) else (
  python apply_patch_v0_8_1.py
)

if errorlevel 1 (
  echo.
  echo Le correctif n'a pas pu etre applique.
  pause
  exit /b 1
)

echo.
echo Correctif termine.
echo Ferme puis relance FastAPI avant de republier.
pause
