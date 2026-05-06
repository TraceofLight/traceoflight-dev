use serde::Serialize;
use utoipa::ToSchema;

use crate::config::MinioSettings;
use crate::error::AppError;
use crate::media as media_helpers;

const PDF_SIGNATURE: &[u8] = b"%PDF-";
const ALLOWED_CONTENT_TYPES: &[&str] = &["", "application/octet-stream", "application/pdf"];

#[derive(Debug, Clone, Copy)]
pub struct PdfAssetConfig {
    pub object_key: &'static str,
    pub download_filename: &'static str,
    pub validation_label: &'static str,
}

pub const PORTFOLIO_PDF: PdfAssetConfig = PdfAssetConfig {
    object_key: "file/portfolio.pdf",
    download_filename: "portfolio.pdf",
    validation_label: "portfolio",
};

pub const RESUME_PDF: PdfAssetConfig = PdfAssetConfig {
    object_key: "file/resume.pdf",
    download_filename: "resume.pdf",
    validation_label: "resume",
};

#[derive(Debug, Serialize, ToSchema)]
pub struct PdfStatus {
    pub available: bool,
}

pub struct PdfDownload {
    pub filename: String,
    pub content_type: String,
    pub body: Vec<u8>,
}

pub async fn get_status(
    minio: &MinioSettings,
    config: &PdfAssetConfig,
) -> Result<PdfStatus, AppError> {
    let exists = media_helpers::object_exists(minio, config.object_key).await?;
    Ok(PdfStatus { available: exists })
}

pub async fn download_pdf(
    minio: &MinioSettings,
    config: &PdfAssetConfig,
) -> Result<Option<PdfDownload>, AppError> {
    if !media_helpers::object_exists(minio, config.object_key).await? {
        return Ok(None);
    }
    let bytes = media_helpers::fetch_object_bytes(minio, config.object_key).await?;
    Ok(Some(PdfDownload {
        filename: config.download_filename.to_string(),
        content_type: "application/pdf".to_string(),
        body: bytes,
    }))
}

pub async fn upload_pdf(
    minio: &MinioSettings,
    config: &PdfAssetConfig,
    filename: &str,
    data: Vec<u8>,
    content_type: Option<&str>,
) -> Result<PdfStatus, AppError> {
    let normalized_filename = filename.trim();
    let normalized_content_type = content_type
        .unwrap_or("")
        .trim()
        .to_lowercase();

    if normalized_filename.is_empty() {
        return Err(AppError::BadRequest(format!(
            "{} filename is required",
            config.validation_label
        )));
    }
    if !ALLOWED_CONTENT_TYPES
        .iter()
        .any(|c| *c == normalized_content_type)
    {
        return Err(AppError::BadRequest(format!(
            "{} file must be a PDF",
            config.validation_label
        )));
    }
    if !data.starts_with(PDF_SIGNATURE) {
        return Err(AppError::BadRequest(format!(
            "{} file must be a valid PDF",
            config.validation_label
        )));
    }

    media_helpers::put_object_bytes(minio, config.object_key, "application/pdf", data).await?;
    Ok(PdfStatus { available: true })
}

pub async fn delete_pdf(
    minio: &MinioSettings,
    config: &PdfAssetConfig,
) -> Result<PdfStatus, AppError> {
    media_helpers::delete_object(minio, config.object_key).await?;
    Ok(PdfStatus { available: false })
}
