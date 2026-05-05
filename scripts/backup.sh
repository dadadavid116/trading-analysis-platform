#!/usr/bin/env sh
# backup.sh — Daily PostgreSQL backup with 7-day retention.
#
# Runs inside a lightweight container that shares the database network.
# Dumps are written to /backups (mounted as a named Docker volume).
#
# Environment variables (passed from docker-compose.prod.yml):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
#
# To restore a backup manually:
#   docker compose -f docker-compose.prod.yml exec db \
#     psql -U $POSTGRES_USER -d $POSTGRES_DB < /backups/trading_db_YYYY-MM-DD.sql

set -e

BACKUP_DIR="/backups"
DATE=$(date +%Y-%m-%d)
FILE="${BACKUP_DIR}/trading_db_${DATE}.sql"

echo "[backup] Starting dump → ${FILE}"
pg_dump \
  -h "${PGHOST:-db}" \
  -p "${PGPORT:-5432}" \
  -U "${PGUSER}" \
  -d "${PGDATABASE}" \
  --no-password \
  -f "${FILE}"

echo "[backup] Dump complete. Removing backups older than 7 days..."
find "${BACKUP_DIR}" -name "trading_db_*.sql" -mtime +7 -delete

echo "[backup] Done. Current backups:"
ls -lh "${BACKUP_DIR}"/trading_db_*.sql 2>/dev/null || echo "(none)"
