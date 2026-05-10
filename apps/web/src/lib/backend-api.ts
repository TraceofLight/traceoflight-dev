import { ABSOLUTE_URL_RE } from "./patterns";
import { serverLogger } from "./server/logging";

const DEFAULT_BACKEND_API_URL =
  "http://traceoflight-api:6654/api/v1/web-service";
const LOGGED_BACKEND_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type BackendRequestInit = RequestInit & {
  includeInternalSecret?: boolean;
};

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getBackendApiBaseUrl(): string {
  const configuredUrl = process.env.API_BASE_URL?.trim();
  if (!configuredUrl) return DEFAULT_BACKEND_API_URL;
  return trimTrailingSlash(configuredUrl);
}

export function buildBackendApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getBackendApiBaseUrl()}${normalizedPath}`;
}

export function resolveBackendAssetUrl(
  path: string | undefined,
): string | undefined {
  const normalizedPath = path?.trim();
  if (!normalizedPath) {
    return undefined;
  }

  if (ABSOLUTE_URL_RE.test(normalizedPath)) {
    const parsed = new URL(normalizedPath);
    const backendBaseUrl = new URL(getBackendApiBaseUrl());
    if (
      parsed.pathname.startsWith("/media/") &&
      parsed.host === backendBaseUrl.host
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return normalizedPath;
  }

  if (normalizedPath.startsWith("/")) {
    return normalizedPath;
  }

  return normalizedPath;
}

function buildBackendRequestHeaders(
  existing: HeadersInit | undefined,
  includeInternalSecret: boolean,
): HeadersInit | undefined {
  if (!includeInternalSecret) return existing;
  const sharedSecret = process.env.INTERNAL_API_SECRET?.trim() ?? "";
  if (!sharedSecret) return existing;

  const headers = new Headers(existing ?? {});
  headers.set("x-internal-api-secret", sharedSecret);
  return headers;
}

function getBackendRequestMethod(init: BackendRequestInit | undefined): string {
  return (init?.method ?? "GET").toUpperCase();
}

function shouldLogBackendSuccess(method: string): boolean {
  return LOGGED_BACKEND_METHODS.has(method);
}

function shouldLogBackendNonOk(method: string, status: number): boolean {
  return LOGGED_BACKEND_METHODS.has(method) || status >= 500;
}

export async function requestBackend(
  path: string,
  init?: BackendRequestInit,
): Promise<Response> {
  const includeInternalSecret = init?.includeInternalSecret ?? true;
  const method = getBackendRequestMethod(init);
  const cacheMode =
    init?.cache ?? (includeInternalSecret ? "no-store" : "force-cache");
  const startedAt = Date.now();

  try {
    const response = await fetch(buildBackendApiUrl(path), {
      ...init,
      headers: buildBackendRequestHeaders(init?.headers, includeInternalSecret),
      cache: cacheMode,
    });
    const fields = {
      method,
      path,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      include_internal_secret: includeInternalSecret,
      cache_mode: cacheMode,
    };
    if (!response.ok && shouldLogBackendNonOk(method, response.status)) {
      serverLogger.warn("backend.response_non_ok", fields);
    } else if (response.ok && shouldLogBackendSuccess(method)) {
      serverLogger.info("backend.request_completed", fields);
    }
    return response;
  } catch (error) {
    serverLogger.warn("backend.request_failed", {
      method,
      path,
      duration_ms: Date.now() - startedAt,
      include_internal_secret: includeInternalSecret,
      cache_mode: cacheMode,
      error,
    });
    throw error;
  }
}

export async function requestBackendPublic(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return requestBackend(path, {
    ...init,
    includeInternalSecret: false,
    cache: init?.cache ?? "force-cache",
  });
}
