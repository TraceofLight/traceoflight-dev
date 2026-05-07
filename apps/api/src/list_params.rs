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

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_bad_request(err: AppError, expected_substring: &str) {
        match err {
            AppError::BadRequest(msg) => assert!(
                msg.contains(expected_substring),
                "expected msg containing {expected_substring:?}, got {msg:?}"
            ),
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    // ── validate_limit_offset ────────────────────────────────────────────────

    #[test]
    fn validate_limit_offset_applies_defaults_when_none() {
        assert_eq!(validate_limit_offset(None, None, 20, 100).unwrap(), (20, 0));
    }

    #[test]
    fn validate_limit_offset_accepts_min_boundary() {
        assert_eq!(
            validate_limit_offset(Some(1), Some(0), 20, 100).unwrap(),
            (1, 0)
        );
    }

    #[test]
    fn validate_limit_offset_accepts_max_boundary() {
        assert_eq!(
            validate_limit_offset(Some(100), Some(0), 20, 100).unwrap(),
            (100, 0)
        );
    }

    #[test]
    fn validate_limit_offset_rejects_zero_limit() {
        let err = validate_limit_offset(Some(0), Some(0), 20, 100).unwrap_err();
        assert_bad_request(err, "between 1 and 100");
    }

    #[test]
    fn validate_limit_offset_rejects_above_max() {
        let err = validate_limit_offset(Some(101), Some(0), 20, 100).unwrap_err();
        assert_bad_request(err, "between 1 and 100");
    }

    #[test]
    fn validate_limit_offset_error_message_reflects_custom_max() {
        let err = validate_limit_offset(Some(201), Some(0), 50, 200).unwrap_err();
        assert_bad_request(err, "between 1 and 200");
    }

    #[test]
    fn validate_limit_offset_rejects_negative_limit() {
        let err = validate_limit_offset(Some(-3), Some(0), 20, 100).unwrap_err();
        assert_bad_request(err, "between 1 and 100");
    }

    #[test]
    fn validate_limit_offset_rejects_negative_offset() {
        let err = validate_limit_offset(Some(20), Some(-1), 20, 100).unwrap_err();
        assert_bad_request(err, "offset must be >= 0");
    }

    // ── resolve_include_private ──────────────────────────────────────────────

    #[test]
    fn resolve_include_private_anonymous_always_false() {
        assert!(!resolve_include_private(None, false));
        assert!(!resolve_include_private(Some(true), false));
        assert!(!resolve_include_private(Some(false), false));
    }

    #[test]
    fn resolve_include_private_trusted_defaults_true_when_unspecified() {
        assert!(resolve_include_private(None, true));
    }

    #[test]
    fn resolve_include_private_trusted_passes_through_explicit_choice() {
        assert!(resolve_include_private(Some(true), true));
        assert!(!resolve_include_private(Some(false), true));
    }

    // ── effective_visibility ─────────────────────────────────────────────────

    #[test]
    fn effective_visibility_anonymous_forces_published_public() {
        let (status, visibility) = effective_visibility(false, None, None);
        assert_eq!(status, Some(PostStatus::Published));
        assert_eq!(visibility, Some(PostVisibility::Public));
    }

    #[test]
    fn effective_visibility_anonymous_ignores_caller_choices() {
        // Even if an anonymous caller supplies status=draft, it's clamped to
        // published — drafts must never leak to public lists.
        let (status, visibility) =
            effective_visibility(false, Some(PostStatus::Draft), Some(PostVisibility::Private));
        assert_eq!(status, Some(PostStatus::Published));
        assert_eq!(visibility, Some(PostVisibility::Public));
    }

    #[test]
    fn effective_visibility_trusted_passes_through_unchanged() {
        let (status, visibility) =
            effective_visibility(true, Some(PostStatus::Draft), Some(PostVisibility::Private));
        assert_eq!(status, Some(PostStatus::Draft));
        assert_eq!(visibility, Some(PostVisibility::Private));
    }

    #[test]
    fn effective_visibility_trusted_passes_through_none_for_no_filter() {
        let (status, visibility) = effective_visibility(true, None, None);
        assert_eq!(status, None);
        assert_eq!(visibility, None);
    }
}
