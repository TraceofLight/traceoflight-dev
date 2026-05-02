from __future__ import annotations

from sqlalchemy import select

from app.models.post import Post, PostContentKind, PostStatus, PostVisibility
from app.repositories.posts.filters import PostFilterBuilder


def _where_sql(stmt) -> str:  # type: ignore[no-untyped-def]
    """Return only the compiled WHERE clause, not the full SELECT."""
    where = stmt.whereclause
    if where is None:
        return ""
    return str(where.compile(compile_kwargs={"literal_binds": True}))


def test_apply_filters_no_args_only_emits_default_content_kind() -> None:
    stmt = select(Post)
    out = PostFilterBuilder.apply_filters(stmt)
    where = _where_sql(out)
    assert "posts.content_kind" in where
    assert "'blog'" in where
    assert "posts.status" not in where
    assert "posts.visibility" not in where


def test_apply_filters_status_and_visibility_emit_where() -> None:
    stmt = select(Post)
    out = PostFilterBuilder.apply_filters(
        stmt,
        status=PostStatus.PUBLISHED,
        visibility=PostVisibility.PUBLIC,
        content_kind=None,
    )
    where = _where_sql(out)
    assert "posts.status" in where and "'published'" in where
    assert "posts.visibility" in where and "'public'" in where


def test_apply_filters_query_emits_case_insensitive_or_clause() -> None:
    stmt = select(Post)
    out = PostFilterBuilder.apply_filters(stmt, query="  hello  ", content_kind=None)
    where = _where_sql(out).lower()
    # SQLAlchemy renders ILIKE as `lower(x) like lower(y)` for the default dialect.
    assert "lower(posts.title)" in where
    assert "lower(posts.excerpt)" in where
    assert "%hello%" in where
    assert " or " in where


def test_apply_filters_blank_query_is_ignored() -> None:
    stmt = select(Post)
    out = PostFilterBuilder.apply_filters(stmt, query="   ", content_kind=None)
    where = _where_sql(out).lower()
    assert "%   %" not in where
    assert "lower(posts.title)" not in where


def test_apply_filters_tags_any_emits_subquery_without_having() -> None:
    stmt = select(Post)
    out = PostFilterBuilder.apply_filters(
        stmt,
        tags=["python", "rust"],
        tag_match="any",
        content_kind=None,
    )
    where = _where_sql(out).lower()
    assert "tags.slug in" in where
    assert "having" not in where


def test_apply_filters_tags_all_emits_having_count() -> None:
    stmt = select(Post)
    out = PostFilterBuilder.apply_filters(
        stmt,
        tags=["python", "rust"],
        tag_match="all",
        content_kind=None,
    )
    where = _where_sql(out).lower()
    assert "having" in where
    assert "count" in where


def test_build_ordering_default_is_created_at_desc() -> None:
    ordering = PostFilterBuilder.build_ordering()
    rendered = [str(expr) for expr in ordering]
    assert any("posts.created_at" in s and "DESC" in s for s in rendered)
    assert any("posts.slug" in s for s in rendered)


def test_build_ordering_published_status_prefers_published_at() -> None:
    ordering = PostFilterBuilder.build_ordering(status=PostStatus.PUBLISHED)
    rendered = [str(expr) for expr in ordering]
    assert "posts.published_at" in rendered[0]
    assert "DESC" in rendered[0]


def test_build_ordering_oldest_uses_ascending() -> None:
    ordering = PostFilterBuilder.build_ordering(sort="oldest")
    rendered = [str(expr) for expr in ordering]
    assert "posts.published_at" in rendered[0]
    assert "ASC" in rendered[0]


def test_build_ordering_title_starts_with_title() -> None:
    ordering = PostFilterBuilder.build_ordering(sort="title")
    rendered = [str(expr) for expr in ordering]
    assert "posts.title" in rendered[0]
    assert "ASC" in rendered[0]


def test_build_ordering_project_kind_prepends_project_order_index() -> None:
    ordering = PostFilterBuilder.build_ordering(content_kind=PostContentKind.PROJECT)
    rendered = [str(expr) for expr in ordering]
    assert "posts.project_order_index" in rendered[0]
    assert "ASC" in rendered[0]
