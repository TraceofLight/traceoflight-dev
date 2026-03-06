import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../../lib/admin-auth";
import { requestBackend } from "../../../../lib/backend-api";

export const prerender = false;

function backendUnavailableResponse(): Response {
  return new Response(JSON.stringify({ message: "backend unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ detail: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

export const GET: APIRoute = async ({ cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !verifyAccessToken(accessToken)) {
    return unauthorizedResponse();
  }

  let response: Response;
  try {
    response = await requestBackend("/imports/backups/posts.zip", { method: "GET" });
  } catch {
    return backendUnavailableResponse();
  }

  const payload = await response.arrayBuffer();
  const headers = new Headers();
  headers.set("content-type", response.headers.get("content-type") ?? "application/zip");
  const disposition = response.headers.get("content-disposition");
  if (disposition) {
    headers.set("content-disposition", disposition);
  }
  return new Response(payload, {
    status: response.status,
    headers,
  });
};
