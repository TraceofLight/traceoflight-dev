import type { APIRoute } from 'astro';

import {
  clearAdminAuthCookies,
  isAdminAuthConfigured,
  issueLoginTokenPair,
  setAdminAuthCookies,
  verifyAdminCredentials,
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
  if (!verifyAdminCredentials(username, password)) {
    return new Response(JSON.stringify({ detail: 'Invalid username or password' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const tokenPair = issueLoginTokenPair();
  if (!tokenPair) {
    return new Response(JSON.stringify({ detail: 'Admin auth is not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const secure = process.env.NODE_ENV === 'production' || request.url.startsWith('https://');
  clearAdminAuthCookies(cookies);
  setAdminAuthCookies(cookies, tokenPair, secure);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
