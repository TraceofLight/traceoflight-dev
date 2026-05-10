import { serverLogger } from "./logging";

const NO_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);

function isNoBodyStatus(status: number): boolean {
  return NO_BODY_STATUSES.has(status);
}

export function backendUnavailableResponse(): Response {
  serverLogger.debug("proxy.backend_unavailable_returned", { status: 503 });
  return new Response(JSON.stringify({ detail: "backend unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

export function unauthorizedResponse(): Response {
  serverLogger.debug("proxy.unauthorized_returned", { status: 401 });
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
    serverLogger.debug("proxy.text_response_returned", {
      status: response.status,
      content_type: contentType,
      payload_length: 0,
      no_body_status: true,
    });
    return new Response(null, { status: response.status, headers });
  }
  const body = await response.text();
  serverLogger.debug("proxy.text_response_returned", {
    status: response.status,
    content_type: contentType,
    payload_length: body.length,
    no_body_status: false,
  });
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
  serverLogger.debug("proxy.binary_response_returned", {
    status: response.status,
    content_type: headers.get("content-type") ?? fallbackContentType,
    payload_bytes: payload.byteLength,
    has_content_disposition: Boolean(disposition),
  });
  return new Response(payload, {
    status: response.status,
    headers,
  });
}
