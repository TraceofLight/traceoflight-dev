import { SITE_URL } from "../consts";

export function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function toPublicOrigin(candidate?: string | URL | null): URL | null {
  if (!candidate) {
    return null;
  }

  try {
    const url = candidate instanceof URL ? new URL(candidate.toString()) : new URL(candidate);
    if (isLocalHostname(url.hostname)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

export function resolvePublicSiteOrigin(configuredSiteUrl?: string | URL | null): URL {
  return toPublicOrigin(configuredSiteUrl)
    ?? toPublicOrigin(process.env.SITE_URL)
    ?? new URL(SITE_URL);
}

export function canonicalizePublicPath(pathname: string): string {
  if (
    (pathname.startsWith("/blog/") ||
      pathname.startsWith("/projects/") ||
      pathname.startsWith("/series/")) &&
    pathname.length > 1 &&
    pathname.endsWith("/")
  ) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function shouldSkipCanonicalization(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/internal-api");
}

function shouldSkipPathCanonicalization(pathname: string): boolean {
  if (pathname.startsWith("/admin") || pathname.startsWith("/internal-api")) {
    return true;
  }

  return /\.[a-z0-9]+$/i.test(pathname);
}

export function buildPublicCanonicalUrl(
  url: URL,
  preferredOrigin: URL = resolvePublicSiteOrigin(),
): URL | null {
  const { pathname } = url;
  if (shouldSkipCanonicalization(pathname)) {
    return null;
  }

  const canonicalPathname = shouldSkipPathCanonicalization(pathname)
    ? pathname
    : canonicalizePublicPath(pathname);
  const requestUsesLocalOrigin = isLocalHostname(url.hostname);
  const requiresHostRedirect =
    !requestUsesLocalOrigin && url.hostname !== preferredOrigin.hostname;
  const requiresPathRedirect = canonicalPathname !== pathname;

  if (!requiresHostRedirect && !requiresPathRedirect) {
    return null;
  }

  const redirectUrl = new URL(url.toString());
  if (requiresHostRedirect || requestUsesLocalOrigin) {
    redirectUrl.protocol = preferredOrigin.protocol;
    redirectUrl.hostname = preferredOrigin.hostname;
    redirectUrl.port = preferredOrigin.port;
  }
  redirectUrl.pathname = canonicalPathname;

  return redirectUrl;
}
