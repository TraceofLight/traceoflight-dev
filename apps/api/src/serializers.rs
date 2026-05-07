//! Shared serde helpers for date-time fields.
//!
//! Every API datetime field is rendered with 6-digit microsecond precision and
//! a `Z` suffix regardless of the stored value's fractional precision, so the
//! JSON representation stays stable byte-for-byte across rows.

use chrono::{DateTime, Utc};

pub fn serialize_dt_us<S: serde::Serializer>(
    dt: &DateTime<Utc>,
    ser: S,
) -> Result<S::Ok, S::Error> {
    ser.serialize_str(&dt.format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string())
}

pub fn serialize_dt_us_opt<S: serde::Serializer>(
    opt: &Option<DateTime<Utc>>,
    ser: S,
) -> Result<S::Ok, S::Error> {
    match opt {
        Some(dt) => serialize_dt_us(dt, ser),
        None => ser.serialize_none(),
    }
}
