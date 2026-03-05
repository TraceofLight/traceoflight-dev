import type { APIRoute } from "astro";

import { requestBackend } from "../../../lib/backend-api";

export const prerender = false;

function backendUnavailableResponse(): Response {
  return new Response(JSON.stringify({ message: "backend unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

function missingSlugResponse(): Response {
  return new Response(JSON.stringify({ message: "slug is required" }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const slug = params.slug;
  if (!slug) return missingSlugResponse();

  const body = await request.text();
  let response: Response;
  try {
    response = await requestBackend(`/tags/${slug}`, {
      method: "PATCH",
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

export const DELETE: APIRoute = async ({ params, url }) => {
  const slug = params.slug;
  if (!slug) return missingSlugResponse();

  const query = url.search ? url.search : "";
  let response: Response;
  try {
    response = await requestBackend(`/tags/${slug}${query}`, {
      method: "DELETE",
    });
  } catch {
    return backendUnavailableResponse();
  }

  if (response.status === 204) {
    return new Response(null, { status: 204 });
  }

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
};
