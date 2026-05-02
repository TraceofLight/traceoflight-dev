"""Post repository helpers split out from the original monolithic module.

The public ``PostRepository`` class still lives in
``app.repositories.post_repository`` for backwards compatibility; this
package hosts the supporting builders/services it composes.
"""

from app.repositories.posts.filters import PostFilterBuilder
from app.repositories.posts.serializer import (
    DEFAULT_WORDS_PER_MINUTE,
    PostSerializerService,
    format_reading_label,
)
from app.repositories.posts.series_context import SeriesContextService

__all__ = [
    "DEFAULT_WORDS_PER_MINUTE",
    "PostFilterBuilder",
    "PostSerializerService",
    "SeriesContextService",
    "format_reading_label",
]
