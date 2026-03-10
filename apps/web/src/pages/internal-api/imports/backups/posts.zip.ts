import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../../lib/admin-auth";
import { requestBackend } from "../../../../lib/backend-api";
import {
  backendUnavailableImportsResponse,
  proxyBinaryResponse,
  unauthorizedImportsResponse,
} from "../../../../lib/server/imports-proxy";

export const prerender = false;

export const GET: APIRoute = async ({ cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !verifyAccessToken(accessToken)) {
    return unauthorizedImportsResponse();
  }

  let response: Response;
  try {
    response = await requestBackend("/imports/backups/posts.zip", { method: "GET" });
  } catch {
    return backendUnavailableImportsResponse();
  }

  return proxyBinaryResponse(response, "application/zip");
};
