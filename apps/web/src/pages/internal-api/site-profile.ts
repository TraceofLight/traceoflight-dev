import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../lib/admin-auth";
import { requestBackend } from "../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
  unauthorizedResponse,
} from "../../lib/server/proxy-helpers";

export const prerender = false;

interface SiteProfileUpdateRequest {
  email?: string;
  githubUrl?: string;
}

function badRequest(detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export const PUT: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !(await verifyAccessToken(accessToken))) {
    return unauthorizedResponse();
  }

  let payload: SiteProfileUpdateRequest = {};
  try {
    payload = (await request.json()) as SiteProfileUpdateRequest;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const email = payload.email?.trim() ?? "";
  const githubUrl = payload.githubUrl?.trim() ?? "";
  if (!email || !githubUrl) {
    return badRequest("email and githubUrl are required");
  }

  let response: Response;
  try {
    response = await requestBackend("/site-profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        github_url: githubUrl,
      }),
    });
  } catch {
    return backendUnavailableResponse();
  }

  return proxyTextResponse(response);
};
