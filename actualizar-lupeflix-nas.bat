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
set "COMPOSE_COMMAND=docker compose up -d --build"

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

if not exist ".env" (
  echo ERROR: No existe el archivo .env junto a este BAT.
  echo Sin .env Docker Compose no puede cargar la configuracion real.
  goto :fail
)

echo ^> Actualizando codigo en el NAS desde GitHub...
ssh -p %NAS_PORT% %NAS_TARGET% "set -e; APP_PATH='%NAS_PATH%'; REMOTE_URL='%REMOTE_URL%'; BRANCH='%BRANCH%'; TMP_PATH=\"/tmp/lupeflix-clone-$(date +%%Y%%m%%d%%H%%M%%S)\"; if [ -d \"$APP_PATH/.git\" ]; then cd \"$APP_PATH\"; git fetch origin \"$BRANCH\"; git reset --hard \"origin/$BRANCH\"; else rm -rf \"$TMP_PATH\"; git clone --branch \"$BRANCH\" \"$REMOTE_URL\" \"$TMP_PATH\"; if [ -d \"$APP_PATH\" ]; then backup_path=\"$APP_PATH.backup.$(date +%%Y%%m%%d%%H%%M%%S)\"; mv \"$APP_PATH\" \"$backup_path\"; echo \"Existing app folder moved to: $backup_path\"; fi; mv \"$TMP_PATH\" \"$APP_PATH\"; fi"
if errorlevel 1 (
  echo ERROR: No se pudo actualizar el codigo en el NAS.
  goto :fail
)

echo.
echo ^> Copiando .env al NAS sin scp...
type ".env" | ssh -p %NAS_PORT% %NAS_TARGET% "tr -d '\r' > '%NAS_PATH%/.env'"
if errorlevel 1 (
  echo ERROR: No se pudo copiar .env al NAS por SSH.
  goto :fail
)

echo.
echo ^> Ejecutando Docker Compose en el NAS...
ssh -p %NAS_PORT% %NAS_TARGET% "set -e; cd '%NAS_PATH%'; %COMPOSE_COMMAND%; echo; echo 'LupeFlix status:'; docker compose ps; echo; echo 'Healthcheck:'; if command -v curl >/dev/null 2>&1; then curl -fsS http://127.0.0.1:3030/api/health || true; else wget -qO- http://127.0.0.1:3030/api/health || true; fi; echo"
if errorlevel 1 (
  echo ERROR: Docker Compose fallo en el NAS.
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
