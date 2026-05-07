//! HTTP route handlers, grouped by domain. Each submodule re-exports its
//! handler functions and any handler-local query/response DTOs; `lib.rs`
//! glob-imports them so the `routes!()` macro in `build_router` can resolve
//! the handler identifiers without a path prefix.

pub mod admin;
pub mod backup;
pub mod comments;
pub mod infra;
pub mod media;
pub mod pdf;
pub mod posts;
pub mod projects;
pub mod series;
pub mod site_profile;
pub mod tags;
