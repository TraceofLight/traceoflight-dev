//! Helpers for list endpoints: limit/offset validation and the visibility
//! filter resolution that depends on whether the caller is trusted.

use crate::error::AppError;
use crate::posts::{PostStatus, PostVisibility};

/// Validate paginated list parameters against shared rules and apply defaults.
///
/// `min` is fixed at 1; both `default` and `max` vary by endpoint.
pub fn validate_limit_offset(
    limit: Option<i64>,
    offset: Option<i64>,
    default: i64,
    max: i64,
) -> Result<(i64, i64), AppError> {
    let limit = limit.unwrap_or(default);
    let offset = offset.unwrap_or(0);
    if !(1..=max).contains(&limit) {
        return Err(AppError::BadRequest(format!(
            "limit must be between 1 and {max}"
        )));
    }
    if offset < 0 {
        return Err(AppError::BadRequest("offset must be >= 0".into()));
    }
    Ok((limit, offset))
}

/// Resolve `include_private` per caller trust. Anonymous callers can never
/// include private rows; trusted callers default to `true` when unspecified.
pub fn resolve_include_private(supplied: Option<bool>, trusted: bool) -> bool {
    if !trusted {
        return false;
    }
    supplied.unwrap_or(true)
}

/// Resolve status/visibility filters per caller trust:
/// - trusted (valid internal-secret): pass through caller's choice, including
///   `None` which means "no filter" (drafts, archived, private all visible).
/// - anonymous: force published+public regardless of what was requested.
pub fn effective_visibility(
    trusted: bool,
    status: Option<PostStatus>,
    visibility: Option<PostVisibility>,
) -> (Option<PostStatus>, Option<PostVisibility>) {
    if trusted {
        (status, visibility)
    } else {
        (Some(PostStatus::Published), Some(PostVisibility::Public))
    }
}
