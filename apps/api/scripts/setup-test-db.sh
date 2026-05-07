#!/usr/bin/env bash
# Idempotent: ensures the test admin DB exists, EMPTY.
#
# Migrations are NOT applied here — `#[sqlx::test(migrations = "./migrations")]`
# creates a fresh per-test DB from `template1` and applies migrations there
# (along with the internal `_sqlx_migrations` tracking table). Pre-applying
# migrations via `psql -f` would leave the tracking table missing and break
# the sqlx test runner with `relation "_sqlx_migrations" does not exist`.
#
# This script's only job is to make sure the DB pointed to by
# TEST_DATABASE_URL exists so sqlx-postgres has somewhere to connect.
set -euo pipefail

ADMIN_URL="${DATABASE_URL_ADMIN:-${DATABASE_URL:-}}"
TEST_URL="${TEST_DATABASE_URL:-}"

if [ -z "$ADMIN_URL" ]; then
  echo "ERROR: DATABASE_URL_ADMIN or DATABASE_URL must be set." >&2
  exit 1
fi
if [ -z "$TEST_URL" ]; then
  echo "ERROR: TEST_DATABASE_URL must be set (e.g., postgres://traceoflight:pw@localhost:5432/traceoflight_test)." >&2
  exit 1
fi

# Extract the DB name from TEST_URL (everything after the final slash, ignoring query string).
TEST_DB="$(echo "$TEST_URL" | sed -E 's#.*/([^/?]+).*#\1#')"

# psql is invoked against the admin URL; we connect to the postgres maintenance DB
# to issue CREATE DATABASE if needed.
ADMIN_BASE="${ADMIN_URL%/*}/postgres"

# Drop and recreate so we always start with an empty DB. The handle is only
# used by sqlx::test as the admin connection for issuing CREATE/DROP on the
# per-test `_sqlx_test_<uuid>` clones; nothing should be holding open
# connections to it at this point.
echo "Resetting database $TEST_DB..."
psql "$ADMIN_BASE" -c "DROP DATABASE IF EXISTS \"$TEST_DB\""
psql "$ADMIN_BASE" -c "CREATE DATABASE \"$TEST_DB\""

echo "Test DB ready (empty): $TEST_URL"
echo "Migrations will be applied per-test by sqlx::test."
