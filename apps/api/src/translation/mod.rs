//! Auto-translation pipeline. Korean (`ko`) is the source of truth; on
//! create/update of a `ko` row in `posts` or `series`, jobs are pushed to
//! a Redis-backed queue. A tokio worker drains the queue and writes the
//! `en`/`ja`/`zh` siblings via a pluggable [`TranslationProvider`].
//!
//! Currently provided implementation: [`GoogleTranslateProvider`] (Google
//! Translate Basic v2). The trait makes it easy to swap to Advanced (v3)
//! with glossary support later, or to a fake for tests.

mod hash;
mod markdown;
pub mod provider;
mod queue;
pub mod worker;

pub use provider::{GoogleTranslateProvider, TranslationError, TranslationProvider};
pub use queue::{EntityKind, TranslationJob, TranslationQueue};

/// Targets a `ko` source row gets translated into. Excludes `ko` itself.
pub const TARGET_LOCALES: [&str; 3] = ["en", "ja", "zh"];

/// Convenience producer used by the post/series write paths. Pushes one
/// job per target locale. Errors are logged at WARN; never propagated to
/// the caller — translation queue down should not break a save. Accepts
/// `Option` so callers don't need to gate on Redis being configured.
pub async fn enqueue_for_locales(
    queue: Option<&TranslationQueue>,
    entity: EntityKind,
    source_id: uuid::Uuid,
) {
    for target in TARGET_LOCALES {
        enqueue_for_locale(queue, entity, source_id, target).await;
    }
}

/// Queue one target locale for explicit retranslation. This is used by admin
/// controls on translated pages, where the source row is already known.
pub async fn enqueue_for_locale(
    queue: Option<&TranslationQueue>,
    entity: EntityKind,
    source_id: uuid::Uuid,
    target_locale: &str,
) {
    let Some(queue) = queue else {
        tracing::warn!(
            event = "translation.enqueue_skipped",
            entity = ?entity,
            source_id = %source_id,
            target = target_locale,
            reason = "queue_not_configured",
            "translation enqueue skipped"
        );
        return;
    };
    let job = TranslationJob {
        entity,
        source_id,
        target_locale: target_locale.to_string(),
    };
    match queue.push(&job).await {
        Ok(queue_len) => {
            tracing::info!(
                event = "translation.enqueue_succeeded",
                entity = ?entity,
                source_id = %source_id,
                target = target_locale,
                queue_len,
                "translation enqueue succeeded"
            );
        }
        Err(err) => {
            tracing::warn!(
                event = "translation.enqueue_failed",
                error = %err,
                entity = ?entity,
                source_id = %source_id,
                target = target_locale,
                "translation queue: enqueue failed (save still committed)",
            );
        }
    }
}
