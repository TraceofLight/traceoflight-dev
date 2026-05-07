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
    pdf_assets::{
        PORTFOLIO_PDF, PdfAssetConfig, PdfStatus, RESUME_PDF, delete_pdf, download_pdf,
        get_status as pdf_status, upload_pdf,
    },
};

async fn handle_pdf_status(
    state: &AppState,
    config: &PdfAssetConfig,
) -> Result<Json<PdfStatus>, AppError> {
    Ok(Json(pdf_status(&state.minio, config).await?))
}

async fn handle_pdf_download(
    state: &AppState,
    config: &PdfAssetConfig,
) -> Result<Response, AppError> {
    let download = download_pdf(&state.minio, config)
        .await?
        .ok_or_else(|| AppError::NotFound(missing_detail(config)))?;
    let disposition = format!("inline; filename=\"{}\"", download.filename);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, download.content_type)
        .header(header::CONTENT_DISPOSITION, disposition)
        .body(Body::from(download.body))
        .map_err(|e| AppError::Internal(anyhow::anyhow!("response build failed: {e}")))
}

fn missing_detail(config: &PdfAssetConfig) -> &'static str {
    if config.object_key == PORTFOLIO_PDF.object_key {
        "portfolio pdf is not registered"
    } else {
        "resume pdf is not registered"
    }
}

async fn handle_pdf_upload(
    state: &AppState,
    config: &PdfAssetConfig,
    mut multipart: Multipart,
) -> Result<Json<PdfStatus>, AppError> {
    let mut filename: Option<String> = None;
    let mut content_type: Option<String> = None;
    let mut data: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("multipart parse failed: {e}")))?
    {
        if field.name() == Some("file") {
            filename = field
                .file_name()
                .map(str::to_string)
                .or(Some(String::new()));
            content_type = field.content_type().map(str::to_string);
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("multipart body read: {e}")))?;
            data = Some(bytes.to_vec());
            break;
        }
    }
    let filename = filename
        .ok_or_else(|| AppError::BadRequest("`file` multipart field is required".into()))?;
    let data =
        data.ok_or_else(|| AppError::BadRequest("`file` multipart field is empty".into()))?;
    let status = upload_pdf(
        &state.minio,
        config,
        &filename,
        data,
        content_type.as_deref(),
    )
    .await?;
    Ok(Json(status))
}

#[utoipa::path(
    get,
    path = "/portfolio/status",
    tag = "portfolio",
    operation_id = "get_portfolio_status",
    summary = "Read portfolio PDF status",
    responses(
        (status = 200, description = "Status returned", body = PdfStatus),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn get_portfolio_status_handler(
    State(state): State<AppState>,
) -> Result<Json<PdfStatus>, AppError> {
    handle_pdf_status(&state, &PORTFOLIO_PDF).await
}

#[utoipa::path(
    get,
    path = "/portfolio",
    tag = "portfolio",
    operation_id = "get_portfolio_pdf",
    summary = "Download public portfolio PDF",
    responses(
        (status = 200, description = "PDF binary", content_type = "application/pdf"),
        (status = 404, description = "Portfolio PDF not registered", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn get_portfolio_pdf_handler(State(state): State<AppState>) -> Result<Response, AppError> {
    handle_pdf_download(&state, &PORTFOLIO_PDF).await
}

#[utoipa::path(
    post,
    path = "/portfolio",
    tag = "portfolio",
    operation_id = "upload_portfolio_pdf",
    summary = "Upload or replace portfolio PDF",
    request_body(content = String, content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Upload accepted", body = PdfStatus),
        (status = 400, description = "Invalid filename / content-type / signature", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn upload_portfolio_pdf_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<Json<PdfStatus>, AppError> {
    handle_pdf_upload(&state, &PORTFOLIO_PDF, multipart).await
}

#[utoipa::path(
    delete,
    path = "/portfolio",
    tag = "portfolio",
    operation_id = "delete_portfolio_pdf",
    summary = "Delete portfolio PDF",
    responses(
        (status = 200, description = "Deletion acknowledged", body = PdfStatus),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn delete_portfolio_pdf_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
) -> Result<Json<PdfStatus>, AppError> {
    Ok(Json(delete_pdf(&state.minio, &PORTFOLIO_PDF).await?))
}

#[utoipa::path(
    get,
    path = "/resume/status",
    tag = "resume",
    operation_id = "get_resume_status",
    summary = "Read resume PDF status",
    responses(
        (status = 200, description = "Status returned", body = PdfStatus),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn get_resume_status_handler(
    State(state): State<AppState>,
) -> Result<Json<PdfStatus>, AppError> {
    handle_pdf_status(&state, &RESUME_PDF).await
}

#[utoipa::path(
    get,
    path = "/resume",
    tag = "resume",
    operation_id = "get_resume_pdf",
    summary = "Download public resume PDF",
    responses(
        (status = 200, description = "PDF binary", content_type = "application/pdf"),
        (status = 404, description = "Resume PDF not registered", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
)]
pub async fn get_resume_pdf_handler(State(state): State<AppState>) -> Result<Response, AppError> {
    handle_pdf_download(&state, &RESUME_PDF).await
}

#[utoipa::path(
    post,
    path = "/resume",
    tag = "resume",
    operation_id = "upload_resume_pdf",
    summary = "Upload or replace resume PDF",
    request_body(content = String, content_type = "multipart/form-data"),
    responses(
        (status = 200, description = "Upload accepted", body = PdfStatus),
        (status = 400, description = "Invalid filename / content-type / signature", body = ErrorDetail),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn upload_resume_pdf_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
    multipart: Multipart,
) -> Result<Json<PdfStatus>, AppError> {
    handle_pdf_upload(&state, &RESUME_PDF, multipart).await
}

#[utoipa::path(
    delete,
    path = "/resume",
    tag = "resume",
    operation_id = "delete_resume_pdf",
    summary = "Delete resume PDF",
    responses(
        (status = 200, description = "Deletion acknowledged", body = PdfStatus),
        (status = 401, description = "Missing or invalid internal API secret", body = ErrorDetail),
        (status = 500, description = "Internal error", body = ErrorDetail),
    ),
    security(("internal_api_secret" = [])),
)]
pub async fn delete_resume_pdf_handler(
    _: RequireInternalSecret,
    State(state): State<AppState>,
) -> Result<Json<PdfStatus>, AppError> {
    Ok(Json(delete_pdf(&state.minio, &RESUME_PDF).await?))
}
