from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.models.media import AssetKind, MediaAsset
from app.models.post import (
    Post,
    PostContentKind,
    PostLocale,
    PostStatus,
    PostTopMediaKind,
    PostTranslationSourceKind,
    PostTranslationStatus,
    PostVisibility,
)
from app.models.post_comment import (
    PostComment,
    PostCommentAuthorType,
    PostCommentStatus,
    PostCommentVisibility,
)
from app.models.project_profile import ProjectProfile
from app.models.series import Series, SeriesPost
from app.models.site_profile import SiteProfile
from app.models.tag import PostTag, Tag
from app.services.imports.errors import ImportValidationError


def _parse_iso(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    normalized = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def deserialize_site_profile(payload: dict[str, object]) -> SiteProfile:
    try:
        return SiteProfile(
            key=str(payload["key"]),
            email=str(payload["email"]),
            github_url=str(payload["github_url"]),
        )
    except (KeyError, ValueError) as exc:
        raise ImportValidationError(
            f"site_profile payload missing or invalid field: {exc}"
        ) from exc


def deserialize_tag(payload: dict[str, object]) -> Tag:
    try:
        return Tag(
            id=uuid.UUID(str(payload["id"])),
            slug=str(payload["slug"]),
            label=str(payload["label"]),
        )
    except (KeyError, ValueError) as exc:
        raise ImportValidationError(
            f"tag payload missing or invalid field: {exc}"
        ) from exc


def deserialize_post_tag(payload: dict[str, object]) -> PostTag:
    try:
        return PostTag(
            post_id=uuid.UUID(str(payload["post_id"])),
            tag_id=uuid.UUID(str(payload["tag_id"])),
        )
    except (KeyError, ValueError) as exc:
        raise ImportValidationError(
            f"post_tag payload missing or invalid field: {exc}"
        ) from exc


def deserialize_media_asset(payload: dict[str, object]) -> MediaAsset:
    try:
        raw_owner = payload.get("owner_post_id")
        return MediaAsset(
            id=uuid.UUID(str(payload["id"])),
            kind=AssetKind(str(payload["kind"])),
            bucket=str(payload["bucket"]),
            object_key=str(payload["object_key"]),
            original_filename=str(payload["original_filename"]),
            mime_type=str(payload["mime_type"]),
            size_bytes=int(payload["size_bytes"]),
            width=payload.get("width"),
            height=payload.get("height"),
            duration_seconds=payload.get("duration_seconds"),
            owner_post_id=None if raw_owner is None else uuid.UUID(str(raw_owner)),
        )
    except (KeyError, ValueError) as exc:
        raise ImportValidationError(
            f"media_asset payload missing or invalid field: {exc}"
        ) from exc


def _deserialize_project_profile(payload: dict[str, object]) -> ProjectProfile:
    return ProjectProfile(
        id=uuid.UUID(str(payload["id"])),
        period_label=str(payload["period_label"]),
        role_summary=str(payload["role_summary"]),
        project_intro=payload.get("project_intro"),
        card_image_url=str(payload["card_image_url"]),
        highlights_json=list(payload.get("highlights") or []),
        resource_links_json=list(payload.get("resource_links") or []),
    )


def deserialize_series(payload: dict[str, object]) -> Series:
    try:
        raw_source = payload.get("source_series_id")
        return Series(
            id=uuid.UUID(str(payload["id"])),
            slug=str(payload["slug"]),
            title=str(payload["title"]),
            description=str(payload["description"]),
            cover_image_url=payload.get("cover_image_url"),
            list_order_index=payload.get("list_order_index"),
            locale=PostLocale(str(payload["locale"])),
            translation_group_id=uuid.UUID(str(payload["translation_group_id"])),
            source_series_id=None if raw_source is None else uuid.UUID(str(raw_source)),
            translation_status=PostTranslationStatus(
                str(payload["translation_status"])
            ),
            translation_source_kind=PostTranslationSourceKind(
                str(payload["translation_source_kind"])
            ),
            translated_from_hash=payload.get("translated_from_hash"),
        )
    except (KeyError, ValueError) as exc:
        raise ImportValidationError(
            f"series payload missing or invalid field: {exc}"
        ) from exc


def deserialize_series_post(payload: dict[str, object]) -> SeriesPost:
    try:
        return SeriesPost(
            id=uuid.UUID(str(payload["id"])),
            series_id=uuid.UUID(str(payload["series_id"])),
            post_id=uuid.UUID(str(payload["post_id"])),
            order_index=int(payload["order_index"]),
        )
    except (KeyError, ValueError) as exc:
        raise ImportValidationError(
            f"series_post payload missing or invalid field: {exc}"
        ) from exc


def deserialize_post_comment(payload: dict[str, object]) -> PostComment:
    try:
        raw_root = payload.get("root_comment_id")
        raw_reply = payload.get("reply_to_comment_id")
        return PostComment(
            id=uuid.UUID(str(payload["id"])),
            post_id=uuid.UUID(str(payload["post_id"])),
            root_comment_id=None if raw_root is None else uuid.UUID(str(raw_root)),
            reply_to_comment_id=None
            if raw_reply is None
            else uuid.UUID(str(raw_reply)),
            author_name=str(payload["author_name"]),
            author_type=PostCommentAuthorType(str(payload["author_type"])),
            password_hash=payload.get("password_hash"),
            visibility=PostCommentVisibility(str(payload["visibility"])),
            status=PostCommentStatus(str(payload["status"])),
            body=str(payload["body"]),
            deleted_at=_parse_iso(payload.get("deleted_at")),
            last_edited_at=_parse_iso(payload.get("last_edited_at")),
            request_ip_hash=payload.get("request_ip_hash"),
            user_agent_hash=payload.get("user_agent_hash"),
        )
    except (KeyError, ValueError) as exc:
        raise ImportValidationError(
            f"post_comment payload missing or invalid field: {exc}"
        ) from exc


def deserialize_post(meta: dict[str, object], body_markdown: str) -> Post:
    try:
        raw_source = meta.get("source_post_id")
        project_profile_payload = meta.get("project_profile")
        post = Post(
            id=uuid.UUID(str(meta["id"])),
            slug=str(meta["slug"]),
            title=str(meta["title"]),
            excerpt=meta.get("excerpt"),
            body_markdown=body_markdown,
            cover_image_url=meta.get("cover_image_url"),
            top_media_kind=PostTopMediaKind(str(meta["top_media_kind"])),
            top_media_image_url=meta.get("top_media_image_url"),
            top_media_youtube_url=meta.get("top_media_youtube_url"),
            top_media_video_url=meta.get("top_media_video_url"),
            project_order_index=meta.get("project_order_index"),
            series_title=meta.get("series_title"),
            locale=PostLocale(str(meta["locale"])),
            translation_group_id=uuid.UUID(str(meta["translation_group_id"])),
            source_post_id=None if raw_source is None else uuid.UUID(str(raw_source)),
            translation_status=PostTranslationStatus(str(meta["translation_status"])),
            translation_source_kind=PostTranslationSourceKind(
                str(meta["translation_source_kind"])
            ),
            translated_from_hash=meta.get("translated_from_hash"),
            content_kind=PostContentKind(str(meta["content_kind"])),
            status=PostStatus(str(meta["status"])),
            visibility=PostVisibility(str(meta["visibility"])),
            published_at=_parse_iso(meta.get("published_at")),
        )
        if isinstance(project_profile_payload, dict):
            post.project_profile = _deserialize_project_profile(project_profile_payload)
        return post
    except (KeyError, ValueError) as exc:
        raise ImportValidationError(
            f"post payload missing or invalid field: {exc}"
        ) from exc
