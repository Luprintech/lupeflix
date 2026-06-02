@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title LupeFlix - Actualizar NAS y redeploy

cls
echo ============================================================
echo  LupeFlix - Actualizar NAS desde GitHub y redeploy Docker
echo ============================================================
echo.
echo  Este lanzador ejecuta actualizar-lupeflix-git.sh con Git Bash.
echo  La ventana se quedara abierta al terminar para ver errores.
echo.

set "SCRIPT=%~dp0actualizar-lupeflix-git.sh"

if not exist "%SCRIPT%" (
  echo ERROR: No existe actualizar-lupeflix-git.sh junto a este BAT.
  goto :fail
)

set "BASH_EXE="
if exist "C:\Program Files\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files\Git\bin\bash.exe"
if exist "C:\Program Files\Git\usr\bin\bash.exe" set "BASH_EXE=C:\Program Files\Git\usr\bin\bash.exe"
if exist "C:\Program Files (x86)\Git\bin\bash.exe" set "BASH_EXE=C:\Program Files (x86)\Git\bin\bash.exe"

if "%BASH_EXE%"=="" (
  where bash >nul 2>nul
  if errorlevel 1 (
    echo ERROR: No se encontro Git Bash/bash en este equipo.
    echo Instala Git for Windows o ejecuta manualmente actualizar-lupeflix-git.sh desde Git Bash.
    goto :fail
  )
  set "BASH_EXE=bash"
)

echo ^> Ejecutando deploy con: %BASH_EXE%
echo.
"%BASH_EXE%" "%SCRIPT%"

if errorlevel 1 (
  echo.
  echo ERROR: Fallo la actualizacion/redeploy en el NAS.
  goto :fail
)

echo.
echo ============================================================
echo  LupeFlix actualizado correctamente.
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo  ERROR: La actualizacion fallo.
echo ============================================================
echo.
pause
exit /b 1
