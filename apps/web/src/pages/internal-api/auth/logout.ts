import type { APIRoute } from 'astro';

import {
  ADMIN_REFRESH_COOKIE,
  clearAdminAuthCookies,
  revokeRefreshTokenFamily,
} from '../../../lib/admin-auth';
import { sanitizeNextPath } from '../../../lib/admin-redirect';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request, url, redirect }) => {
  const refreshToken = cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? '';
  if (refreshToken) {
    revokeRefreshTokenFamily(refreshToken);
  }
  clearAdminAuthCookies(cookies);

  const accept = request.headers.get('accept') ?? '';
  const nextPath = sanitizeNextPath(url.searchParams.get('next'));
  if (accept.includes('text/html')) {
    return redirect(nextPath);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
