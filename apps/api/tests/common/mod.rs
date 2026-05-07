// Shared helpers for integration tests. Each `tests/<topic>.rs` file imports
// this with `mod common;` (this is the cargo convention — files inside
// `tests/common/` are not auto-built as their own test binary).

#![allow(dead_code)] // helpers may be unused in some test files

pub mod app;
pub mod factories;
pub mod http;
