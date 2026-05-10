import { randomBytes } from "node:crypto";

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
import {
  extractLocaleFromPathname,
  readLocaleCookie,
  writeLocaleCookie,
} from "./lib/i18n/cookie";
import { buildPublicCanonicalUrl } from "./lib/public-url";
import { serverLogger } from "./lib/server/logging";

const STATIC_SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

function buildCspHeader(scriptNonce: string): string {
  // script-src uses a per-request nonce instead of 'unsafe-inline' so reflected
  // XSS payloads can't execute even if injection slips past sanitization. The
  // response HTML rewrite below stamps `nonce="..."` onto every <script> tag
  // (own + Astro-generated runtime) so all legitimate scripts are allowed.
  // style-src keeps 'unsafe-inline' for now — Tailwind utilities rely on it
  // and removing requires a separate audit.
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${scriptNonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob: data: https:",
    "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
  ].join("; ");
}

function applySecurityHeaders(
  response: Response,
  scriptNonce: string,
): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  headers.set("Content-Security-Policy", buildCspHeader(scriptNonce));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const SCRIPT_OPEN_TAG_RE = /<script\b(?![^>]*\bnonce=)/g;

async function injectScriptNonceIntoHtml(
  response: Response,
  scriptNonce: string,
): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return response;
  }
  const body = await response.text();
  const stamped = body.replace(
    SCRIPT_OPEN_TAG_RE,
    `<script nonce="${scriptNonce}"`,
  );
  return new Response(stamped, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function finalizeResponse(
  response: Response,
  scriptNonce: string,
): Promise<Response> {
  const stamped = await injectScriptNonceIntoHtml(response, scriptNonce);
  return applySecurityHeaders(stamped, scriptNonce);
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
  if (/^\/internal-api\/posts\/.+\/comments(?:\/|$)/.test(pathname))
    return true;
  if (/^\/internal-api\/comments\/.+$/.test(pathname)) return true;
  if (pathname === "/internal-api/analytics/event") return true;
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
  const method = context.request.method;
  const protectedPath = isProtectedPath(pathname);
  const publicPath = isPublicPath(pathname);

  serverLogger.debug("middleware.request_started", {
    method,
    path: pathname,
    search_present: Boolean(search),
    protected_path: protectedPath,
    public_path: publicPath,
  });

  if (redirectUrl) {
    serverLogger.debug("middleware.canonical_redirected", {
      method,
      path: pathname,
      target_path: redirectUrl.pathname,
      target_search_present: Boolean(redirectUrl.search),
      status: 301,
    });
    return context.redirect(redirectUrl.toString(), 301);
  }

  // One nonce per request, used both in the CSP header and stamped onto every
  // <script> tag in the response HTML by `finalizeResponse`. 16 bytes of
  // randomness is more than enough — attackers can't predict it without
  // observing the response, and we never reuse it across requests.
  const scriptNonce = randomBytes(16).toString("base64");

  // Refresh the locale-preference cookie whenever the visitor is on a
  // localized public page so that root-level redirects and cross-page
  // navigation can honor it across sessions.
  const secureCookie =
    process.env.NODE_ENV === "production" || context.url.protocol === "https:";

  const pathLocale = extractLocaleFromPathname(pathname);
  if (pathLocale && readLocaleCookie(context.cookies) !== pathLocale) {
    writeLocaleCookie(context.cookies, pathLocale, secureCookie);
    serverLogger.debug("middleware.locale_cookie_synced", {
      method,
      path: pathname,
      locale: pathLocale,
      secure: secureCookie,
    });
  }

  if (
    pathname.startsWith("/internal-api") &&
    UNSAFE_METHODS.has(context.request.method) &&
    isFormLikeRequest(context.request.headers.get("content-type")) &&
    !isAllowedInternalApiOrigin(context.request.headers.get("origin"))
  ) {
    serverLogger.warn("security.csrf_blocked", {
      method,
      path: pathname,
      origin_present: Boolean(context.request.headers.get("origin")),
      content_type: context.request.headers.get("content-type") ?? "missing",
    });
    return finalizeResponse(
      new Response("Cross-site form submissions are forbidden", {
        status: 403,
        headers: { "content-type": "text/plain;charset=UTF-8" },
      }),
      scriptNonce,
    );
  }

  // Soft-refresh: if access is missing/expired but refresh is valid, rotate
  // tokens for ANY path. Public pages (Header, Footer) read access cookie to
  // decide isAdminViewer; without this, the admin UI silently disappears
  // ~15 min after login even though the refresh cookie is still good for days.
  const accessToken = context.cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? "";
  let isAuthenticated = accessToken
    ? await verifyAccessToken(accessToken)
    : false;

  if (!isAuthenticated) {
    const refreshToken = context.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? "";
    if (refreshToken) {
      const rotation = await rotateRefreshToken(refreshToken);
      if (rotation.kind === "rotated" && rotation.pair) {
        setAdminAuthCookies(context.cookies, rotation.pair, secureCookie);
        isAuthenticated = true;
        serverLogger.info("admin.session_refresh_rotated", {
          method,
          path: pathname,
          protected_path: protectedPath,
        });
      } else if (
        rotation.kind === "reuse_detected" ||
        rotation.kind === "invalid" ||
        rotation.kind === "expired"
      ) {
        clearAdminAuthCookies(context.cookies);
        serverLogger.warn("admin.session_refresh_failed", {
          method,
          path: pathname,
          reason: rotation.kind,
          protected_path: protectedPath,
        });
      } else if (rotation.kind === "stale") {
        serverLogger.debug("admin.session_refresh_stale", {
          method,
          path: pathname,
          protected_path: protectedPath,
        });
      }
    }
  }

  serverLogger.debug("middleware.auth_checked", {
    method,
    path: pathname,
    protected_path: protectedPath,
    public_path: publicPath,
    authenticated: isAuthenticated,
    access_credential_present: Boolean(accessToken),
  });

  if (!protectedPath || publicPath) {
    serverLogger.debug("middleware.request_allowed", {
      method,
      path: pathname,
      reason: publicPath ? "public_internal_api" : "public",
    });
    const response = await next();
    return finalizeResponse(response, scriptNonce);
  }

  if (isAuthenticated) {
    serverLogger.debug("middleware.request_allowed", {
      method,
      path: pathname,
      reason: "authenticated",
    });
    const response = await next();
    return finalizeResponse(response, scriptNonce);
  }

  if (pathname.startsWith("/internal-api")) {
    serverLogger.warn("admin.internal_api_unauthorized", {
      method,
      path: pathname,
    });
    return finalizeResponse(
      new Response(JSON.stringify({ detail: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
      scriptNonce,
    );
  }

  serverLogger.info("admin.login_redirected", {
    method,
    path: pathname,
  });

  return finalizeResponse(
    context.redirect(buildLoginRedirect(pathname, search)),
    scriptNonce,
  );
});
