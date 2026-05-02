import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "@/lib/admin-auth";
import { requestBackend } from "@/lib/backend-api";
import {
  backendUnavailableResponse,
  proxyTextResponse,
  unauthorizedResponse,
} from "@/lib/server/proxy-helpers";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !(await verifyAccessToken(accessToken))) {
    return unauthorizedResponse();
  }

  const query = url.search ? url.search : "";
  let response: Response;
  try {
    response = await requestBackend(`/admin/comments${query}`);
  } catch {
    return backendUnavailableResponse();
  }

  return proxyTextResponse(response);
};
