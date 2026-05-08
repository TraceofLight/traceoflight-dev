import type { APIRoute } from 'astro';

import {
  clearAdminAuthCookies,
  isAdminAuthConfigured,
  setAdminAuthCookies,
  verifyOperationalAdminCredentials,
} from '../../../lib/admin-auth';

export const prerender = false;

interface LoginRequest {
  username?: string;
  password?: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdminAuthConfigured()) {
    return new Response(JSON.stringify({ detail: 'Admin auth is not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  let payload: LoginRequest = {};
  try {
    payload = (await request.json()) as LoginRequest;
  } catch {
    return new Response(JSON.stringify({ detail: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const username = payload.username?.trim() ?? '';
  const password = payload.password ?? '';
  const xff = request.headers.get('x-forwarded-for') ?? '';
  const clientIp =
    (xff.split(',')[0] ?? '').trim() ||
    (request.headers.get('x-real-ip') ?? '').trim();
  const verification = await verifyOperationalAdminCredentials(
    username,
    password,
    clientIp,
  );
  if (!verification.ok || !verification.tokenPair) {
    if (verification.throttled) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      if (verification.retryAfterSeconds) {
        headers['retry-after'] = String(verification.retryAfterSeconds);
      }
      return new Response(
        JSON.stringify({ detail: 'Too many failed attempts. Try again later.' }),
        { status: 429, headers },
      );
    }
    return new Response(JSON.stringify({ detail: 'Invalid username or password' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const secure = process.env.NODE_ENV === 'production' || request.url.startsWith('https://');
  clearAdminAuthCookies(cookies);
  setAdminAuthCookies(cookies, verification.tokenPair, secure);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
