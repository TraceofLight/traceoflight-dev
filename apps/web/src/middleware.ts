import { defineMiddleware } from "astro:middleware";

import { INTERNAL_API_ORIGIN_HOSTS } from "./consts";
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  clearAdminAuthCookies,
  rotateRefreshToken,
  setAdminAuthCookies,
  verifyAccessToken,
} from "./lib/admin-auth";
import { getSiteUrl } from "./lib/env";
import { buildPublicCanonicalUrl } from "./lib/public-url";

const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com",
    "media-src 'self' blob: data: https:",
    "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
  ].join("; "),
} as const;

function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/internal-api");
}

function isPublicPath(pathname: string): boolean {
  if (
    pathname === "/internal-api/auth/login" ||
    pathname === "/internal-api/auth/logout" ||
    pathname === "/internal-api/auth/refresh"
  ) {
    return true;
  }
  if (pathname.startsWith("/internal-api/media/browser-image")) return true;
  if (pathname === "/internal-api/posts/summary") return true;
  if (/^\/internal-api\/posts\/.+\/comments(?:\/|$)/.test(pathname)) return true;
  if (/^\/internal-api\/comments\/.+$/.test(pathname)) return true;
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
  const origins = new Set<string>(INTERNAL_API_ORIGIN_HOSTS);
  const configuredSiteUrl = getSiteUrl();
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

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  const redirectUrl = buildPublicCanonicalUrl(context.url);

  if (redirectUrl) {
    return context.redirect(redirectUrl.toString(), 301);
  }

  if (
    pathname.startsWith("/internal-api") &&
    UNSAFE_METHODS.has(context.request.method) &&
    isFormLikeRequest(context.request.headers.get("content-type")) &&
    !isAllowedInternalApiOrigin(context.request.headers.get("origin"))
  ) {
    return applySecurityHeaders(new Response("Cross-site form submissions are forbidden", {
      status: 403,
      headers: { "content-type": "text/plain;charset=UTF-8" },
    }));
  }

  if (!isProtectedPath(pathname) || isPublicPath(pathname)) {
    const response = await next();
    return applySecurityHeaders(response);
  }

  const accessToken = context.cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  if (accessToken && (await verifyAccessToken(accessToken))) {
    const response = await next();
    return applySecurityHeaders(response);
  }

  const refreshToken = context.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? "";
  if (refreshToken) {
    const rotation = await rotateRefreshToken(refreshToken);
    if (rotation.kind === "rotated" && rotation.pair) {
      const secure =
        process.env.NODE_ENV === "production" ||
        context.url.protocol === "https:";
      setAdminAuthCookies(context.cookies, rotation.pair, secure);
      const response = await next();
      return applySecurityHeaders(response);
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
    return applySecurityHeaders(new Response(JSON.stringify({ detail: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }));
  }

  return applySecurityHeaders(context.redirect(buildLoginRedirect(pathname, search)));
});
