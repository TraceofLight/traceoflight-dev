from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import delete, distinct, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.post import (
    Post,
    PostContentKind,
    PostStatus,
    PostTopMediaKind,
    PostVisibility,
)
from app.models.project_profile import ProjectProfile
from app.models.series import Series, SeriesPost
from app.models.tag import Tag
from app.repositories.tag_repository import normalize_tag_slugs
from app.schemas.post import PostCreate


def _normalize_series_title(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_slug_list(raw_values: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_values:
        slug = raw.strip().lower()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        normalized.append(slug)
    return normalized


class PostRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _attach_series_context(self, post: Post, public_only: bool) -> None:
        series_row = self.db.execute(
            select(SeriesPost, Series)
            .join(Series, Series.id == SeriesPost.series_id)
            .where(SeriesPost.post_id == post.id)
        ).first()
        if series_row is None:
            setattr(post, "series_context", None)
            return

        mapping, series = series_row
        ordered_rows = list(
            self.db.execute(
                select(
                    SeriesPost.order_index,
                    Post.slug,
                    Post.title,
                    Post.status,
                    Post.visibility,
                )
                .join(Post, Post.id == SeriesPost.post_id)
                .where(SeriesPost.series_id == series.id)
                .order_by(SeriesPost.order_index.asc())
            )
        )
        if public_only:
            ordered_rows = [
                row
                for row in ordered_rows
                if row.status == PostStatus.PUBLISHED and row.visibility == PostVisibility.PUBLIC
            ]

        current_index = next((idx for idx, row in enumerate(ordered_rows) if row.slug == post.slug), None)
        if current_index is None:
            setattr(post, "series_context", None)
            return

        prev_row = ordered_rows[current_index - 1] if current_index > 0 else None
        next_row = ordered_rows[current_index + 1] if current_index + 1 < len(ordered_rows) else None
        setattr(
            post,
            "series_context",
            {
                "series_slug": series.slug,
                "series_title": series.title,
                "order_index": mapping.order_index,
                "total_posts": len(ordered_rows),
                "prev_post_slug": None if prev_row is None else prev_row.slug,
                "prev_post_title": None if prev_row is None else prev_row.title,
                "next_post_slug": None if next_row is None else next_row.slug,
                "next_post_title": None if next_row is None else next_row.title,
            },
        )

    def _apply_series_context(self, posts: list[Post], public_only: bool) -> list[Post]:
        for post in posts:
            self._attach_series_context(post, public_only=public_only)
        return posts

    def list(
        self,
        limit: int = 20,
        offset: int = 0,
        status: PostStatus | None = None,
        visibility: PostVisibility | None = None,
        content_kind: PostContentKind | None = PostContentKind.BLOG,
        tags: list[str] | None = None,
        tag_match: str = "any",
    ) -> list[Post]:
        ordering = [Post.created_at.desc(), Post.slug.desc()]
        if status == PostStatus.PUBLISHED:
            ordering = [
                Post.published_at.desc().nulls_last(),
                Post.created_at.desc(),
                Post.slug.desc(),
            ]
        if content_kind == PostContentKind.PROJECT:
            ordering = [
                Post.project_order_index.asc().nulls_last(),
                *ordering,
            ]

        stmt = (
            select(Post)
            .options(selectinload(Post.tags), selectinload(Post.project_profile))
            .order_by(*ordering)
        )
        if status is not None:
            stmt = stmt.where(Post.status == status)
        if visibility is not None:
            stmt = stmt.where(Post.visibility == visibility)
        if content_kind is not None:
            stmt = stmt.where(Post.content_kind == content_kind)
        normalized_tags = normalize_tag_slugs(tags or [])
        if normalized_tags:
            tag_stmt = (
                select(Post.id)
                .join(Post.tags)
                .where(Tag.slug.in_(normalized_tags))
                .group_by(Post.id)
            )
            if tag_match == "all":
                tag_stmt = tag_stmt.having(func.count(distinct(Tag.slug)) == len(normalized_tags))
            stmt = stmt.where(Post.id.in_(tag_stmt))
        stmt = stmt.limit(limit).offset(offset)
        rows = list(self.db.scalars(stmt))
        public_only = status == PostStatus.PUBLISHED and visibility == PostVisibility.PUBLIC
        return self._apply_series_context(rows, public_only=public_only)

    def replace_project_order(self, raw_project_slugs: list[str]) -> list[Post]:
        project_slugs = _normalize_slug_list(raw_project_slugs)
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

        self.db.commit()
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
    ) -> Post | None:
        stmt = select(Post).options(selectinload(Post.tags), selectinload(Post.project_profile)).where(Post.slug == slug)
        if status is not None:
            stmt = stmt.where(Post.status == status)
        if visibility is not None:
            stmt = stmt.where(Post.visibility == visibility)
        if content_kind is not None:
            stmt = stmt.where(Post.content_kind == content_kind)
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
        post_data["series_title"] = _normalize_series_title(post_data.get("series_title"))
        if post_data["status"] == PostStatus.PUBLISHED and post_data.get("published_at") is None:
            post_data["published_at"] = datetime.now(timezone.utc)

        post = Post(**post_data)
        if post.content_kind == PostContentKind.PROJECT and project_profile_data is not None:
            post.project_profile = self._build_project_profile(project_profile_data)
        post.tags = self._resolve_tags(raw_tags)
        self.db.add(post)
        self.db.commit()
        created = self.get_by_slug(post.slug)
        if created is not None:
            return created
        self._attach_series_context(post, public_only=False)
        return post

    def update_by_slug(self, current_slug: str, payload: PostCreate) -> Post | None:
        post = self.get_by_slug(current_slug)
        if post is None:
            return None

        post_data = payload.model_dump()
        raw_tags = post_data.pop("tags", [])
        project_profile_data = post_data.pop("project_profile", None)
        post_data["series_title"] = _normalize_series_title(post_data.get("series_title"))
        if post_data["status"] == PostStatus.PUBLISHED and post_data.get("published_at") is None:
            post_data["published_at"] = datetime.now(timezone.utc)

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

        self.db.commit()
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
        self.db.commit()
        return True

    def clear_all(self) -> int:
        result = self.db.execute(delete(Post))
        self.db.commit()
        return int(result.rowcount or 0)

    def _build_project_profile(self, payload: dict[str, object]) -> ProjectProfile:
        return ProjectProfile(
            period_label=str(payload["period_label"]),
            role_summary=str(payload["role_summary"]),
            project_intro=str(payload["project_intro"]).strip() if payload.get("project_intro") else None,
            card_image_url=str(payload["card_image_url"]),
            highlights_json=list(payload.get("highlights") or []),
            resource_links_json=list(payload.get("resource_links") or []),
        )

    def _update_project_profile(self, profile: ProjectProfile, payload: dict[str, object]) -> None:
        profile.period_label = str(payload["period_label"])
        profile.role_summary = str(payload["role_summary"])
        profile.project_intro = (
            str(payload["project_intro"]).strip() if payload.get("project_intro") else None
        )
        profile.card_image_url = str(payload["card_image_url"])
        profile.highlights_json = list(payload.get("highlights") or [])
        profile.resource_links_json = list(payload.get("resource_links") or [])
