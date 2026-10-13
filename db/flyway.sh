#!/usr/bin/env bash
# Usage: db/flyway.sh <info|migrate|validate|baseline ...>  (reads DB_* from .env; DB_HOST must be reachable from host network)
set -euo pipefail
cd "$(dirname "$0")/.."
g() { grep -E "^$1[[:space:]]*=" .env | head -1 | cut -d= -f2- | tr -d ' \r'; }
HOST=$(g DB_HOST); [ "$HOST" = localhost ] && HOST=127.0.0.1
exec docker run --rm --network host \
  -v "$PWD/db/migrations:/flyway/sql:ro" -v "$PWD/db/flyway.conf:/flyway/conf/flyway.conf:ro" \
  flyway/flyway:11 -url="jdbc:postgresql://$HOST:$(g DB_PORT)/$(g DB_NAME)" \
  -user="$(g DB_SQL_USER)" -password="$(g DB_SQL_PASS)" "$@"
