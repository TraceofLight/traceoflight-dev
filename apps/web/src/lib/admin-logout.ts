import type { APIContext, APIRoute } from "astro";

import {
  ADMIN_REFRESH_COOKIE,
  clearAdminAuthCookies,
  revokeRefreshTokenFamily,
} from "./admin-auth";
import { sanitizeNextPath } from "./admin-redirect";

function buildNextPath(context: Pick<APIContext, "url">): string {
  return sanitizeNextPath(context.url.searchParams.get("next"));
}

export function createAdminLogoutResponse(
  context: Pick<APIContext, "cookies" | "request" | "redirect" | "url">,
): ReturnType<APIRoute> {
  const refreshToken = context.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? "";
  if (refreshToken) {
    revokeRefreshTokenFamily(refreshToken);
  }
  clearAdminAuthCookies(context.cookies);

  const accept = context.request.headers.get("accept") ?? "";
  const nextPath = buildNextPath(context);
  if (accept.includes("text/html")) {
    return context.redirect(nextPath);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export function createAdminLogoutRedirect(
  context: Pick<APIContext, "redirect" | "url">,
): ReturnType<APIRoute> {
  const nextPath = buildNextPath(context);
  return context.redirect(nextPath);
}
