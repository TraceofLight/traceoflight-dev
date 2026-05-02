import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "../../../lib/admin-auth";
import { requestBackend } from "../../../lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
  unauthorizedResponse,
} from "../../../lib/server/proxy-helpers";

export const prerender = false;

export const PUT: APIRoute = async ({ request, cookies }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !(await verifyAccessToken(accessToken))) {
    return unauthorizedResponse();
  }

  const body = await request.text();
  let response: Response;
  try {
    response = await requestBackend("/series/order", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch {
    return backendUnavailableResponse();
  }
  return proxyTextResponse(response);
};
