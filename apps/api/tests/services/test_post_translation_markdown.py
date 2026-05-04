from __future__ import annotations

from app.services.post_translation_markdown import (
    mask_markdown_translation_segments,
    unmask_markdown_translation_segments,
)


def test_mask_markdown_translation_segments_protects_non_translatable_ranges() -> None:
    markdown = """
# Title

Inline `const value = 1` here.

```ts
console.log("hello");
```

[guide](https://example.com/docs?q=1)
![cover](/media/image/cover.png)
https://traceoflight.dev/blog/test
<iframe src="https://www.youtube.com/embed/abc"></iframe>
""".strip()

    masked = mask_markdown_translation_segments(markdown)

    assert "const value = 1" not in masked.text
    assert 'console.log("hello");' not in masked.text
    assert "https://example.com/docs?q=1" not in masked.text
    assert "/media/image/cover.png" not in masked.text
    assert "https://traceoflight.dev/blog/test" not in masked.text
    assert '<iframe src="https://www.youtube.com/embed/abc"></iframe>' not in masked.text
    assert "@@TLP0@@" in masked.text


def test_unmask_markdown_translation_segments_restores_original_content() -> None:
    markdown = """
본문 [링크](https://example.com) 와 `inline code`

```py
print("hello")
```
""".strip()

    masked = mask_markdown_translation_segments(markdown)
    restored = unmask_markdown_translation_segments(masked.text, masked.replacements)

    assert restored == markdown
