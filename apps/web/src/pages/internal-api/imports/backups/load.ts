import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../../lib/admin-auth";
import { requestBackend } from "../../../../lib/backend-api";
import {
  backendUnavailableImportsResponse,
  proxyTextResponse,
  unauthorizedImportsResponse,
} from "../../../../lib/server/imports-proxy";

export const prerender = false;

function badRequest(detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !(await verifyAccessToken(accessToken))) {
    return unauthorizedImportsResponse();
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
    return backendUnavailableImportsResponse();
  }

  return proxyTextResponse(response);
};
