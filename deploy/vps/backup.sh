#!/usr/bin/env bash
# backup.sh — pg_dump medprom harian → gzip, retensi 14 hari.
# Dipanggil cron di host VPS:
#   30 3 * * * /opt/medprom/deploy/vps/backup.sh >> /var/log/medprom-backup.log 2>&1
# (03:30 WIB — digeser 30 menit dari backup app event 03:00 agar tidak berebut I/O.)
# Restore:
#   gunzip -c /opt/medprom/backups/medprom_<ts>.sql.gz \
#     | docker compose -f /opt/medprom/deploy/vps/docker-compose.yml exec -T postgres \
#         psql -U medprom -d medprom
set -euo pipefail
BACKUP_DIR=/opt/medprom/backups
COMPOSE_DIR=/opt/medprom/deploy/vps
KEEP=14
mkdir -p "$BACKUP_DIR"
ts="$(date +%Y%m%d_%H%M%S)"
out="$BACKUP_DIR/medprom_${ts}.sql.gz"
docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U medprom -d medprom --no-owner --no-privileges \
  | gzip -9 > "$out.tmp.gz"
mv "$out.tmp.gz" "$out"
# Validitas arsip (gzip rusak → gagal)
gunzip -t "$out"
size=$(du -h "$out" | cut -f1)
echo "$(date -Is) backup OK: $out ($size)"
# Rotasi: sisakan $KEEP terbaru
ls -1t "$BACKUP_DIR"/medprom_*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
