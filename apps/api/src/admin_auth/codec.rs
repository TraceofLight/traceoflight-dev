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
