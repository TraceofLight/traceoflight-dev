//! HMAC-SHA256 codec for admin access/refresh tokens.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPayload {
    pub sub: String,
    #[serde(rename = "type")]
    pub token_type: String,
    pub jti: String,
    pub exp: i64,
    pub iat: i64,
    #[serde(rename = "credentialRevision")]
    pub credential_revision: i32,
}

#[derive(Debug, Clone)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub access_max_age_seconds: i64,
    pub refresh_max_age_seconds: i64,
}

pub struct TokenCodec {
    secret: Vec<u8>,
    access_max_age_seconds: i64,
    refresh_max_age_seconds: i64,
}

impl TokenCodec {
    pub fn new(secret: &str, access_max_age: i64, refresh_max_age: i64) -> Self {
        Self {
            secret: secret.trim().as_bytes().to_vec(),
            access_max_age_seconds: access_max_age,
            refresh_max_age_seconds: refresh_max_age,
        }
    }

    pub fn issue_pair(&self, credential_revision: i32) -> (TokenPair, String) {
        let family_id = Uuid::new_v4().to_string();
        (
            self.issue_pair_with_family(credential_revision, &family_id),
            family_id,
        )
    }

    pub fn issue_pair_with_family(&self, credential_revision: i32, _family_id: &str) -> TokenPair {
        let issued_at = chrono::Utc::now().timestamp();
        let access = TokenPayload {
            sub: "admin".into(),
            token_type: "access".into(),
            jti: Uuid::new_v4().to_string(),
            iat: issued_at,
            exp: issued_at + self.access_max_age_seconds,
            credential_revision,
        };
        let refresh = TokenPayload {
            sub: "admin".into(),
            token_type: "refresh".into(),
            jti: Uuid::new_v4().to_string(),
            iat: issued_at,
            exp: issued_at + self.refresh_max_age_seconds,
            credential_revision,
        };
        TokenPair {
            access_token: self.encode(&access),
            refresh_token: self.encode(&refresh),
            access_max_age_seconds: self.access_max_age_seconds,
            refresh_max_age_seconds: self.refresh_max_age_seconds,
        }
    }

    fn encode(&self, payload: &TokenPayload) -> String {
        let json = serde_json::to_string(payload).expect("payload always serializes");
        let encoded = URL_SAFE_NO_PAD.encode(json.as_bytes());
        let signature = self.sign(&encoded);
        format!("{encoded}.{signature}")
    }

    fn sign(&self, encoded_payload: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(&self.secret).expect("hmac key length");
        mac.update(encoded_payload.as_bytes());
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    }

    pub fn decode_payload_unsafe(&self, token: &str) -> Option<TokenPayload> {
        let (encoded, _) = token.split_once('.')?;
        let raw = URL_SAFE_NO_PAD.decode(encoded.as_bytes()).ok()?;
        serde_json::from_slice(&raw).ok()
    }

    pub fn verify(&self, token: &str, expected_type: &str) -> Option<TokenPayload> {
        let (encoded, signature) = token.split_once('.')?;
        let expected = self.sign(encoded);
        if !constant_time_eq(signature.as_bytes(), expected.as_bytes()) {
            return None;
        }
        let payload = self.decode_payload_unsafe(token)?;
        if payload.token_type != expected_type {
            return None;
        }
        Some(payload)
    }

    pub fn hash_token(&self, token: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(&self.secret).expect("hmac key length");
        mac.update(token.as_bytes());
        let bytes = mac.finalize().into_bytes();
        let mut hex = String::with_capacity(bytes.len() * 2);
        for b in bytes {
            use std::fmt::Write;
            let _ = write!(hex, "{:02x}", b);
        }
        hex
    }
}

pub(super) fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn codec() -> TokenCodec {
        TokenCodec::new("unit-test-secret", 60, 600)
    }

    #[test]
    fn issued_pair_verifies_with_matching_token_types() {
        let c = codec();
        let (pair, _family) = c.issue_pair(7);

        let access = c
            .verify(&pair.access_token, "access")
            .expect("access verifies as access");
        assert_eq!(access.token_type, "access");
        assert_eq!(access.credential_revision, 7);

        let refresh = c
            .verify(&pair.refresh_token, "refresh")
            .expect("refresh verifies as refresh");
        assert_eq!(refresh.token_type, "refresh");
    }

    #[test]
    fn verify_rejects_token_used_with_wrong_type() {
        let c = codec();
        let (pair, _) = c.issue_pair(0);
        // Refresh token must not be accepted as an access token, otherwise a
        // long-lived refresh would unlock the access surface.
        assert!(c.verify(&pair.refresh_token, "access").is_none());
        assert!(c.verify(&pair.access_token, "refresh").is_none());
    }

    #[test]
    fn verify_rejects_tampered_signature() {
        let c = codec();
        let (pair, _) = c.issue_pair(1);
        // Flip the last char of the signature segment.
        let mut tampered = pair.access_token.clone();
        let last = tampered.pop().unwrap();
        let flipped = if last == 'A' { 'B' } else { 'A' };
        tampered.push(flipped);
        assert!(c.verify(&tampered, "access").is_none());
    }

    #[test]
    fn verify_rejects_tampered_payload() {
        let c = codec();
        let (pair, _) = c.issue_pair(1);
        // Flip the first char of the payload segment — signature won't match
        // even though the payload still decodes cleanly.
        let mut tampered = pair.access_token.clone();
        let first = tampered.remove(0);
        let flipped = if first == 'a' { 'b' } else { 'a' };
        tampered.insert(0, flipped);
        assert!(c.verify(&tampered, "access").is_none());
    }

    #[test]
    fn verify_rejects_garbage_input() {
        let c = codec();
        assert!(c.verify("", "access").is_none());
        assert!(c.verify("not-a-token", "access").is_none());
        assert!(c.verify("missing.signature", "access").is_none());
    }

    #[test]
    fn decode_payload_unsafe_returns_payload_without_signature_check() {
        let c = codec();
        let (pair, _) = c.issue_pair(42);
        // Even when we corrupt the signature, the payload portion must still
        // decode — the rotate_refresh_token flow relies on this to recover the
        // jti for revoking compromised families.
        let mut tampered = pair.access_token.clone();
        let _ = tampered.pop();
        tampered.push('X');
        let payload = c
            .decode_payload_unsafe(&tampered)
            .expect("payload still decodes when signature is corrupt");
        assert_eq!(payload.credential_revision, 42);
    }

    #[test]
    fn hash_token_is_deterministic_and_input_sensitive() {
        let c = codec();
        let h1 = c.hash_token("aaa");
        let h2 = c.hash_token("aaa");
        let h3 = c.hash_token("aab");
        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
    }

    #[test]
    fn token_from_one_secret_is_invalid_under_another() {
        let issuer = TokenCodec::new("secret-A", 60, 600);
        let attacker = TokenCodec::new("secret-B", 60, 600);
        let (pair, _) = issuer.issue_pair(0);
        assert!(attacker.verify(&pair.access_token, "access").is_none());
    }

    #[test]
    fn issue_pair_creates_unique_jti_per_call() {
        let c = codec();
        let (a, _) = c.issue_pair(0);
        let (b, _) = c.issue_pair(0);
        let pa = c.verify(&a.access_token, "access").unwrap();
        let pb = c.verify(&b.access_token, "access").unwrap();
        assert_ne!(pa.jti, pb.jti, "each issue must mint a fresh jti");
    }

    #[test]
    fn issue_pair_with_family_keeps_family_id_for_caller() {
        let c = codec();
        let family = "fixed-family-id";
        let pair_a = c.issue_pair_with_family(0, family);
        let pair_b = c.issue_pair_with_family(0, family);
        // Tokens themselves still differ (fresh jti each call), but the codec
        // does not bind family-id into the payload — it's caller-managed state.
        assert_ne!(pair_a.refresh_token, pair_b.refresh_token);
    }

    // ── constant_time_eq ─────────────────────────────────────────────────────

    #[test]
    fn constant_time_eq_matches_only_identical_byte_strings() {
        assert!(constant_time_eq(b"", b""));
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        // Different lengths must short-circuit to false (and notably, never
        // panic) — this is the one case where constant-time guarantees are
        // intentionally broken because length leakage is unavoidable.
        assert!(!constant_time_eq(b"abc", b"abcd"));
        assert!(!constant_time_eq(b"abcd", b"abc"));
    }
}
