#!/usr/bin/env bash
set -euo pipefail

# Directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load env variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -n1)
CHECK_DB="wheatbreeding_restore_check"

if [ -z "$LATEST_BACKUP" ]; then
  echo "FAIL: No backup file found in $BACKUP_DIR"
  exit 1
fi

echo "Verifying backup: $LATEST_BACKUP"

# Find sibling manifest
MANIFEST_FILE="${LATEST_BACKUP}.manifest.json"
EXPECTED_COUNT=1
if [ -f "$MANIFEST_FILE" ]; then
  echo "Found manifest: $MANIFEST_FILE"
  # Read count from JSON using grep/sed to avoid dependency on jq
  EXPECTED_COUNT=$(grep -o '"germplasm_count": *[0-9]*' "$MANIFEST_FILE" | grep -o '[0-9]*' || echo "1")
  echo "Expected germplasm rows: $EXPECTED_COUNT"
else
  echo "WARNING: Sibling manifest not found. Defaulting minimum verification count to 1."
fi

# Ensure test DB is clean
docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec -T db \
  dropdb -U postgres --if-exists "$CHECK_DB" 2>/dev/null || true
docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec -T db \
  createdb -U postgres "$CHECK_DB"

# Restore database
echo "Restoring backup into throwaway database..."
gunzip -c "$LATEST_BACKUP" | \
  docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec -T db \
  psql -U postgres "$CHECK_DB" >/dev/null

# Query count
ROW_COUNT=$(docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec -T db \
  psql -U postgres "$CHECK_DB" -tAc "SELECT COUNT(*) FROM germplasm_germplasm;" 2>/dev/null || echo "0")

# Drop check DB
docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec -T db \
  dropdb -U postgres "$CHECK_DB"

if [ "$ROW_COUNT" -lt "$EXPECTED_COUNT" ]; then
  echo "FAIL: restored database has $ROW_COUNT germplasm rows, but expected at least $EXPECTED_COUNT."
  exit 1
fi

echo "OK: restore verified, $ROW_COUNT germplasm rows present."
