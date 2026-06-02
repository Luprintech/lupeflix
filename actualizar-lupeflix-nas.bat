@echo off
cd /d "C:\Users\guada\Desktop\PROYECTOS WEB\lupeflix"

echo.
echo ==============================================
echo   LupeFlix - Deploy al NAS
echo ==============================================
echo.

echo [1/2] Subiendo cambios a GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo ERROR: Fallo al hacer push a GitHub
    pause
    exit /b 1
)

echo.
echo [2/2] Desplegando en el NAS...
echo.

ssh -p 91 lupe@192.168.1.91 "cd /volume1/docker/lupeflix && git restore . && git pull origin main && if [ ! -f .env ]; then echo ERROR: Falta .env en /volume1/docker/lupeflix; exit 1; fi && /usr/local/bin/docker compose down && /usr/local/bin/docker compose build --no-cache && /usr/local/bin/docker compose up -d && /usr/local/bin/docker compose ps && /usr/local/bin/docker compose logs lupeflix --tail 20"

if %errorlevel% neq 0 (
    echo ERROR: Fallo el deploy en el NAS
    pause
    exit /b 1
)

echo.
echo ==============================================
echo   Listo! https://lupeflix.luprintech.com
echo ==============================================
echo.
pause
