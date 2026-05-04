from __future__ import annotations

from app.services.translation_hash import compute_source_hash, compute_post_source_hash


def test_compute_source_hash_is_deterministic() -> None:
    a = compute_source_hash(title="A", excerpt=None, body_markdown="hi")
    b = compute_source_hash(title="A", excerpt=None, body_markdown="hi")
    assert a == b


def test_compute_source_hash_changes_when_title_changes() -> None:
    base = compute_source_hash(title="Old", excerpt=None, body_markdown="x")
    other = compute_source_hash(title="New", excerpt=None, body_markdown="x")
    assert base != other


def test_compute_source_hash_changes_when_excerpt_changes() -> None:
    base = compute_source_hash(title="t", excerpt=None, body_markdown="x")
    other = compute_source_hash(title="t", excerpt="lead-in", body_markdown="x")
    assert base != other


def test_compute_source_hash_changes_when_body_changes() -> None:
    base = compute_source_hash(title="t", excerpt=None, body_markdown="one")
    other = compute_source_hash(title="t", excerpt=None, body_markdown="two")
    assert base != other


def test_compute_source_hash_returns_64_hex_chars() -> None:
    digest = compute_source_hash(title="t", excerpt=None, body_markdown="b")
    assert len(digest) == 64
    int(digest, 16)  # parse as hex; raises if not hex


# ---------------------------------------------------------------------------
# compute_post_source_hash — project_profile-aware variant
# ---------------------------------------------------------------------------


def _make_profile(**kwargs):
    """Return a simple namespace object mimicking ProjectProfile attributes."""
    defaults = {
        "period_label": "2025. 12. ~ 2026. 02. (6주)",
        "role_summary": "개발자",
        "project_intro": "프로젝트 소개",
        "highlights_json": ["성과1", "성과2"],
        "resource_links_json": [{"label": "GitHub", "href": "https://github.com/x"}],
    }
    defaults.update(kwargs)
    return type("_FakeProfile", (), defaults)()


def test_compute_post_source_hash_is_deterministic_without_profile() -> None:
    a = compute_post_source_hash(title="A", excerpt=None, body_markdown="hi")
    b = compute_post_source_hash(title="A", excerpt=None, body_markdown="hi")
    assert a == b


def test_compute_post_source_hash_without_profile_equals_compute_source_hash() -> None:
    """When no profile is given the two helpers must produce the same digest."""
    h1 = compute_source_hash(title="T", excerpt="E", body_markdown="B")
    h2 = compute_post_source_hash(title="T", excerpt="E", body_markdown="B", project_profile=None)
    assert h1 == h2


def test_compute_post_source_hash_same_source_same_profile_stable() -> None:
    profile = _make_profile()
    a = compute_post_source_hash(title="T", excerpt=None, body_markdown="B", project_profile=profile)
    b = compute_post_source_hash(title="T", excerpt=None, body_markdown="B", project_profile=profile)
    assert a == b


def test_compute_post_source_hash_differs_when_source_title_changes() -> None:
    profile = _make_profile()
    h1 = compute_post_source_hash(title="Old", excerpt=None, body_markdown="B", project_profile=profile)
    h2 = compute_post_source_hash(title="New", excerpt=None, body_markdown="B", project_profile=profile)
    assert h1 != h2


def test_compute_post_source_hash_differs_when_role_summary_changes() -> None:
    p1 = _make_profile(role_summary="개발자")
    p2 = _make_profile(role_summary="디자이너")
    h1 = compute_post_source_hash(title="T", excerpt=None, body_markdown="B", project_profile=p1)
    h2 = compute_post_source_hash(title="T", excerpt=None, body_markdown="B", project_profile=p2)
    assert h1 != h2


def test_compute_post_source_hash_differs_when_highlights_change() -> None:
    p1 = _make_profile(highlights_json=["A", "B"])
    p2 = _make_profile(highlights_json=["A", "C"])
    h1 = compute_post_source_hash(title="T", excerpt=None, body_markdown="B", project_profile=p1)
    h2 = compute_post_source_hash(title="T", excerpt=None, body_markdown="B", project_profile=p2)
    assert h1 != h2


def test_compute_post_source_hash_differs_when_profile_added() -> None:
    """Adding a profile to a post that previously had none changes the hash."""
    h_no_profile = compute_post_source_hash(title="T", excerpt=None, body_markdown="B")
    h_with_profile = compute_post_source_hash(
        title="T", excerpt=None, body_markdown="B", project_profile=_make_profile()
    )
    assert h_no_profile != h_with_profile


def test_compute_post_source_hash_differs_when_resource_link_label_changes() -> None:
    p1 = _make_profile(resource_links_json=[{"label": "GitHub", "href": "https://github.com/x"}])
    p2 = _make_profile(resource_links_json=[{"label": "Demo", "href": "https://github.com/x"}])
    h1 = compute_post_source_hash(title="T", excerpt=None, body_markdown="B", project_profile=p1)
    h2 = compute_post_source_hash(title="T", excerpt=None, body_markdown="B", project_profile=p2)
    assert h1 != h2
