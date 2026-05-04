from __future__ import annotations

from app.services.translation_hash import compute_source_hash


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
