#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "── Reiniciando stack ──"
docker compose restart

echo "── Status ──"
docker compose ps
