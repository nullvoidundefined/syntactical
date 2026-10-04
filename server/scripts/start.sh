#!/bin/sh
# The image's start command: apply migrations, then run the server. A failed migration stops the
# start (set -e), so the new server never takes traffic on an old schema. The server is exec'd so
# it replaces this shell and receives SIGTERM directly.
#
# node-pg-migrate reads the URL as given, so DATABASE_MIGRATION_URL (or DATABASE_URL when that is
# the one used) must be a private-network host or carry sslmode=verify-full.
set -eu

migration_url="${DATABASE_MIGRATION_URL:-${DATABASE_URL:?DATABASE_URL must be set}}"
DATABASE_URL="$migration_url" ../node_modules/.bin/node-pg-migrate up
exec node dist/index.js
