import { defineMiddleware } from "astro:middleware";

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  clearAdminAuthCookies,
  rotateRefreshToken,
  setAdminAuthCookies,
  verifyAccessToken,
} from "./lib/admin-auth";

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/internal-api");
}

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/internal-api/auth/")) return true;
  return false;
}

function buildLoginRedirect(pathname: string, search: string): string {
  const next = encodeURIComponent(`${pathname}${search}`);
  return `/?admin_login=1&next=${next}`;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const FORM_LIKE_CONTENT_TYPES = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
];

function buildAllowedInternalApiOrigins(): Set<string> {
  const origins = new Set<string>([
    "https://traceoflight.dev",
    "https://www.traceoflight.dev",
  ]);
  const configuredSiteUrl = process.env.SITE_URL?.trim() ?? "";
  if (!configuredSiteUrl) {
    return origins;
  }

  try {
    const configuredOrigin = new URL(configuredSiteUrl).origin;
    origins.add(configuredOrigin);
    const configuredUrl = new URL(configuredOrigin);
    const hostname = configuredUrl.hostname;
    const port = configuredUrl.port ? `:${configuredUrl.port}` : "";
    if (hostname.startsWith("www.")) {
      origins.add(`${configuredUrl.protocol}//${hostname.slice(4)}${port}`);
    } else {
      origins.add(`${configuredUrl.protocol}//www.${hostname}${port}`);
    }
  } catch {
    return origins;
  }

  return origins;
}

function isFormLikeRequest(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }
  const normalized = contentType.toLowerCase();
  return FORM_LIKE_CONTENT_TYPES.some((value) => normalized.includes(value));
}

function isAllowedInternalApiOrigin(origin: string | null): boolean {
  if (!origin) {
    return false;
  }
  return buildAllowedInternalApiOrigins().has(origin);
}

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = context.url;

  if (
    pathname.startsWith("/internal-api") &&
    UNSAFE_METHODS.has(context.request.method) &&
    isFormLikeRequest(context.request.headers.get("content-type")) &&
    !isAllowedInternalApiOrigin(context.request.headers.get("origin"))
  ) {
    return new Response("Cross-site form submissions are forbidden", {
      status: 403,
      headers: { "content-type": "text/plain;charset=UTF-8" },
    });
  }

  if (!isProtectedPath(pathname) || isPublicPath(pathname)) {
    return next();
  }

  const accessToken = context.cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (accessToken && verifyAccessToken(accessToken)) {
    return next();
  }

  const refreshToken = context.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? "";
  if (refreshToken) {
    const rotation = rotateRefreshToken(refreshToken);
    if (rotation.kind === "rotated" && rotation.pair) {
      const secure =
        process.env.NODE_ENV === "production" ||
        context.url.protocol === "https:";
      setAdminAuthCookies(context.cookies, rotation.pair, secure);
      return next();
    }

    if (
      rotation.kind === "reuse_detected" ||
      rotation.kind === "invalid" ||
      rotation.kind === "expired"
    ) {
      clearAdminAuthCookies(context.cookies);
    }
  }

  if (pathname.startsWith("/internal-api")) {
    return new Response(JSON.stringify({ detail: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  return context.redirect(buildLoginRedirect(pathname, search));
});
