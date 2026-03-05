from app.models.media import MediaAsset
from app.models.post import Post
from app.models.tag import PostTag, Tag


def test_media_asset_kind_enum_uses_value_literals() -> None:
    assert MediaAsset.__table__.c.kind.type.enums == ["image", "video", "file"]


def test_post_status_enum_uses_value_literals() -> None:
    assert Post.__table__.c.status.type.enums == ["draft", "published", "archived"]


def test_post_visibility_enum_uses_value_literals() -> None:
    assert Post.__table__.c.visibility.type.enums == ["public", "private"]


def test_tag_slug_has_unique_constraint() -> None:
    slug_column = Tag.__table__.c.slug
    assert slug_column.unique is True


def test_post_tag_has_composite_primary_key() -> None:
    primary_key = PostTag.__table__.primary_key
    assert [column.name for column in primary_key.columns] == ["post_id", "tag_id"]
