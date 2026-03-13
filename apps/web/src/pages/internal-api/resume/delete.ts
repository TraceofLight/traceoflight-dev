import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../lib/admin-auth";
import { requestBackend } from "../../../lib/backend-api";
import {
  backendUnavailableImportsResponse,
  proxyTextResponse,
  unauthorizedImportsResponse,
} from "../../../lib/server/imports-proxy";

export const prerender = false;

export const DELETE: APIRoute = async ({ cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !(await verifyAccessToken(accessToken))) {
    return unauthorizedImportsResponse();
  }

  let response: Response;
  try {
    response = await requestBackend("/resume", {
      method: "DELETE",
    });
  } catch {
    return backendUnavailableImportsResponse();
  }

  return proxyTextResponse(response);
};
