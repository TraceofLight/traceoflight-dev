# Idempotent: ensures the test admin DB exists, EMPTY.
#
# Migrations are NOT applied here — #[sqlx::test(migrations = "./migrations")]
# creates a fresh per-test DB from template1 and applies migrations there
# (with its internal _sqlx_migrations tracking table). Pre-applying via psql
# would leave the tracking table missing and break the sqlx test runner.
#
# This script's only job is to make sure the DB pointed to by
# TEST_DATABASE_URL exists so sqlx-postgres has somewhere to connect.
$ErrorActionPreference = "Stop"

$AdminUrl = if ($env:DATABASE_URL_ADMIN) { $env:DATABASE_URL_ADMIN } else { $env:DATABASE_URL }
$TestUrl  = $env:TEST_DATABASE_URL

if (-not $AdminUrl) { throw "DATABASE_URL_ADMIN or DATABASE_URL must be set." }
if (-not $TestUrl)  { throw "TEST_DATABASE_URL must be set." }

$TestDb = ($TestUrl -replace '.*/([^/?]+).*', '$1')
$AdminBase = ($AdminUrl -replace '/[^/]+$', '/postgres')

# Drop and recreate so we always start with an empty DB. The handle is only
# used by sqlx::test as the admin connection for issuing CREATE/DROP on the
# per-test _sqlx_test_<uuid> clones; nothing should be holding open
# connections to it at this point.
Write-Host "Resetting database $TestDb..."
& psql $AdminBase -c "DROP DATABASE IF EXISTS `"$TestDb`""
& psql $AdminBase -c "CREATE DATABASE `"$TestDb`""

Write-Host "Test DB ready (empty): $TestUrl"
Write-Host "Migrations will be applied per-test by sqlx::test."
