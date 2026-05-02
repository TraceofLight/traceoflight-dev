"""Filter and ordering builders for Post listing queries."""

from __future__ import annotations

from sqlalchemy import distinct, func, or_, select

from app.models.post import Post, PostContentKind, PostStatus, PostVisibility
from app.models.tag import Tag
from app.repositories.tag_repository import normalize_tag_slugs


class PostFilterBuilder:
    """Apply standard post-list filters and ordering to a SQLAlchemy stmt.

    The class is stateless; methods are kept here (instead of free
    functions) so the various callers (``PostRepository.list``,
    ``PostRepository.list_summaries``) share a single, named entrypoint.
    """

    @staticmethod
    def apply_filters(
        stmt,
        *,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        content_kind: PostContentKind | None = PostContentKind.BLOG,
        tags: list[str] | None = None,
        tag_match: str = "any",
        query: str | None = None,
    ):
        if status is not None:
            stmt = stmt.where(Post.status == status)
        if visibility is not None:
            stmt = stmt.where(Post.visibility == visibility)
        if content_kind is not None:
            stmt = stmt.where(Post.content_kind == content_kind)

        normalized_query = (query or "").strip()
        if normalized_query:
            pattern = f"%{normalized_query}%"
            stmt = stmt.where(
                or_(
                    Post.title.ilike(pattern),
                    Post.excerpt.ilike(pattern),
                )
            )

        normalized_tags = normalize_tag_slugs(tags or [])
        if normalized_tags:
            tag_stmt = (
                select(Post.id)
                .join(Post.tags)
                .where(Tag.slug.in_(normalized_tags))
                .group_by(Post.id)
            )
            if tag_match == "all":
                tag_stmt = tag_stmt.having(
                    func.count(distinct(Tag.slug)) == len(normalized_tags)
                )
            stmt = stmt.where(Post.id.in_(tag_stmt))

        return stmt

    @staticmethod
    def build_ordering(
        *,
        status: PostStatus | None = None,
        content_kind: PostContentKind | None = PostContentKind.BLOG,
        sort: str = "latest",
    ):
        if sort == "oldest":
            ordering = [
                Post.published_at.asc().nulls_last(),
                Post.created_at.asc(),
                Post.slug.asc(),
            ]
        elif sort == "title":
            ordering = [
                Post.title.asc(),
                Post.published_at.desc().nulls_last(),
                Post.created_at.desc(),
                Post.slug.asc(),
            ]
        else:
            ordering = [Post.created_at.desc(), Post.slug.desc()]
            if status == PostStatus.PUBLISHED:
                ordering = [
                    Post.published_at.desc().nulls_last(),
                    Post.created_at.desc(),
                    Post.slug.desc(),
                ]

        if content_kind == PostContentKind.PROJECT:
            return [
                Post.project_order_index.asc().nulls_last(),
                *ordering,
            ]
        return ordering
