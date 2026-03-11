from app.models.post import Post
from app.models.project_profile import ProjectProfile


def test_post_content_kind_enum_uses_value_literals() -> None:
    assert Post.__table__.c.content_kind.type.enums == ["blog", "project"]


def test_project_profile_has_unique_post_relationship() -> None:
    post_id_column = ProjectProfile.__table__.c.post_id
    assert post_id_column.unique is True

