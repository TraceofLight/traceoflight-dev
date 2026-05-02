import type { APIRoute } from "astro";

import { requestBackend } from "../../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
} from "../../../lib/server/proxy-helpers";

export const prerender = false;

function badRequest(detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

async function proxyDeletePostBySlug(slug: string, query: string): Promise<Response> {
  let response: Response;
  try {
    response = await requestBackend(`/posts/${slug}${query}`, {
      method: "DELETE",
    });
  } catch {
    return backendUnavailableResponse();
  }
  return proxyTextResponse(response);
}

export const GET: APIRoute = async ({ params, url }) => {
  const slug = params.slug;
  if (!slug) {
    return badRequest("slug is required");
  }

  const query = url.search ? url.search : "";
  let response: Response;
  try {
    response = await requestBackend(`/posts/${slug}${query}`);
  } catch {
    return backendUnavailableResponse();
  }
  return proxyTextResponse(response);
};

export const PUT: APIRoute = async ({ params, request, url }) => {
  const slug = params.slug;
  if (!slug) {
    return badRequest("slug is required");
  }

  const body = await request.text();
  const query = url.search ? url.search : "";
  let response: Response;
  try {
    response = await requestBackend(`/posts/${slug}${query}`, {
      method: "PUT",
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
  if (!slug) {
    return badRequest("slug is required");
  }

  const query = url.search ? url.search : "";
  return proxyDeletePostBySlug(slug, query);
};

export const POST: APIRoute = async ({ params, request, url }) => {
  const slug = params.slug;
  if (!slug) {
    return badRequest("slug is required");
  }

  const bodyText = (await request.text()).trim();
  let action = "";
  if (bodyText.length > 0) {
    try {
      const parsed = JSON.parse(bodyText) as { action?: string };
      action = typeof parsed.action === "string" ? parsed.action.trim().toLowerCase() : "";
    } catch {
      return badRequest("invalid request payload");
    }
  }

  if (action !== "delete") {
    return new Response(JSON.stringify({ detail: "unsupported action" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const query = url.search ? url.search : "";
  return proxyDeletePostBySlug(slug, query);
};
