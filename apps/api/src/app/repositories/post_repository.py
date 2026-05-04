from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import delete, distinct, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, load_only, selectinload

from app.core.text import normalize_optional_text, normalize_slug_list
from app.models.post import (
    Post,
    PostContentKind,
    PostLocale,
    PostStatus,
    PostVisibility,
)
from app.models.project_profile import ProjectProfile
from app.models.tag import Tag
from app.repositories.posts.filters import PostFilterBuilder
from app.repositories.posts.serializer import (
    DEFAULT_WORDS_PER_MINUTE,
    PostSerializerService,
    format_reading_label,
)
from app.repositories.posts.series_context import SeriesContextService
from app.repositories.tag_repository import normalize_tag_slugs
from app.schemas.post import PostCreate

__all__ = [
    "DEFAULT_WORDS_PER_MINUTE",
    "PostRepository",
]


class PostRepository:
    """CRUD entrypoints for Post rows.

    Filtering, ordering, series-context attachment and summary
    serialization were extracted into focused helpers under
    ``app.repositories.posts``.
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self._series_context = SeriesContextService(db)

    # --- internal helpers -------------------------------------------------
    def _attach_series_context(self, post: Post, public_only: bool) -> None:
        self._series_context.attach(post, public_only=public_only)

    def _apply_series_context(self, posts: list[Post], public_only: bool) -> list[Post]:
        return self._series_context.apply(posts, public_only=public_only)

    # --- list endpoints ---------------------------------------------------
    def list(
        self,
        limit: int = 20,
        offset: int = 0,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        content_kind: PostContentKind | None = PostContentKind.BLOG,
        tags: list[str] | None = None,
        tag_match: str = "any",
        locale: PostLocale | None = None,
    ) -> list[Post]:
        ordering = PostFilterBuilder.build_ordering(
            status=status,
            content_kind=content_kind,
        )

        stmt = (
            select(Post)
            .options(
                selectinload(Post.tags),
                selectinload(Post.project_profile),
                selectinload(Post.comments),
            )
            .order_by(*ordering)
        )
        stmt = PostFilterBuilder.apply_filters(
            stmt,
            status=status,
            visibility=visibility,
            content_kind=content_kind,
            tags=tags,
            tag_match=tag_match,
        )
        if locale is not None:
            stmt = stmt.where(Post.locale == locale)
        stmt = stmt.limit(limit).offset(offset)
        rows = list(self.db.scalars(stmt))
        public_only = status == PostStatus.PUBLISHED and visibility == PostVisibility.PUBLIC
        return self._apply_series_context(rows, public_only=public_only)

    # --- list_summaries helpers (BE-5) ----------------------------------
    _SUMMARY_LOAD_COLUMNS = (
        "id",
        "slug",
        "title",
        "excerpt",
        "body_markdown",
        "cover_image_url",
        "top_media_kind",
        "top_media_image_url",
        "top_media_youtube_url",
        "top_media_video_url",
        "series_title",
        "content_kind",
        "status",
        "visibility",
        "published_at",
        "created_at",
        "updated_at",
    )

    def _summary_base_stmt(self, *, ordering):
        load_columns = [getattr(Post, name) for name in self._SUMMARY_LOAD_COLUMNS]
        return (
            select(Post)
            .options(
                load_only(*load_columns),
                selectinload(Post.tags),
                selectinload(Post.comments),
            )
            .order_by(*ordering)
        )

    def _fetch_summary_rows(
        self,
        *,
        ordering,
        limit: int,
        offset: int,
        filters: dict[str, object],
    ) -> tuple[list[Post], int]:
        stmt = PostFilterBuilder.apply_filters(
            self._summary_base_stmt(ordering=ordering), **filters
        )
        rows = list(self.db.scalars(stmt.limit(limit).offset(offset)))

        count_subquery = PostFilterBuilder.apply_filters(
            select(Post.id), **filters
        ).subquery()
        total_count = int(
            self.db.scalar(select(func.count()).select_from(count_subquery)) or 0
        )
        return rows, total_count

    def _fetch_tag_filters(
        self, *, filters: dict[str, object]
    ) -> list[dict[str, object]]:
        # Tag filters intentionally ignore ``tags`` / ``tag_match`` so the
        # tag-bar count doesn't shrink to the currently-selected filter.
        tag_filter_inputs = {
            key: value
            for key, value in filters.items()
            if key not in {"tags", "tag_match"}
        }
        tag_stmt = (
            select(Tag.slug, func.count(distinct(Post.id)))
            .select_from(Post)
            .join(Post.tags)
        )
        tag_stmt = PostFilterBuilder.apply_filters(tag_stmt, **tag_filter_inputs)
        tag_stmt = tag_stmt.group_by(Tag.slug).order_by(Tag.slug.asc())
        return [
            {"slug": slug, "count": int(count)}
            for slug, count in self.db.execute(tag_stmt)
        ]

    def _fetch_visibility_counts(
        self,
        *,
        filters: dict[str, object],
        include_private: bool,
    ) -> dict[str, int]:
        scoped_filters = dict(filters)
        scoped_filters["visibility"] = (
            None if include_private else PostVisibility.PUBLIC
        )
        stmt = PostFilterBuilder.apply_filters(
            select(Post.visibility, func.count(distinct(Post.id)))
            .select_from(Post)
            .group_by(Post.visibility),
            **scoped_filters,
        )
        visibility_counts = {"all": 0, "public": 0, "private": 0}
        for raw_visibility, count in self.db.execute(stmt):
            key = "private" if raw_visibility == PostVisibility.PRIVATE else "public"
            visibility_counts[key] = int(count)
        visibility_counts["all"] = (
            visibility_counts["public"] + visibility_counts["private"]
        )
        return visibility_counts

    def list_summaries(
        self,
        limit: int = 20,
        offset: int = 0,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        content_kind: PostContentKind | None = PostContentKind.BLOG,
        tags: list[str] | None = None,
        tag_match: str = "any",
        query: str | None = None,
        sort: str = "latest",
        include_tag_filters: bool = True,
        include_private_visibility_counts: bool = False,
        locale: PostLocale | None = None,
    ) -> dict[str, object]:
        ordering = PostFilterBuilder.build_ordering(
            status=status,
            content_kind=content_kind,
            sort=sort,
        )
        filters: dict[str, object] = {
            "status": status,
            "visibility": visibility,
            "content_kind": content_kind,
            "tags": tags,
            "tag_match": tag_match,
            "query": query,
            "locale": locale,
        }

        rows, total_count = self._fetch_summary_rows(
            ordering=ordering,
            limit=limit,
            offset=offset,
            filters=filters,
        )
        next_offset = offset + len(rows) if offset + len(rows) < total_count else None

        tag_filters = (
            self._fetch_tag_filters(filters=filters) if include_tag_filters else []
        )
        visibility_counts = self._fetch_visibility_counts(
            filters=filters,
            include_private=include_private_visibility_counts,
        )

        return {
            "items": [PostSerializerService.to_summary(row) for row in rows],
            "total_count": total_count,
            "next_offset": next_offset,
            "has_more": next_offset is not None,
            "tag_filters": tag_filters,
            "visibility_counts": visibility_counts,
        }

    def replace_project_order(self, raw_project_slugs: list[str]) -> list[Post]:
        project_slugs = normalize_slug_list(raw_project_slugs)
        if not project_slugs:
            return []

        projects = list(
            self.db.scalars(
                select(Post).where(
                    Post.slug.in_(project_slugs),
                    Post.content_kind == PostContentKind.PROJECT,
                )
            )
        )
        by_slug = {project.slug: project for project in projects}
        missing = [slug for slug in project_slugs if slug not in by_slug]
        if missing:
            raise ValueError(f"unknown project slugs: {', '.join(missing)}")

        for index, slug in enumerate(project_slugs, start=1):
            by_slug[slug].project_order_index = index

        # Transaction commit is owned by the calling service layer.
        self.db.flush()
        return self.list(
            limit=max(len(project_slugs), 1),
            offset=0,
            content_kind=PostContentKind.PROJECT,
        )

    def get_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        content_kind: PostContentKind | None = None,
        locale: PostLocale | None = None,
    ) -> Post | None:
        stmt = (
            select(Post)
            .options(
                selectinload(Post.tags),
                selectinload(Post.project_profile),
                selectinload(Post.comments),
            )
            .where(Post.slug == slug)
        )
        if status is not None:
            stmt = stmt.where(Post.status == status)
        if visibility is not None:
            stmt = stmt.where(Post.visibility == visibility)
        if content_kind is not None:
            stmt = stmt.where(Post.content_kind == content_kind)
        if locale is not None:
            stmt = stmt.where(Post.locale == locale)
        row = self.db.scalar(stmt)
        if row is None:
            return None
        public_only = status == PostStatus.PUBLISHED and visibility == PostVisibility.PUBLIC
        self._attach_series_context(row, public_only=public_only)
        return row

    def _resolve_tags(self, raw_tags: Iterable[str]) -> list[Tag]:
        normalized_slugs = normalize_tag_slugs(raw_tags)
        if not normalized_slugs:
            return []

        existing_tags = list(
            self.db.scalars(select(Tag).where(Tag.slug.in_(normalized_slugs)))
        )
        by_slug = {tag.slug: tag for tag in existing_tags}

        resolved: list[Tag] = []
        for slug in normalized_slugs:
            tag = by_slug.get(slug)
            if tag is None:
                try:
                    with self.db.begin_nested():
                        tag = Tag(slug=slug, label=slug)
                        self.db.add(tag)
                        self.db.flush()
                except IntegrityError:
                    tag = self.db.scalar(select(Tag).where(Tag.slug == slug))
                    if tag is None:
                        raise
                by_slug[slug] = tag
            resolved.append(tag)

        return resolved

    def create(self, payload: PostCreate) -> Post:
        post_data = payload.model_dump()
        raw_tags = post_data.pop("tags", [])
        project_profile_data = post_data.pop("project_profile", None)
        post_data["series_title"] = normalize_optional_text(post_data.get("series_title"))
        if post_data["status"] == PostStatus.PUBLISHED and post_data.get("published_at") is None:
            post_data["published_at"] = datetime.now(timezone.utc)
        if post_data.get("translation_group_id") is None:
            post_data["translation_group_id"] = uuid.uuid4()

        post = Post(**post_data)
        if post.content_kind == PostContentKind.PROJECT and project_profile_data is not None:
            post.project_profile = self._build_project_profile(project_profile_data)
        post.tags = self._resolve_tags(raw_tags)
        self.db.add(post)
        # Transaction commit is owned by the calling service layer.
        self.db.flush()
        created = self.get_by_slug(post.slug)
        if created is not None:
            return created
        self._attach_series_context(post, public_only=False)
        return post

    def update_by_slug(self, current_slug: str, payload: PostCreate) -> Post | None:
        post = self.get_by_slug(current_slug)
        if post is None:
            return None

        existing_status = post.status
        existing_published_at = post.published_at
        post_data = payload.model_dump()
        raw_tags = post_data.pop("tags", [])
        project_profile_data = post_data.pop("project_profile", None)
        post_data["series_title"] = normalize_optional_text(post_data.get("series_title"))
        if existing_status == PostStatus.PUBLISHED and post_data["status"] == PostStatus.PUBLISHED:
            post_data["published_at"] = existing_published_at
        elif post_data["status"] == PostStatus.PUBLISHED and post_data.get("published_at") is None:
            post_data["published_at"] = datetime.now(timezone.utc)
        if post_data.get("translation_group_id") is None:
            post_data["translation_group_id"] = post.translation_group_id
        if "source_post_id" in post_data and post_data.get("source_post_id") is None:
            post_data["source_post_id"] = post.source_post_id

        for field, value in post_data.items():
            setattr(post, field, value)
        if post.content_kind == PostContentKind.PROJECT and project_profile_data is not None:
            if post.project_profile is None:
                post.project_profile = self._build_project_profile(project_profile_data)
            else:
                self._update_project_profile(post.project_profile, project_profile_data)
        else:
            post.project_profile = None
        post.tags = self._resolve_tags(raw_tags)

        # Transaction commit is owned by the calling service layer.
        self.db.flush()
        updated = self.get_by_slug(post.slug)
        if updated is not None:
            return updated
        self._attach_series_context(post, public_only=False)
        return post

    def delete_by_slug(
        self,
        slug: str,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
    ) -> bool:
        post = self.get_by_slug(slug=slug, status=status, visibility=visibility)
        if post is None:
            return False

        self.db.delete(post)
        # Transaction commit is owned by the calling service layer.
        self.db.flush()
        return True

    def clear_all(self) -> int:
        result = self.db.execute(delete(Post))
        # Transaction commit is owned by the calling service layer.
        self.db.flush()
        return int(result.rowcount or 0)

    def _project_profile_fields(self, payload: dict[str, object]) -> dict[str, object | None]:
        intro = payload.get("project_intro")
        return {
            "period_label": str(payload["period_label"]),
            "role_summary": str(payload["role_summary"]),
            "project_intro": str(intro).strip() if intro else None,
            "card_image_url": str(payload["card_image_url"]),
            "highlights_json": list(payload.get("highlights") or []),
            "resource_links_json": list(payload.get("resource_links") or []),
        }

    def _build_project_profile(self, payload: dict[str, object]) -> ProjectProfile:
        return ProjectProfile(**self._project_profile_fields(payload))

    def _update_project_profile(self, profile: ProjectProfile, payload: dict[str, object]) -> None:
        for field, value in self._project_profile_fields(payload).items():
            setattr(profile, field, value)
