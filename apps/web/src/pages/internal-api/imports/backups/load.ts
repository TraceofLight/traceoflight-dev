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

function badRequest(detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !verifyAccessToken(accessToken)) {
    return unauthorizedResponse();
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return badRequest("file is required");
  }

  const upstreamBody = new FormData();
  upstreamBody.set("file", file, file.name);

  let response: Response;
  try {
    response = await requestBackend("/imports/backups/load", {
      method: "POST",
      body: upstreamBody,
    });
  } catch {
    return backendUnavailableResponse();
  }

  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
};
