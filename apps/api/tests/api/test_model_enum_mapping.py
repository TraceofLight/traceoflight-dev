from app.models.media import MediaAsset
from app.models.post import Post


def test_media_asset_kind_enum_uses_value_literals() -> None:
    assert MediaAsset.__table__.c.kind.type.enums == ["image", "video", "file"]


def test_post_status_enum_uses_value_literals() -> None:
    assert Post.__table__.c.status.type.enums == ["draft", "published", "archived"]

