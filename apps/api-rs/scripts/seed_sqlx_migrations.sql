-- One-shot seed for the existing live database. Run this BEFORE deploying
-- the api-rs binary that wires `sqlx::migrate!()`. It pre-records the
-- 20260507000000_initial_schema migration as already applied so the
-- migrator treats the alembic-built schema as the seed line and skips
-- re-running it. Future migrations apply normally on top.
--
-- Idempotent: safe to run multiple times. ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMPTZ NOT NULL DEFAULT now(),
    success BOOLEAN NOT NULL,
    checksum BYTEA NOT NULL,
    execution_time BIGINT NOT NULL
);

INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
VALUES (
    20260507000000,
    'initial_schema',
    true,
    decode('7e99aeb1d90e54a640ce98545bb33fc321e81f59eaef9ebbad175fefbb028072f21e6b3735b5baaca8117892dc824387', 'hex'),
    0
)
ON CONFLICT (version) DO NOTHING;
