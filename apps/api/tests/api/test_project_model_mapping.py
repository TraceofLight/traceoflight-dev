from app.models.post import Post
from app.models.project_profile import ProjectProfile


def test_post_content_kind_enum_uses_value_literals() -> None:
    assert Post.__table__.c.content_kind.type.enums == ["blog", "project"]


def test_post_top_media_kind_enum_includes_image_youtube_video() -> None:
    assert Post.__table__.c.top_media_kind.type.enums == [
        "image",
        "youtube",
        "video",
    ]


def test_post_exposes_shared_top_media_columns() -> None:
    assert "top_media_image_url" in Post.__table__.c
    assert "top_media_youtube_url" in Post.__table__.c
    assert "top_media_video_url" in Post.__table__.c


def test_project_profile_has_unique_post_relationship() -> None:
    post_id_column = ProjectProfile.__table__.c.post_id
    assert post_id_column.unique is True


def test_project_profile_exposes_project_intro_column() -> None:
    assert "project_intro" in ProjectProfile.__table__.c


def test_project_profile_no_longer_owns_top_media_columns() -> None:
    assert "detail_media_kind" not in ProjectProfile.__table__.c
    assert "detail_image_url" not in ProjectProfile.__table__.c
    assert "youtube_url" not in ProjectProfile.__table__.c
    assert "detail_video_url" not in ProjectProfile.__table__.c
