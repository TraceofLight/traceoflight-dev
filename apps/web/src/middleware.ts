import { defineMiddleware } from 'astro:middleware';

import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  clearAdminAuthCookies,
  rotateRefreshToken,
  setAdminAuthCookies,
  verifyAccessToken,
} from './lib/admin-auth';

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/internal-api');
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/admin/login') return true;
  if (pathname.startsWith('/internal-api/auth/')) return true;
  return false;
}

function buildLoginRedirect(pathname: string, search: string): string {
  const next = encodeURIComponent(`${pathname}${search}`);
  return `/admin/login?next=${next}`;
}

export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = context.url;

  if (!isProtectedPath(pathname) || isPublicPath(pathname)) {
    return next();
  }

  const accessToken = context.cookies.get(ADMIN_ACCESS_COOKIE)?.value ?? '';
  if (accessToken && verifyAccessToken(accessToken)) {
    return next();
  }

  const refreshToken = context.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? '';
  if (refreshToken) {
    const rotation = rotateRefreshToken(refreshToken);
    if (rotation.pair) {
      const secure = process.env.NODE_ENV === 'production' || context.url.protocol === 'https:';
      setAdminAuthCookies(context.cookies, rotation.pair, secure);
      return next();
    }
    clearAdminAuthCookies(context.cookies);
  }

  if (pathname.startsWith('/internal-api')) {
    return new Response(JSON.stringify({ detail: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  return context.redirect(buildLoginRedirect(pathname, search));
});
