from app.models.post import Post
from app.models.project_profile import ProjectProfile


def test_post_content_kind_enum_uses_value_literals() -> None:
    assert Post.__table__.c.content_kind.type.enums == ["blog", "project"]


def test_project_profile_has_unique_post_relationship() -> None:
    post_id_column = ProjectProfile.__table__.c.post_id
    assert post_id_column.unique is True


def test_project_detail_media_kind_includes_uploaded_video() -> None:
    assert ProjectProfile.__table__.c.detail_media_kind.type.enums == [
        "image",
        "youtube",
        "video",
    ]


def test_project_profile_exposes_detail_video_url_column() -> None:
    assert "detail_video_url" in ProjectProfile.__table__.c


def test_project_profile_exposes_project_intro_column() -> None:
    assert "project_intro" in ProjectProfile.__table__.c
