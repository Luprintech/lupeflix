@echo off
setlocal

cd /d "%~dp0"
title LupeFlix - Actualizar NAS y redeploy

echo ============================================================
echo  LupeFlix - Actualizar NAS desde GitHub y redeploy Docker
echo ============================================================
echo.
echo  NAS:     lupe@192.168.1.91:91
echo  Carpeta: /volume1/docker/lupeflix
echo  Repo:    https://github.com/Luprintech/lupeflix.git
echo.
echo  Esta ventana se quedara abierta al terminar para que puedas
echo  ver errores, estado del contenedor y healthcheck.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-nas.ps1"

set EXIT_CODE=%ERRORLEVEL%
echo.
echo ============================================================
if "%EXIT_CODE%"=="0" (
  echo  LupeFlix actualizado correctamente.
) else (
  echo  ERROR: La actualizacion fallo con codigo %EXIT_CODE%.
)
echo ============================================================
echo.
pause
exit /b %EXIT_CODE%
