//! Post DTOs, SQL queries, and service logic for the blog/project content
//! surface. Public read endpoints serve published+public rows; trusted callers
//! using the internal-secret header can request drafts and writes.

mod model;
mod queries;
mod service;
mod utils;

pub use model::{
    ListPostsParams, ListSummariesParams, PostContentKind, PostCreate, PostFilter, PostLocale,
    PostRead, PostSeriesContext, PostSortMode, PostStatus, PostSummaryListRead, PostSummaryRead,
    PostTagFilterRead, PostTopMediaKind, PostVisibility, PostVisibilityCountsRead,
    ProjectProfilePayload, ProjectProfileRead, ProjectResourceLink, TagMatch, TagRead,
};
pub use queries::{get_post_by_slug, list_post_summaries, list_posts};
pub use service::{create_post, delete_post_by_slug, resolve_post_redirect, update_post_by_slug};
pub use utils::{format_reading_label, normalize_tag_slug, slugify_series_title};
