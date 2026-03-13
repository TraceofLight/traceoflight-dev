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

  const rotation = await rotateRefreshToken(refreshToken);
  if (rotation.kind === 'rotated' && rotation.pair) {
    const secure = process.env.NODE_ENV === 'production' || request.url.startsWith('https://');
    setAdminAuthCookies(cookies, rotation.pair, secure);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (rotation.kind === 'reuse_detected' || rotation.kind === 'invalid' || rotation.kind === 'expired') {
    clearAdminAuthCookies(cookies);
  }

  if (rotation.kind === 'stale') {
    return new Response(JSON.stringify({ detail: 'Refresh token is stale', code: 'RTR_STALE' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (rotation.kind === 'expired') {
    return new Response(JSON.stringify({ detail: 'Refresh token is expired', code: 'RTR_EXPIRED' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (rotation.kind === 'reuse_detected') {
    return new Response(JSON.stringify({ detail: 'Refresh token reuse detected', code: 'RTR_REUSE' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    detail: 'Refresh token is invalid or its credential revision is no longer active',
    code: 'RTR_INVALID',
  }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
};
