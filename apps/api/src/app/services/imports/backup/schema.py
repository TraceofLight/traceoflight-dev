from __future__ import annotations

BACKUP_SCHEMA_VERSION = "backup-v3"

MANIFEST_PATH = "manifest.json"
DB_DIR = "db"
POSTS_DIR = "posts"
SERIES_DIR = "series"
MEDIA_DIR = "media"

DB_TAGS_PATH = f"{DB_DIR}/tags.json"
DB_POST_TAGS_PATH = f"{DB_DIR}/post_tags.json"
DB_SERIES_POSTS_PATH = f"{DB_DIR}/series_posts.json"
DB_POST_COMMENTS_PATH = f"{DB_DIR}/post_comments.json"
DB_SITE_PROFILE_PATH = f"{DB_DIR}/site_profile.json"
DB_MEDIA_ASSETS_PATH = f"{DB_DIR}/media_assets.json"


def post_meta_path(translation_group_id: str, locale: str) -> str:
    return f"{POSTS_DIR}/{translation_group_id}/{locale}/meta.json"


def post_content_path(translation_group_id: str, locale: str) -> str:
    return f"{POSTS_DIR}/{translation_group_id}/{locale}/content.md"


def series_path(translation_group_id: str, locale: str) -> str:
    return f"{SERIES_DIR}/{translation_group_id}/{locale}.json"


def media_path(object_key: str) -> str:
    return f"{MEDIA_DIR}/{object_key}"
