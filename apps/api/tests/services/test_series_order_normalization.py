from __future__ import annotations

from app.core.text import normalize_slug_list


def test_normalize_slug_list_preserves_case_when_disabled() -> None:
    normalized = normalize_slug_list(
        ["ProblemSolving", " ComputerScience ", "ProblemSolving", ""],
        lowercase=False,
    )

    assert normalized == ["ProblemSolving", "ComputerScience"]
