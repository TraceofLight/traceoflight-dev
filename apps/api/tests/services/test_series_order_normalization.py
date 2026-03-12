from __future__ import annotations

from app.repositories import series_repository


def test_normalize_series_slugs_preserves_original_case() -> None:
    normalized = series_repository._normalize_series_slugs(  # noqa: SLF001
        ["ProblemSolving", " ComputerScience ", "ProblemSolving", ""]
    )

    assert normalized == ["ProblemSolving", "ComputerScience"]
