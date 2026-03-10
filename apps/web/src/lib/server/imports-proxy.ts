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

export function proxyTextResponse(
  response: Response,
  fallbackContentType = "application/json",
): Promise<Response> {
  return response.text().then((responseBody) =>
    new Response(responseBody, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? fallbackContentType,
      },
    }),
  );
}

export function proxyBinaryResponse(
  response: Response,
  fallbackContentType: string,
): Promise<Response> {
  return response.arrayBuffer().then((payload) => {
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
  });
}
