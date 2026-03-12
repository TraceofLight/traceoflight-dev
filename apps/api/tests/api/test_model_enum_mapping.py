from app.models.media import MediaAsset
from app.models.post import Post
from app.models.post_comment import PostComment
from app.models.tag import PostTag, Tag


def test_media_asset_kind_enum_uses_value_literals() -> None:
    assert MediaAsset.__table__.c.kind.type.enums == ["image", "video", "file"]


def test_post_status_enum_uses_value_literals() -> None:
    assert Post.__table__.c.status.type.enums == ["draft", "published", "archived"]


def test_post_visibility_enum_uses_value_literals() -> None:
    assert Post.__table__.c.visibility.type.enums == ["public", "private"]


def test_post_comment_author_type_enum_uses_value_literals() -> None:
    assert PostComment.__table__.c.author_type.type.enums == ["guest", "admin"]


def test_post_comment_visibility_enum_uses_value_literals() -> None:
    assert PostComment.__table__.c.visibility.type.enums == ["public", "private"]


def test_post_comment_status_enum_uses_value_literals() -> None:
    assert PostComment.__table__.c.status.type.enums == ["active", "deleted"]


def test_post_exposes_comments_relationship() -> None:
    assert "comments" in Post.__mapper__.relationships


def test_post_comment_root_and_reply_foreign_keys_are_nullable() -> None:
    assert PostComment.__table__.c.root_comment_id.nullable is True
    assert PostComment.__table__.c.reply_to_comment_id.nullable is True


def test_tag_slug_has_unique_constraint() -> None:
    slug_column = Tag.__table__.c.slug
    assert slug_column.unique is True


def test_post_tag_has_composite_primary_key() -> None:
    primary_key = PostTag.__table__.primary_key
    assert [column.name for column in primary_key.columns] == ["post_id", "tag_id"]
