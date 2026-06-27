#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "── Baixando imagens atualizadas ──"
docker compose pull

echo "── Subindo stack ──"
docker compose up -d

echo "── Status dos containers ──"
docker compose ps

echo ""
echo "Deploy concluído!"
