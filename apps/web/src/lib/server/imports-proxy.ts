export function backendUnavailableImportsResponse(): Response {
  return new Response(JSON.stringify({ message: "backend unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

export function unauthorizedImportsResponse(): Response {
  return new Response(JSON.stringify({ detail: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export async function proxyTextResponse(
  response: Response,
  fallbackContentType = "application/json",
): Promise<Response> {
  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? fallbackContentType,
    },
  });
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
