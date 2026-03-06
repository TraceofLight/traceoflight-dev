import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../../../lib/admin-auth";
import { requestBackend } from "../../../../../lib/backend-api";

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

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !verifyAccessToken(accessToken)) {
    return unauthorizedResponse();
  }

  const snapshotId = params.snapshotId;
  if (!snapshotId) {
    return new Response(JSON.stringify({ detail: "snapshot id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await request.text();
  let response: Response;
  try {
    response = await requestBackend(
      `/imports/snapshots/${encodeURIComponent(snapshotId)}/jobs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      },
    );
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
