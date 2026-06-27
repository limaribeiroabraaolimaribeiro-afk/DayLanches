#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "── Backup do PostgreSQL ──"
docker compose exec -T evolution-postgres \
  pg_dump -U "${POSTGRES_USER:-evolution}" "${POSTGRES_DB:-evolution}" \
  | gzip > "$BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"

echo "── Backup das configurações ──"
tar czf "$BACKUP_DIR/env_${TIMESTAMP}.tar.gz" .env Caddyfile docker-compose.yml 2>/dev/null || true

echo ""
echo "Backups salvos em $BACKUP_DIR/"
ls -lh "$BACKUP_DIR/"*"${TIMESTAMP}"*

echo ""
echo "Para restaurar o banco:"
echo "  gunzip -c $BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz | docker compose exec -T evolution-postgres psql -U evolution evolution"
