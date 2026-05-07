use axum::{
    body::Body,
    extract::{Multipart, State},
    http::{StatusCode, header},
    response::{Json, Response},
};

use crate::{
    AppState,
    auth::RequireInternalSecret,
    error::{AppError, ErrorDetail},
    imports::{BackupLoadRead, download_posts_backup, load_posts_backup},
};

#[utoipa::path(
    get,
    path = "/imports/backups/posts.zip",
    tag = "imports",
    operation_id = "download_posts_backup",
    summary = "Download posts backup ZIP",
    description = "Bundle posts, series, tags, comments, site profile, and referenced media into a ZIP archive. Requires `x-internal-api-secret`.",
    responses(
        (status = 200, description = "Backup ZIP stream", content_type = "application/zip"),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn download_posts_backup_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let (filename, bytes) = download_posts_backup(&state.pool, &state.minio).await?;
    let disposition = format!("attachment; filename=\"{filename}\"");
    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(header::CONTENT_DISPOSITION, disposition)
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("response build failed: {e}")))?;
    Ok(response)
}

#[utoipa::path(
    post,
    path = "/imports/backups/load",
    tag = "imports",
    operation_id = "load_posts_backup",
    summary = "Load posts backup ZIP",
    description = "Restore the contents of a backup ZIP. Wipes existing rows in dependency order and rebuilds. Stages media to staging keys first, promotes on DB success, rolls back on DB failure. Requires `x-internal-api-secret`.",
    request_body(content = String, content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Backup restore finished", body = BackupLoadRead),
        (status = 400, description = "Invalid backup payload", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn load_posts_backup_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<BackupLoadRead>, AppError> {
    let mut file_name: Option<String> = None;
    let mut file_bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart parse failed: {e}")))?
    {
        if field.name() == Some("file") {
            file_name = field
                .file_name()
                .map(str::to_string)
                .or(Some(String::new()));
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("multipart body read: {e}")))?;
            file_bytes = Some(bytes.to_vec());
            break;
        }
    }

    let file_name = file_name
        .ok_or_else(|| AppError::BadRequest("`file` multipart field is required".into()))?;
    let file_bytes =
        file_bytes.ok_or_else(|| AppError::BadRequest("`file` multipart field is empty".into()))?;
    let result = load_posts_backup(&state.pool, &state.minio, &file_name, &file_bytes).await?;
    Ok(Json(result))
}
