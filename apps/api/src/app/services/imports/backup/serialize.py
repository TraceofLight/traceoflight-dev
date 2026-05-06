from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.media import MediaAsset
from app.models.post import Post
from app.models.post_comment import PostComment
from app.models.project_profile import ProjectProfile
from app.models.series import Series, SeriesPost
from app.models.site_profile import SiteProfile
from app.models.tag import PostTag, Tag
from app.services.imports.backup.bundle import BackupBundle, PostEntry
from app.services.imports.media_refs import (
    extract_internal_object_key,
    extract_markdown_media_object_keys,
    fallback_media_manifest_entry,
)


def serialize_site_profile(profile: SiteProfile) -> dict[str, object]:
    return {
        "key": profile.key,
        "email": profile.email,
        "github_url": profile.github_url,
    }


def serialize_tag(tag: Tag) -> dict[str, object]:
    return {"id": str(tag.id), "slug": tag.slug, "label": tag.label}


def serialize_post_tag(link: PostTag) -> dict[str, object]:
    return {"post_id": str(link.post_id), "tag_id": str(link.tag_id)}


def serialize_media_asset(media: MediaAsset) -> dict[str, object]:
    return {
        "id": str(media.id),
        "kind": media.kind.value,
        "bucket": media.bucket,
        "object_key": media.object_key,
        "original_filename": media.original_filename,
        "mime_type": media.mime_type,
        "size_bytes": int(media.size_bytes or 0),
        "width": media.width,
        "height": media.height,
        "duration_seconds": media.duration_seconds,
        "owner_post_id": None
        if media.owner_post_id is None
        else str(media.owner_post_id),
    }


def _to_iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _serialize_project_profile(profile: ProjectProfile) -> dict[str, object]:
    return {
        "id": str(profile.id),
        "period_label": profile.period_label,
        "role_summary": profile.role_summary,
        "project_intro": profile.project_intro,
        "card_image_url": profile.card_image_url,
        "highlights": list(profile.highlights_json or []),
        "resource_links": list(profile.resource_links_json or []),
    }


def serialize_series(series: Series) -> dict[str, object]:
    return {
        "id": str(series.id),
        "slug": series.slug,
        "title": series.title,
        "description": series.description,
        "cover_image_url": series.cover_image_url,
        "list_order_index": series.list_order_index,
        "locale": series.locale.value,
        "translation_group_id": str(series.translation_group_id),
        "source_series_id": (
            None if series.source_series_id is None else str(series.source_series_id)
        ),
        "translation_status": series.translation_status.value,
        "translation_source_kind": series.translation_source_kind.value,
        "translated_from_hash": series.translated_from_hash,
    }


def serialize_series_post(sp: SeriesPost) -> dict[str, object]:
    return {
        "id": str(sp.id),
        "series_id": str(sp.series_id),
        "post_id": str(sp.post_id),
        "order_index": int(sp.order_index),
    }


def serialize_post_comment(comment: PostComment) -> dict[str, object]:
    return {
        "id": str(comment.id),
        "post_id": str(comment.post_id),
        "root_comment_id": (
            None if comment.root_comment_id is None else str(comment.root_comment_id)
        ),
        "reply_to_comment_id": (
            None
            if comment.reply_to_comment_id is None
            else str(comment.reply_to_comment_id)
        ),
        "author_name": comment.author_name,
        "author_type": comment.author_type.value,
        "password_hash": comment.password_hash,
        "visibility": comment.visibility.value,
        "status": comment.status.value,
        "body": comment.body,
        "deleted_at": _to_iso_utc(comment.deleted_at),
        "last_edited_at": _to_iso_utc(comment.last_edited_at),
        "request_ip_hash": comment.request_ip_hash,
        "user_agent_hash": comment.user_agent_hash,
    }


def serialize_post(post: Post) -> tuple[dict[str, object], str]:
    meta: dict[str, object] = {
        "id": str(post.id),
        "slug": post.slug,
        "title": post.title,
        "excerpt": post.excerpt,
        "cover_image_url": post.cover_image_url,
        "top_media_kind": post.top_media_kind.value,
        "top_media_image_url": post.top_media_image_url,
        "top_media_youtube_url": post.top_media_youtube_url,
        "top_media_video_url": post.top_media_video_url,
        "project_order_index": post.project_order_index,
        "series_title": post.series_title,
        "locale": post.locale.value,
        "translation_group_id": str(post.translation_group_id),
        "source_post_id": None
        if post.source_post_id is None
        else str(post.source_post_id),
        "translation_status": post.translation_status.value,
        "translation_source_kind": post.translation_source_kind.value,
        "translated_from_hash": post.translated_from_hash,
        "content_kind": post.content_kind.value,
        "status": post.status.value,
        "visibility": post.visibility.value,
        "published_at": _to_iso_utc(post.published_at),
        "project_profile": (
            None
            if post.project_profile is None
            else _serialize_project_profile(post.project_profile)
        ),
    }
    return meta, post.body_markdown


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _collect_referenced_media_keys(
    posts: list[Post], series_rows: list[Series]
) -> set[str]:
    keys: set[str] = set()
    for post in posts:
        for url in (
            post.cover_image_url,
            post.top_media_image_url,
            post.top_media_video_url,
        ):
            key = extract_internal_object_key(url)
            if key is not None:
                keys.add(key)
        keys.update(extract_markdown_media_object_keys(post.body_markdown or ""))
        if post.project_profile is not None:
            key = extract_internal_object_key(post.project_profile.card_image_url)
            if key is not None:
                keys.add(key)
    for series in series_rows:
        key = extract_internal_object_key(series.cover_image_url)
        if key is not None:
            keys.add(key)
    return keys


def collect_bundle(db: Session, storage) -> BackupBundle:
    posts = list(
        db.scalars(
            select(Post)
            .options(selectinload(Post.tags), selectinload(Post.project_profile))
            .order_by(Post.created_at.asc(), Post.slug.asc())
        )
    )
    series_rows = list(db.scalars(select(Series).order_by(Series.created_at.asc())))
    series_posts = list(
        db.scalars(
            select(SeriesPost).order_by(SeriesPost.series_id, SeriesPost.order_index)
        )
    )
    tags = list(db.scalars(select(Tag).order_by(Tag.slug)))
    post_tags = list(db.scalars(select(PostTag)))
    comments = list(db.scalars(select(PostComment).order_by(PostComment.created_at)))

    site_profile_row = db.scalar(select(SiteProfile))
    site_profile_payload = (
        None if site_profile_row is None else serialize_site_profile(site_profile_row)
    )

    referenced_keys = _collect_referenced_media_keys(posts, series_rows)
    media_assets_query = (
        list(
            db.scalars(
                select(MediaAsset).where(
                    MediaAsset.object_key.in_(sorted(referenced_keys))
                )
            )
        )
        if referenced_keys
        else []
    )
    media_by_key = {row.object_key: row for row in media_assets_query}

    media_bytes: dict[str, bytes] = {}
    media_assets_payload: list[dict] = []
    for object_key in sorted(referenced_keys):
        media_bytes[object_key] = storage.get_bytes(object_key)
        media_row = media_by_key.get(object_key)
        if media_row is None:
            fallback = fallback_media_manifest_entry(
                object_key, media_bytes[object_key]
            )
            media_assets_payload.append(
                {
                    "id": None,
                    "owner_post_id": None,
                    "bucket": storage.bucket,
                    **fallback,
                }
            )
            continue
        media_assets_payload.append(serialize_media_asset(media_row))

    posts_payload: list[PostEntry] = []
    for post in posts:
        meta, body = serialize_post(post)
        posts_payload.append(PostEntry(meta=meta, body_markdown=body))

    return BackupBundle(
        site_profile=site_profile_payload,
        tags=[serialize_tag(tag) for tag in tags],
        post_tags=[serialize_post_tag(link) for link in post_tags],
        media_assets=media_assets_payload,
        media_bytes=media_bytes,
        posts=posts_payload,
        series=[serialize_series(s) for s in series_rows],
        series_posts=[serialize_series_post(sp) for sp in series_posts],
        post_comments=[serialize_post_comment(c) for c in comments],
        generated_at=_utcnow(),
    )
