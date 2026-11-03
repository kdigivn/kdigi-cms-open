#!/bin/sh
# KDIGI CMS container entrypoint: (1) make sure a PAYLOAD_SECRET exists, (2) apply database
# migrations, (3) optionally load the demo content, (4) start the server.
#
# Env switches:
#   PAYLOAD_SECRET   Your own secret (>= 32 chars). If unset, one is generated on first start and
#                    persisted in $DATA_DIR so sessions survive restarts.
#   SKIP_MIGRATIONS  "true" to skip `payload migrate` (e.g. migrations run in a separate release step).
#   SEED_DEMO        "true" to load the idempotent demo site + sample content after migrating.
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"

if [ -z "${PAYLOAD_SECRET:-}" ]; then
  secret_file="$DATA_DIR/payload-secret"
  if [ ! -s "$secret_file" ]; then
    mkdir -p "$DATA_DIR"
    umask 077
    node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('hex'))" > "$secret_file"
    echo "[kdigi] PAYLOAD_SECRET not set - generated one in $secret_file"
  fi
  PAYLOAD_SECRET="$(cat "$secret_file")"
  export PAYLOAD_SECRET
fi

if [ "${#PAYLOAD_SECRET}" -lt 32 ]; then
  echo "[kdigi] FATAL: PAYLOAD_SECRET must be at least 32 characters" >&2
  exit 1
fi

if [ "${SKIP_MIGRATIONS:-}" != "true" ]; then
  echo "[kdigi] applying database migrations..."
  node_modules/.bin/payload migrate
fi

if [ "${SEED_DEMO:-}" = "true" ]; then
  echo "[kdigi] loading demo content..."
  node --import tsx src/seed/seed-demo.ts
fi

exec "$@"
