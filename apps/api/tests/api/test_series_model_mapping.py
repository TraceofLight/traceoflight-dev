from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models import post, series  # noqa: F401


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    return session_factory()


def test_series_tables_and_uniques_exist() -> None:
    _build_session()

    assert "series" in Base.metadata.tables
    assert "series_posts" in Base.metadata.tables

    series_table = Base.metadata.tables["series"]
    series_posts_table = Base.metadata.tables["series_posts"]

    constraint_unique_sets = {
        tuple(sorted(constraint.columns.keys()))
        for constraint in series_table.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    }
    index_unique_sets = {
        tuple(sorted(index.columns.keys()))
        for index in series_table.indexes
        if index.unique
    }
    assert ("slug",) in (constraint_unique_sets | index_unique_sets)

    mapping_unique_sets = {
        tuple(sorted(constraint.columns.keys()))
        for constraint in series_posts_table.constraints
        if constraint.__class__.__name__ == "UniqueConstraint"
    }
    assert ("post_id",) in mapping_unique_sets
    assert ("order_index", "series_id") in mapping_unique_sets
