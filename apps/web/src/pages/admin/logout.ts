import type { APIRoute } from 'astro';

import {
  ADMIN_REFRESH_COOKIE,
  clearAdminAuthCookies,
  revokeRefreshTokenFamily,
} from '../../lib/admin-auth';

export const prerender = false;

function clearSession(cookies: Parameters<APIRoute>[0]['cookies']): void {
  const refreshToken = cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? '';
  if (refreshToken) {
    revokeRefreshTokenFamily(refreshToken);
  }
  clearAdminAuthCookies(cookies);
}

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect('/admin/login', 302);
};

export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect('/admin/login', 302);
};
