import type { APIRoute } from 'astro';

import {
  ADMIN_REFRESH_COOKIE,
  clearAdminAuthCookies,
  revokeRefreshTokenFamily,
} from '../../../lib/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
  const refreshToken = cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? '';
  if (refreshToken) {
    revokeRefreshTokenFamily(refreshToken);
  }
  clearAdminAuthCookies(cookies);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
