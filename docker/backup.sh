#!/bin/sh
set -e
STAMP=$(date +%Y%m%d-%H%M%S)
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "/backups/cod-$STAMP.sql.gz"
# Retencion: 14 dias
find /backups -name 'cod-*.sql.gz' -mtime +14 -delete
echo "backup ok: cod-$STAMP.sql.gz"
