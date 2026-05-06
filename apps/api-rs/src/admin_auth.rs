use std::sync::Arc;

use argon2::{password_hash::PasswordHash, Argon2, PasswordHasher, PasswordVerifier};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use redis::{aio::ConnectionManager, AsyncCommands};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::config::AdminSettings;
use crate::error::AppError;

const OPERATIONAL_KEY: &str = "operational-admin";
const MIN_LOGIN_ID_LEN: usize = 3;
const MIN_PASSWORD_LEN: usize = 8;

type HmacSha256 = Hmac<Sha256>;

// ── DTOs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, ToSchema)]
pub struct AdminAuthLoginRequest {
    pub login_id: String,
    pub password: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminAuthLoginResponse {
    pub ok: bool,
    pub credential_source: String,
    pub credential_revision: i32,
    pub access_token: String,
    pub refresh_token: String,
    pub access_max_age_seconds: i64,
    pub refresh_max_age_seconds: i64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AdminRefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminRefreshResponse {
    pub ok: bool,
    pub credential_revision: i32,
    pub access_token: String,
    pub refresh_token: String,
    pub access_max_age_seconds: i64,
    pub refresh_max_age_seconds: i64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AdminLogoutRequest {
    pub refresh_token: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminLogoutResponse {
    pub ok: bool,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AdminCredentialUpdateRequest {
    pub login_id: String,
    pub password: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminCredentialUpdateResponse {
    pub login_id: String,
    pub credential_revision: i32,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminCredentialRevisionResponse {
    pub credential_revision: i32,
}

// ── Token codec (HMAC-SHA256 over JSON payload) ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPayload {
    sub: String,
    #[serde(rename = "type")]
    token_type: String,
    jti: String,
    exp: i64,
    iat: i64,
    #[serde(rename = "credentialRevision")]
    credential_revision: i32,
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
        (self.issue_pair_with_family(credential_revision, &family_id), family_id)
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

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

// ── Refresh state stored in Redis ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshState {
    pub jti: String,
    pub family_id: String,
    pub token_hash: String,
    pub expires_at: i64,
    pub credential_revision: i32,
    #[serde(default)]
    pub parent_jti: Option<String>,
    #[serde(default)]
    pub rotated_to_jti: Option<String>,
    #[serde(default)]
    pub used: bool,
    #[serde(default)]
    pub revoked: bool,
}

#[derive(Clone)]
pub struct RefreshStore {
    conn: ConnectionManager,
}

impl RefreshStore {
    pub fn new(conn: ConnectionManager) -> Self {
        Self { conn }
    }

    fn state_key(jti: &str) -> String {
        format!("admin:refresh:{jti}")
    }
    fn family_key(family_id: &str) -> String {
        format!("admin:refresh:family:{family_id}:revoked")
    }

    pub async fn get_state(&self, jti: &str) -> Result<Option<RefreshState>, AppError> {
        let mut conn = self.conn.clone();
        let raw: Option<String> = conn
            .get(Self::state_key(jti))
            .await
            .map_err(redis_to_app)?;
        let Some(raw) = raw else { return Ok(None) };
        let state: RefreshState = serde_json::from_str(&raw)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("invalid refresh state: {err}")))?;
        Ok(Some(state))
    }

    pub async fn set_state(&self, state: &RefreshState) -> Result<(), AppError> {
        let now_seconds = chrono::Utc::now().timestamp();
        let ttl_seconds = (state.expires_at - now_seconds).max(1);
        let json = serde_json::to_string(&state)
            .map_err(|err| AppError::Internal(anyhow::anyhow!("refresh state serialize: {err}")))?;
        let mut conn = self.conn.clone();
        let _: () = conn
            .set_ex(Self::state_key(&state.jti), json, ttl_seconds as u64)
            .await
            .map_err(redis_to_app)?;
        Ok(())
    }

    pub async fn revoke_family(&self, family_id: &str, ttl_seconds: i64) -> Result<(), AppError> {
        let mut conn = self.conn.clone();
        let _: () = conn
            .set_ex(Self::family_key(family_id), "1", ttl_seconds.max(1) as u64)
            .await
            .map_err(redis_to_app)?;
        Ok(())
    }

    pub async fn is_family_revoked(&self, family_id: &str) -> Result<bool, AppError> {
        let mut conn = self.conn.clone();
        let exists: i64 = conn
            .exists(Self::family_key(family_id))
            .await
            .map_err(redis_to_app)?;
        Ok(exists > 0)
    }
}

fn redis_to_app(err: redis::RedisError) -> AppError {
    AppError::Internal(anyhow::anyhow!("redis error: {err}"))
}

// ── Service ─────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AdminAuthContext {
    pub settings: Arc<AdminSettings>,
    pub codec: Arc<TokenCodec>,
    pub refresh_store: Option<RefreshStore>,
}

impl AdminAuthContext {
    pub fn new(
        settings: AdminSettings,
        refresh_store: Option<RefreshStore>,
    ) -> Self {
        let codec = TokenCodec::new(
            &settings.session_secret,
            settings.access_max_age_seconds,
            settings.refresh_max_age_seconds,
        );
        Self {
            settings: Arc::new(settings),
            codec: Arc::new(codec),
            refresh_store,
        }
    }

    fn require_store(&self) -> Result<&RefreshStore, AppError> {
        self.refresh_store
            .as_ref()
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("refresh store not configured")))
    }
}

#[derive(Debug, FromRow)]
struct AdminCredentialRow {
    login_id: String,
    password_hash: String,
    credential_revision: i32,
}

async fn get_operational_credential(
    pool: &PgPool,
) -> Result<Option<AdminCredentialRow>, sqlx::Error> {
    sqlx::query_as::<_, AdminCredentialRow>(
        "SELECT login_id, password_hash, credential_revision FROM admin_credentials WHERE key = $1",
    )
    .bind(OPERATIONAL_KEY)
    .fetch_optional(pool)
    .await
}

async fn save_operational_credential(
    pool: &PgPool,
    login_id: &str,
    password_hash: &str,
    credential_revision: i32,
) -> Result<AdminCredentialRow, sqlx::Error> {
    sqlx::query_as::<_, AdminCredentialRow>(
        r#"
        INSERT INTO admin_credentials (key, login_id, password_hash, credential_revision)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key) DO UPDATE SET
            login_id = EXCLUDED.login_id,
            password_hash = EXCLUDED.password_hash,
            credential_revision = EXCLUDED.credential_revision,
            updated_at = NOW()
        RETURNING login_id, password_hash, credential_revision
        "#,
    )
    .bind(OPERATIONAL_KEY)
    .bind(login_id)
    .bind(password_hash)
    .bind(credential_revision)
    .fetch_one(pool)
    .await
}

#[derive(Debug)]
struct VerifyResult {
    credential_source: Option<&'static str>,
    revision: i32,
}

async fn verify_credentials(
    pool: &PgPool,
    settings: &AdminSettings,
    login_id: &str,
    password: &str,
) -> Result<VerifyResult, AppError> {
    let normalized_login = login_id.trim();
    if normalized_login.is_empty() || password.is_empty() {
        return Ok(VerifyResult {
            credential_source: None,
            revision: 0,
        });
    }

    let operational = get_operational_credential(pool).await?;
    if let Some(op) = &operational {
        if constant_time_eq(normalized_login.as_bytes(), op.login_id.as_bytes())
            && verify_hash(&op.password_hash, password)
        {
            return Ok(VerifyResult {
                credential_source: Some("operational"),
                revision: op.credential_revision,
            });
        }
    }

    let active_revision = operational.as_ref().map(|op| op.credential_revision).unwrap_or(0);
    if verify_master(settings, normalized_login, password) {
        return Ok(VerifyResult {
            credential_source: Some("master"),
            revision: active_revision,
        });
    }

    Ok(VerifyResult {
        credential_source: None,
        revision: active_revision,
    })
}

fn verify_master(settings: &AdminSettings, login_id: &str, password: &str) -> bool {
    let configured_login = settings.login_id.trim();
    let configured_hash = settings.login_password_hash.trim();
    let configured_password = settings.login_password.trim();
    if configured_login.is_empty() || (configured_hash.is_empty() && configured_password.is_empty())
    {
        return false;
    }
    if !constant_time_eq(login_id.as_bytes(), configured_login.as_bytes()) {
        return false;
    }
    if !configured_hash.is_empty() {
        return verify_hash(configured_hash, password);
    }
    constant_time_eq(password.as_bytes(), configured_password.as_bytes())
}

fn verify_hash(stored: &str, password: &str) -> bool {
    if stored.starts_with("$argon2") {
        let Ok(parsed) = PasswordHash::new(stored) else {
            return false;
        };
        return Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok();
    }
    if let Some(rest) = stored.strip_prefix("sha256:") {
        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        let actual = hasher.finalize();
        let mut hex = String::with_capacity(actual.len() * 2);
        for b in actual {
            use std::fmt::Write;
            let _ = write!(hex, "{:02x}", b);
        }
        return constant_time_eq(hex.as_bytes(), rest.as_bytes());
    }
    false
}

pub async fn login(
    pool: &PgPool,
    ctx: &AdminAuthContext,
    payload: AdminAuthLoginRequest,
) -> Result<AdminAuthLoginResponse, AppError> {
    let verify = verify_credentials(pool, &ctx.settings, &payload.login_id, &payload.password).await?;
    let Some(source) = verify.credential_source else {
        return Err(AppError::UnauthorizedDetail("invalid admin credentials".into()));
    };

    let store = ctx.require_store()?;
    let (pair, family_id) = ctx.codec.issue_pair(verify.revision);
    let refresh_payload = ctx
        .codec
        .verify(&pair.refresh_token, "refresh")
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("issued refresh failed self-verify")))?;
    store
        .set_state(&RefreshState {
            jti: refresh_payload.jti,
            family_id,
            token_hash: ctx.codec.hash_token(&pair.refresh_token),
            expires_at: refresh_payload.exp,
            credential_revision: verify.revision,
            parent_jti: None,
            rotated_to_jti: None,
            used: false,
            revoked: false,
        })
        .await?;

    Ok(AdminAuthLoginResponse {
        ok: true,
        credential_source: source.to_string(),
        credential_revision: verify.revision,
        access_token: pair.access_token,
        refresh_token: pair.refresh_token,
        access_max_age_seconds: pair.access_max_age_seconds,
        refresh_max_age_seconds: pair.refresh_max_age_seconds,
    })
}

#[allow(dead_code)] // `revision` reserved for future telemetry/logging
pub enum RefreshOutcome {
    Rotated {
        revision: i32,
        pair: TokenPair,
    },
    Stale {
        revision: i32,
    },
    InvalidOrExpired {
        kind: &'static str,
        revision: i32,
    },
    ReuseDetected {
        revision: i32,
    },
}

pub async fn rotate_refresh_token(
    pool: &PgPool,
    ctx: &AdminAuthContext,
    refresh_token: &str,
) -> Result<RefreshOutcome, AppError> {
    let store = ctx.require_store()?;

    let unsafe_payload = ctx.codec.decode_payload_unsafe(refresh_token);
    let state_from_unsafe = match &unsafe_payload {
        Some(p) => store.get_state(&p.jti).await?,
        None => None,
    };

    let payload = match ctx.codec.verify(refresh_token, "refresh") {
        Some(p) => p,
        None => {
            if let Some(state) = state_from_unsafe {
                revoke_family_for(store, &state).await?;
                return Ok(RefreshOutcome::ReuseDetected {
                    revision: state.credential_revision,
                });
            }
            return Ok(RefreshOutcome::InvalidOrExpired {
                kind: "invalid",
                revision: 0,
            });
        }
    };

    let now_seconds = chrono::Utc::now().timestamp();
    if payload.exp <= now_seconds {
        if let Some(mut state) = state_from_unsafe {
            state.revoked = true;
            store.set_state(&state).await?;
        }
        return Ok(RefreshOutcome::InvalidOrExpired {
            kind: "expired",
            revision: payload.credential_revision,
        });
    }

    let state = match store.get_state(&payload.jti).await? {
        Some(s) => s,
        None => {
            return Ok(RefreshOutcome::InvalidOrExpired {
                kind: "invalid",
                revision: payload.credential_revision,
            })
        }
    };

    let active_revision = match get_operational_credential(pool).await? {
        Some(op) => op.credential_revision,
        None => 0,
    };
    if payload.credential_revision != active_revision {
        let mut s = state.clone();
        s.revoked = true;
        store.set_state(&s).await?;
        return Ok(RefreshOutcome::InvalidOrExpired {
            kind: "invalid",
            revision: payload.credential_revision,
        });
    }
    if state.expires_at <= now_seconds {
        let mut s = state.clone();
        s.revoked = true;
        store.set_state(&s).await?;
        return Ok(RefreshOutcome::InvalidOrExpired {
            kind: "expired",
            revision: state.credential_revision,
        });
    }

    let token_hash = ctx.codec.hash_token(refresh_token);
    if !constant_time_eq(token_hash.as_bytes(), state.token_hash.as_bytes()) {
        revoke_family_for(store, &state).await?;
        return Ok(RefreshOutcome::ReuseDetected {
            revision: state.credential_revision,
        });
    }
    if store.is_family_revoked(&state.family_id).await? {
        return Ok(RefreshOutcome::ReuseDetected {
            revision: state.credential_revision,
        });
    }

    if state.used {
        let child_state = match &state.rotated_to_jti {
            Some(jti) => store.get_state(jti).await?,
            None => None,
        };
        let child_alive = match &child_state {
            Some(child) => {
                !child.revoked
                    && child.expires_at > now_seconds
                    && !store.is_family_revoked(&child.family_id).await?
            }
            None => false,
        };
        if child_alive {
            return Ok(RefreshOutcome::Stale {
                revision: state.credential_revision,
            });
        }
        revoke_family_for(store, &state).await?;
        return Ok(RefreshOutcome::ReuseDetected {
            revision: state.credential_revision,
        });
    }
    if state.revoked {
        revoke_family_for(store, &state).await?;
        return Ok(RefreshOutcome::ReuseDetected {
            revision: state.credential_revision,
        });
    }

    let next_pair = ctx
        .codec
        .issue_pair_with_family(state.credential_revision, &state.family_id);
    let next_payload = ctx
        .codec
        .verify(&next_pair.refresh_token, "refresh")
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("rotated refresh failed self-verify")))?;
    store
        .set_state(&RefreshState {
            jti: next_payload.jti.clone(),
            family_id: state.family_id.clone(),
            token_hash: ctx.codec.hash_token(&next_pair.refresh_token),
            expires_at: next_payload.exp,
            credential_revision: state.credential_revision,
            parent_jti: Some(state.jti.clone()),
            rotated_to_jti: None,
            used: false,
            revoked: false,
        })
        .await?;
    let mut prev = state.clone();
    prev.used = true;
    prev.revoked = true;
    prev.rotated_to_jti = Some(next_payload.jti);
    store.set_state(&prev).await?;

    Ok(RefreshOutcome::Rotated {
        revision: state.credential_revision,
        pair: next_pair,
    })
}

pub async fn revoke_refresh_token_family(
    ctx: &AdminAuthContext,
    refresh_token: &str,
) -> Result<(), AppError> {
    let store = ctx.require_store()?;
    let Some(payload) = ctx.codec.verify(refresh_token, "refresh") else {
        return Ok(());
    };
    let Some(state) = store.get_state(&payload.jti).await? else {
        return Ok(());
    };
    revoke_family_for(store, &state).await
}

async fn revoke_family_for(store: &RefreshStore, state: &RefreshState) -> Result<(), AppError> {
    let now_seconds = chrono::Utc::now().timestamp();
    let ttl = (state.expires_at - now_seconds).max(1);
    store.revoke_family(&state.family_id, ttl).await
}

pub async fn get_active_credential_revision(pool: &PgPool) -> Result<i32, sqlx::Error> {
    Ok(get_operational_credential(pool)
        .await?
        .map(|op| op.credential_revision)
        .unwrap_or(0))
}

pub async fn update_operational_credentials(
    pool: &PgPool,
    payload: AdminCredentialUpdateRequest,
) -> Result<AdminCredentialUpdateResponse, AppError> {
    let login_id = payload.login_id.trim();
    if login_id.len() < MIN_LOGIN_ID_LEN {
        return Err(AppError::BadRequest(
            "login_id must be at least 3 characters".into(),
        ));
    }
    if login_id.chars().any(char::is_whitespace) {
        return Err(AppError::BadRequest(
            "login_id must not contain whitespace".into(),
        ));
    }
    if payload.password.len() < MIN_PASSWORD_LEN {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    let current = get_operational_credential(pool).await?;
    let next_revision = current.as_ref().map(|c| c.credential_revision + 1).unwrap_or(1);

    let salt = argon2::password_hash::SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    let password_hash = Argon2::default()
        .hash_password(payload.password.as_bytes(), &salt)
        .map_err(|err| AppError::Internal(anyhow::anyhow!("password hash failed: {err}")))?
        .to_string();

    let saved = save_operational_credential(pool, login_id, &password_hash, next_revision).await?;
    Ok(AdminCredentialUpdateResponse {
        login_id: saved.login_id,
        credential_revision: saved.credential_revision,
    })
}
