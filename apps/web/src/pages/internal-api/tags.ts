import type { APIRoute } from "astro";

import { requestBackend } from "../../lib/backend-api";

export const prerender = false;

function backendUnavailableResponse(): Response {
  return new Response(JSON.stringify({ message: "backend unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const query = url.search ? url.search : "";
  let response: Response;
  try {
    response = await requestBackend(`/tags${query}`);
  } catch {
    return backendUnavailableResponse();
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  let response: Response;
  try {
    response = await requestBackend("/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch {
    return backendUnavailableResponse();
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
};
