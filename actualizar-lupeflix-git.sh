#!/bin/bash

# ========= CONFIG =========
SSH_USER="lupe"
SSH_HOST="192.168.1.91"
SSH_PORT="91"

PROJECT_DIR="/volume1/docker/lupeflix"
BRANCH="main"
# ==========================

echo "========================================"
echo "🚀 Conectando al Synology..."
echo "========================================"

ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" << EOF

set -e

echo "========================================"
echo "🧠 Conectado al Synology"
echo "📁 Entrando en proyecto..."
echo "========================================"

cd "$PROJECT_DIR" || {
    echo "❌ No existe la carpeta del proyecto: $PROJECT_DIR"
    exit 1
}

# Comprobar repo
if [ ! -d ".git" ]; then
    echo "❌ No es un repositorio git: $PROJECT_DIR"
    exit 1
fi

# Comprobar .env
if [ ! -f ".env" ]; then
    echo "❌ Falta .env en $PROJECT_DIR"
    exit 1
fi

# Docker en Synology no siempre está en PATH en sesiones SSH no interactivas.
DOCKER=""
for candidate in \
    /usr/local/bin/docker \
    /var/packages/ContainerManager/target/usr/bin/docker \
    /volume1/@appstore/ContainerManager/usr/bin/docker \
    docker
 do
    if command -v "\$candidate" >/dev/null 2>&1 || [ -x "\$candidate" ]; then
        DOCKER="\$candidate"
        break
    fi
done

if [ -z "\$DOCKER" ]; then
    echo "❌ Docker no encontrado en el NAS"
    exit 1
fi

echo "🐳 Docker detectado: \$DOCKER"

echo "📥 Descargando últimos cambios..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

if [ \$? -ne 0 ]; then
    echo "❌ Error actualizando Git"
    exit 1
fi

echo "🐳 Reconstruyendo contenedores..."
"\$DOCKER" compose up -d --build

if [ \$? -ne 0 ]; then
    echo "❌ Error en docker compose"
    exit 1
fi

echo "🧹 Limpiando imágenes..."
"\$DOCKER" image prune -f

echo "📋 Estado:"
"\$DOCKER" compose ps

echo "🏥 Healthcheck:"
if command -v curl >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:3030/api/health || true
else
    wget -qO- http://127.0.0.1:3030/api/health || true
fi

echo "========================================"
echo "✅ Deploy completado correctamente"
echo "========================================"

EOF
