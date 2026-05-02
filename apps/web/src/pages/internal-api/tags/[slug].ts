import type { APIRoute } from "astro";

import { requestBackend } from "../../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
} from "../../../lib/server/proxy-helpers";

export const prerender = false;

function missingSlugResponse(): Response {
  return new Response(JSON.stringify({ detail: "slug is required" }), {
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
  return proxyTextResponse(response);
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
  return proxyTextResponse(response);
};
