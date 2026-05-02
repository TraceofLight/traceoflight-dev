import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../../lib/admin-auth";
import { requestBackend } from "../../../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyBinaryResponse,
  unauthorizedResponse,
} from "../../../../lib/server/proxy-helpers";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !(await verifyAccessToken(accessToken))) {
    return unauthorizedResponse();
  }

  let response: Response;
  try {
    response = await requestBackend("/imports/backups/posts.zip", { method: "GET" });
  } catch {
    return backendUnavailableResponse();
  }

  return proxyBinaryResponse(response, "application/zip");
};
