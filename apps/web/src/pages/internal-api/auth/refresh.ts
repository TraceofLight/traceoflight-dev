import type { APIRoute } from 'astro';

import {
  ADMIN_REFRESH_COOKIE,
  clearAdminAuthCookies,
  rotateRefreshToken,
  setAdminAuthCookies,
} from '../../../lib/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const refreshToken = cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? '';
  if (!refreshToken) {
    return new Response(JSON.stringify({ detail: 'Refresh token is missing' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const rotation = rotateRefreshToken(refreshToken);
  if (!rotation.pair) {
    clearAdminAuthCookies(cookies);
    return new Response(JSON.stringify({ detail: 'Refresh token is invalid' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const secure = process.env.NODE_ENV === 'production' || request.url.startsWith('https://');
  setAdminAuthCookies(cookies, rotation.pair, secure);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
