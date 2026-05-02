import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../lib/admin-auth";
import { requestBackend } from "../../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
  unauthorizedResponse,
} from "../../../lib/server/proxy-helpers";

export const prerender = false;

export const DELETE: APIRoute = async ({ cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !(await verifyAccessToken(accessToken))) {
    return unauthorizedResponse();
  }

  let response: Response;
  try {
    response = await requestBackend("/portfolio", {
      method: "DELETE",
    });
  } catch {
    return backendUnavailableResponse();
  }

  return proxyTextResponse(response);
};
