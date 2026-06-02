@echo off
setlocal EnableExtensions

cd /d "%~dp0"
title LupeFlix - Actualizar NAS y redeploy

set "NAS_USER=lupe"
set "NAS_HOST=192.168.1.91"
set "NAS_PORT=91"
set "NAS_TARGET=%NAS_USER%@%NAS_HOST%"
set "NAS_PATH=/volume1/docker/lupeflix"
set "REMOTE_URL=https://github.com/Luprintech/lupeflix.git"
set "BRANCH=main"

cls
echo ============================================================
echo  LupeFlix - Actualizar NAS desde GitHub y redeploy Docker
echo ============================================================
echo.
echo  NAS:     %NAS_TARGET%:%NAS_PORT%
echo  Carpeta: %NAS_PATH%
echo  Repo:    %REMOTE_URL%
echo.
echo  Esta ventana se quedara abierta al terminar para que puedas
echo  ver errores, estado del contenedor y healthcheck.
echo.

where ssh >nul 2>nul
if errorlevel 1 (
  echo ERROR: No se encontro ssh en este equipo.
  goto :fail
)

echo ^> Descargando ultimos cambios de GitHub y haciendo redeploy en el NAS...
ssh -p %NAS_PORT% %NAS_TARGET% "set -e; APP_PATH='%NAS_PATH%'; REMOTE_URL='%REMOTE_URL%'; BRANCH='%BRANCH%'; DOCKER=''; for p in /usr/local/bin/docker /var/packages/ContainerManager/target/usr/bin/docker /volume1/@appstore/ContainerManager/usr/bin/docker docker; do if command -v \"$p\" >/dev/null 2>&1 || [ -x \"$p\" ]; then DOCKER=\"$p\"; break; fi; done; if [ -z \"$DOCKER\" ]; then echo 'ERROR: docker no encontrado en el NAS'; exit 1; fi; if [ ! -d \"$APP_PATH/.git\" ]; then echo 'ERROR: La carpeta no es un repo Git: '$APP_PATH; echo 'Clonalo una vez en el NAS o borra la carpeta para permitir clone.'; exit 1; fi; cd \"$APP_PATH\"; git fetch origin \"$BRANCH\"; git reset --hard \"origin/$BRANCH\"; if [ ! -f .env ]; then echo 'ERROR: Falta .env en '$APP_PATH; exit 1; fi; \"$DOCKER\" compose up -d --build; echo; echo 'LupeFlix status:'; \"$DOCKER\" compose ps; echo; echo 'Healthcheck:'; if command -v curl >/dev/null 2>&1; then curl -fsS http://127.0.0.1:3030/api/health || true; else wget -qO- http://127.0.0.1:3030/api/health || true; fi; echo"
if errorlevel 1 (
  echo ERROR: Fallo la actualizacion/redeploy en el NAS.
  goto :fail
)

echo.
echo ============================================================
echo  LupeFlix actualizado correctamente.
echo  URL local: http://%NAS_HOST%:3030
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
