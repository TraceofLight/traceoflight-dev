import type { APIRoute } from "astro";

import { requestBackend } from "../../../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
} from "../../../../lib/server/proxy-helpers";

export const prerender = false;

function invalidSlugResponse(): Response {
  return new Response(JSON.stringify({ detail: "slug is required" }), {
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
  return proxyTextResponse(response);
};
