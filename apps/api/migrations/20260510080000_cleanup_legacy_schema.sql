-- sqlx now owns migration bookkeeping; this table is a legacy Alembic remnant.
DROP TABLE IF EXISTS public.alembic_version;

-- `uq_project_profiles_post_id` already creates the same unique btree index.
DROP INDEX IF EXISTS public.ix_project_profiles_post_id;
