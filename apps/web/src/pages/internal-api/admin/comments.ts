import type { APIRoute } from "astro";

import { ADMIN_ACCESS_COOKIE, verifyAccessToken } from "@/lib/admin-auth";
import { requestBackend } from "@/lib/backend-api";
import {
  backendUnavailableImportsResponse,
  proxyTextResponse,
  unauthorizedImportsResponse,
} from "@/lib/server/imports-proxy";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, url }) => {
  const accessToken = cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (!accessToken || !verifyAccessToken(accessToken)) {
    return unauthorizedImportsResponse();
  }

  const query = url.search ? url.search : "";
  let response: Response;
  try {
    response = await requestBackend(`/admin/comments${query}`);
  } catch {
    return backendUnavailableImportsResponse();
  }

  return proxyTextResponse(response);
};
