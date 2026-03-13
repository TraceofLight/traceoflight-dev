from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import delete, distinct, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, load_only, selectinload

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

DEFAULT_WORDS_PER_MINUTE = 200


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


def _markdown_to_plain_text(markdown_source: str = "") -> str:
    return (
        str(markdown_source)
        .replace("```", " ``` ")
    )


def _count_reading_words(markdown_source: str = "") -> int:
    import re

    plain_text = (
        str(markdown_source)
        .replace("\r\n", "\n")
    )
    plain_text = re.sub(r"```[\s\S]*?```", " ", plain_text)
    plain_text = re.sub(r"`[^`]*`", " ", plain_text)
    plain_text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", plain_text)
    plain_text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r" \1 ", plain_text)
    plain_text = re.sub(r"<[^>]+>", " ", plain_text)
    plain_text = re.sub(r"[#>*_~=\-]+", " ", plain_text)
    plain_text = re.sub(r"\s+", " ", plain_text).strip()
    if not plain_text:
        return 0
    return len([token for token in plain_text.split(" ") if token])


def _format_reading_label(markdown_source: str = "") -> str:
    word_count = _count_reading_words(markdown_source)
    minutes = max(1, -(-word_count // DEFAULT_WORDS_PER_MINUTE)) if word_count else 1
    return f"{minutes} min read"


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

    def _apply_post_filters(
        self,
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
                tag_stmt = tag_stmt.having(func.count(distinct(Tag.slug)) == len(normalized_tags))
            stmt = stmt.where(Post.id.in_(tag_stmt))

        return stmt

    def _build_post_ordering(
        self,
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

    def _serialize_post_summary(self, post: Post) -> dict[str, object]:
        return {
            "id": post.id,
            "slug": post.slug,
            "title": post.title,
            "excerpt": post.excerpt,
            "cover_image_url": post.cover_image_url,
            "top_media_kind": post.top_media_kind,
            "top_media_image_url": post.top_media_image_url,
            "top_media_youtube_url": post.top_media_youtube_url,
            "top_media_video_url": post.top_media_video_url,
            "series_title": post.series_title,
            "content_kind": post.content_kind,
            "status": post.status,
            "visibility": post.visibility,
            "published_at": post.published_at,
            "reading_label": _format_reading_label(post.body_markdown),
            "tags": post.tags,
            "comment_count": post.comment_count,
            "created_at": post.created_at,
            "updated_at": post.updated_at,
        }

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
        ordering = self._build_post_ordering(
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
        stmt = self._apply_post_filters(
            stmt,
            status=status,
            visibility=visibility,
            content_kind=content_kind,
            tags=tags,
            tag_match=tag_match,
        )
        stmt = stmt.limit(limit).offset(offset)
        rows = list(self.db.scalars(stmt))
        public_only = status == PostStatus.PUBLISHED and visibility == PostVisibility.PUBLIC
        return self._apply_series_context(rows, public_only=public_only)

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
    ) -> dict[str, object]:
        ordering = self._build_post_ordering(
            status=status,
            content_kind=content_kind,
            sort=sort,
        )
        stmt = (
            select(Post)
            .options(
                load_only(
                    Post.id,
                    Post.slug,
                    Post.title,
                    Post.excerpt,
                    Post.body_markdown,
                    Post.cover_image_url,
                    Post.top_media_kind,
                    Post.top_media_image_url,
                    Post.top_media_youtube_url,
                    Post.top_media_video_url,
                    Post.series_title,
                    Post.content_kind,
                    Post.status,
                    Post.visibility,
                    Post.published_at,
                    Post.created_at,
                    Post.updated_at,
                ),
                selectinload(Post.tags),
                selectinload(Post.comments),
            )
            .order_by(*ordering)
        )
        stmt = self._apply_post_filters(
            stmt,
            status=status,
            visibility=visibility,
            content_kind=content_kind,
            tags=tags,
            tag_match=tag_match,
            query=query,
        )
        paged_stmt = stmt.limit(limit).offset(offset)
        rows = list(self.db.scalars(paged_stmt))

        count_stmt = self._apply_post_filters(
            select(Post.id),
            status=status,
            visibility=visibility,
            content_kind=content_kind,
            tags=tags,
            tag_match=tag_match,
            query=query,
        ).subquery()
        total_count = int(self.db.scalar(select(func.count()).select_from(count_stmt)) or 0)
        next_offset = offset + len(rows) if offset + len(rows) < total_count else None

        tag_filters: list[dict[str, object]] = []
        if include_tag_filters:
            tag_stmt = (
                select(Tag.slug, func.count(distinct(Post.id)))
                .select_from(Post)
                .join(Post.tags)
            )
            tag_stmt = self._apply_post_filters(
                tag_stmt,
                status=status,
                visibility=visibility,
                content_kind=content_kind,
                query=query,
            )
            tag_stmt = tag_stmt.group_by(Tag.slug).order_by(Tag.slug.asc())
            tag_filters = [
                {"slug": slug, "count": int(count)}
                for slug, count in self.db.execute(tag_stmt)
            ]

        visibility_count_visibility = (
            None if include_private_visibility_counts else PostVisibility.PUBLIC
        )
        visibility_count_stmt = self._apply_post_filters(
            select(Post.visibility, func.count(distinct(Post.id)))
            .select_from(Post)
            .group_by(Post.visibility),
            status=status,
            visibility=visibility_count_visibility,
            content_kind=content_kind,
            tags=tags,
            tag_match=tag_match,
            query=query,
        )
        visibility_counts = {"all": 0, "public": 0, "private": 0}
        for raw_visibility, count in self.db.execute(visibility_count_stmt):
            key = "private" if raw_visibility == PostVisibility.PRIVATE else "public"
            visibility_counts[key] = int(count)
        visibility_counts["all"] = (
            visibility_counts["public"] + visibility_counts["private"]
        )

        return {
            "items": [self._serialize_post_summary(row) for row in rows],
            "total_count": total_count,
            "next_offset": next_offset,
            "has_more": next_offset is not None,
            "tag_filters": tag_filters,
            "visibility_counts": visibility_counts,
        }

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

        existing_status = post.status
        existing_published_at = post.published_at
        post_data = payload.model_dump()
        raw_tags = post_data.pop("tags", [])
        project_profile_data = post_data.pop("project_profile", None)
        post_data["series_title"] = _normalize_series_title(post_data.get("series_title"))
        if existing_status == PostStatus.PUBLISHED and post_data["status"] == PostStatus.PUBLISHED:
            post_data["published_at"] = existing_published_at
        elif post_data["status"] == PostStatus.PUBLISHED and post_data.get("published_at") is None:
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
