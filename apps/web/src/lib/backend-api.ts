const DEFAULT_BACKEND_API_URL = 'http://traceoflight-api:6654/api/v1';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getBackendApiBaseUrl(): string {
  const configuredUrl = process.env.API_BASE_URL?.trim();
  if (!configuredUrl) return DEFAULT_BACKEND_API_URL;
  return trimTrailingSlash(configuredUrl);
}

export function buildBackendApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getBackendApiBaseUrl()}${normalizedPath}`;
}

function buildBackendRequestHeaders(existing: HeadersInit | undefined): HeadersInit | undefined {
  const sharedSecret = process.env.INTERNAL_API_SECRET?.trim() ?? '';
  if (!sharedSecret) return existing;

  const headers = new Headers(existing ?? {});
  headers.set('x-internal-api-secret', sharedSecret);
  return headers;
}

export async function requestBackend(path: string, init?: RequestInit): Promise<Response> {
  return fetch(buildBackendApiUrl(path), {
    ...init,
    headers: buildBackendRequestHeaders(init?.headers),
    cache: init?.cache ?? 'no-store',
  });
}
