#!/usr/bin/env bash
cd "$(dirname "$0")/.."

echo "── Logs da Evolution API (Ctrl+C para sair) ──"
docker compose logs -f evolution-api
