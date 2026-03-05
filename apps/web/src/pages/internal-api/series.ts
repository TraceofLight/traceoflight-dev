import type { APIRoute } from "astro";

import { requestBackend } from "../../lib/backend-api";

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

export const GET: APIRoute = async ({ url }) => {
  const query = url.search ? url.search : "";
  let response: Response;
  try {
    response = await requestBackend(`/series${query}`);
  } catch {
    return backendUnavailableResponse();
  }
  const body = await response.text();
  return createProxiedResponse(response, body);
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  let response: Response;
  try {
    response = await requestBackend("/series", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch {
    return backendUnavailableResponse();
  }
  const responseBody = await response.text();
  return createProxiedResponse(response, responseBody);
};
