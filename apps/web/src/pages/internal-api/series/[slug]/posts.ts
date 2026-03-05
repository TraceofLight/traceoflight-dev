import type { APIRoute } from "astro";

import { requestBackend } from "../../../../lib/backend-api";

export const prerender = false;

function backendUnavailableResponse(): Response {
  return new Response(JSON.stringify({ message: "backend unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

function isNoBodyStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

function createProxiedResponse(response: Response, body: string): Response {
  const contentType = response.headers.get("content-type");
  const headers = contentType ? { "content-type": contentType } : undefined;
  if (isNoBodyStatus(response.status)) {
    return new Response(null, {
      status: response.status,
      headers,
    });
  }
  return new Response(body, {
    status: response.status,
    headers,
  });
}

function invalidSlugResponse(): Response {
  return new Response(JSON.stringify({ message: "slug is required" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export const PUT: APIRoute = async ({ params, request, url }) => {
  const slug = params.slug;
  if (!slug) return invalidSlugResponse();

  const query = url.search ? url.search : "";
  const body = await request.text();
  let response: Response;
  try {
    response = await requestBackend(`/series/${slug}/posts${query}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch {
    return backendUnavailableResponse();
  }
  const responseBody = await response.text();
  return createProxiedResponse(response, responseBody);
};
