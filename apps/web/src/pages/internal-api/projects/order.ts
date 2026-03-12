import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../lib/admin-auth";
import { requestBackend } from "../../../lib/backend-api";

export const prerender = false;

export const PUT: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !verifyAccessToken(accessToken)) {
    return new Response(JSON.stringify({ message: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const body = await request.text();

  try {
    const response = await requestBackend("/projects/order", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    });
    const responseBody = await response.text();
    const contentType = response.headers.get("content-type");
    return new Response(responseBody, {
      status: response.status,
      headers: contentType ? { "content-type": contentType } : undefined,
    });
  } catch {
    return new Response(JSON.stringify({ message: "backend unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
};
