#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

# Directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load environment variables from .env file if it exists
if [ -f "$PROJECT_ROOT/.env" ]; then
    # Export vars, ignoring comments and empty lines
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

# Set default values if not defined in .env
POSTGRES_DB=${POSTGRES_DB:-wheatbreeding}
POSTGRES_USER=${POSTGRES_USER:-wheatuser}
BACKUP_DIR=${BACKUP_DIR:-"$PROJECT_ROOT/backups"}
RETENTION_DAYS=${RETENTION_DAYS:-7}

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${POSTGRES_DB}_$TIMESTAMP.sql"

echo "=== [$(date)] Starting Database Backup ==="
echo "Target Database: $POSTGRES_DB"
echo "Backup File: $BACKUP_FILE.gz"

# Run pg_dump via docker-compose on the db container
# -T option is critical to avoid "the input device is not a TTY" error in cron/CI/headless sessions
if ! docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE"; then
    echo "ERROR: pg_dump failed! Backup aborted." >&2
    exit 1
fi

# Compress backup file
gzip "$BACKUP_FILE"
echo "Backup compressed successfully: $BACKUP_FILE.gz"

# Generate verification manifest
MANIFEST_FILE="$BACKUP_FILE.gz.manifest.json"
echo "Generating verification manifest..."
if ROW_COUNT=$(docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM germplasm_germplasm;" 2>/dev/null); then
    echo "{\"germplasm_count\": ${ROW_COUNT:-0}, \"timestamp\": \"$TIMESTAMP\"}" > "$MANIFEST_FILE"
    echo "Manifest saved: $MANIFEST_FILE"
else
    echo "WARNING: Failed to query live row count for manifest. Writing fallback manifest."
    echo "{\"germplasm_count\": 0, \"timestamp\": \"$TIMESTAMP\"}" > "$MANIFEST_FILE"
fi

# Clean up backups older than RETENTION_DAYS
echo "Cleaning up backups older than $RETENTION_DAYS days in $BACKUP_DIR..."
find "$BACKUP_DIR" -name "backup_${POSTGRES_DB}_*.sql.gz*" -type f -mtime +"$RETENTION_DAYS" -delete
echo "Cleanup completed."

echo "=== Backup Process Complete ==="
