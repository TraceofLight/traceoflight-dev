import { normalizeJsonError } from "./feedback";
import type { AssetKind, UploadBundle, UploadUrlResponse } from "./types";

const PRIVATE_UPLOAD_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "traceoflight-minio",
  "minio",
]);

function resolveAssetKind(mimeType: string): AssetKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

function buildMediaUrl(baseUrl: string, objectKey: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return `${trimmed}/${objectKey}`;
}

function buildMarkdownSnippet(
  kind: AssetKind,
  fileName: string,
  mediaUrl: string,
): string {
  if (kind === "image") return `![](${mediaUrl})`;
  if (kind === "video") return `<video controls src="${mediaUrl}"></video>`;
  return `[${fileName}](${mediaUrl})`;
}

function shouldProxyUpload(uploadUrl: string): boolean {
  try {
    const parsed = new URL(uploadUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return true;
    if (window.location.protocol === "https:" && parsed.protocol === "http:")
      return true;
    return PRIVATE_UPLOAD_HOSTS.has(parsed.hostname);
  } catch {
    return true;
  }
}

export function normalizeMediaBaseUrl(
  rawValue: string,
  origin: string,
): string {
  const trimmed = rawValue.trim();
  if (trimmed.length > 0) return trimmed.replace(/\/+$/, "");
  return `${origin}/media`;
}

export function extractFileFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

async function uploadBinaryToStorage(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const binaryContentType = file.type || "application/octet-stream";

  if (shouldProxyUpload(uploadUrl)) {
    const response = await fetch("/internal-api/media/upload-proxy", {
      method: "POST",
      headers: {
        "content-type": binaryContentType,
        "x-upload-url": uploadUrl,
        "x-upload-content-type": binaryContentType,
      },
      body: file,
    });
    if (!response.ok) {
      const errorPayload = (await response.json().catch(() => null)) as unknown;
      throw new Error(normalizeJsonError(errorPayload));
    }
    return;
  }

  const uploadResult = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": binaryContentType },
    body: file,
  });
  if (!uploadResult.ok) {
    throw new Error("failed to upload file to object storage");
  }
}

export async function createUploadBundle(
  file: File,
  mediaBaseUrl: string,
): Promise<UploadBundle> {
  const kind = resolveAssetKind(file.type);

  const uploadUrlResponse = await fetch("/internal-api/media/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
    }),
  });

  if (!uploadUrlResponse.ok) {
    const errorPayload = (await uploadUrlResponse
      .json()
      .catch(() => null)) as unknown;
    throw new Error(normalizeJsonError(errorPayload));
  }

  const uploadInfo = (await uploadUrlResponse.json()) as UploadUrlResponse;
  await uploadBinaryToStorage(uploadInfo.upload_url, file);

  const registerResponse = await fetch("/internal-api/media/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      original_filename: file.name,
      mime_type: file.type || "application/octet-stream",
      object_key: uploadInfo.object_key,
      size_bytes: file.size,
    }),
  });
  if (!registerResponse.ok) {
    const errorPayload = (await registerResponse
      .json()
      .catch(() => null)) as unknown;
    throw new Error(normalizeJsonError(errorPayload));
  }

  const mediaUrl = buildMediaUrl(mediaBaseUrl, uploadInfo.object_key);
  return {
    mediaUrl,
    snippet: buildMarkdownSnippet(kind, file.name, mediaUrl),
  };
}
