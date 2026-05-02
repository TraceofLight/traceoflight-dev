const NO_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);

function isNoBodyStatus(status: number): boolean {
  return NO_BODY_STATUSES.has(status);
}

export function backendUnavailableResponse(): Response {
  return new Response(JSON.stringify({ detail: "backend unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ detail: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export async function proxyTextResponse(
  response: Response,
  fallbackContentType = "application/json",
): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? fallbackContentType;
  const headers = { "content-type": contentType };
  if (isNoBodyStatus(response.status)) {
    return new Response(null, { status: response.status, headers });
  }
  const body = await response.text();
  return new Response(body, { status: response.status, headers });
}

export async function proxyBinaryResponse(
  response: Response,
  fallbackContentType: string,
): Promise<Response> {
  const payload = await response.arrayBuffer();
  const headers = new Headers();
  headers.set("content-type", response.headers.get("content-type") ?? fallbackContentType);
  const disposition = response.headers.get("content-disposition");
  if (disposition) {
    headers.set("content-disposition", disposition);
  }
  return new Response(payload, {
    status: response.status,
    headers,
  });
}
