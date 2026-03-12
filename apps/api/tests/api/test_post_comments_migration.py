from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


def _load_migration_module():  # type: ignore[no-untyped-def]
    migration_path = (
        Path(__file__).resolve().parents[2]
        / "alembic"
        / "versions"
        / "20260313_0010_add_post_comments.py"
    )
    spec = importlib.util.spec_from_file_location("post_comments_migration", migration_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_post_comments_migration_uses_idempotent_postgres_enum_columns(monkeypatch) -> None:
    migration = _load_migration_module()
    captured_columns: list[sa.Column] = []

    monkeypatch.setattr(migration.op, "get_bind", lambda: object())
    monkeypatch.setattr(sa.Enum, "create", lambda self, bind, checkfirst=False: None)
    monkeypatch.setattr(postgresql.ENUM, "create", lambda self, bind, checkfirst=False: None)
    monkeypatch.setattr(
        migration.op,
        "create_table",
        lambda table_name, *columns, **kwargs: captured_columns.extend(columns),
    )
    monkeypatch.setattr(migration.op, "create_index", lambda *args, **kwargs: None)

    migration.upgrade()

    enum_columns = {
        column.name: column.type
        for column in captured_columns
        if isinstance(column, sa.Column) and column.name in {"author_type", "visibility", "status"}
    }

    assert set(enum_columns) == {"author_type", "visibility", "status"}
    for enum_type in enum_columns.values():
        assert isinstance(enum_type, postgresql.ENUM)
        assert enum_type.create_type is False
