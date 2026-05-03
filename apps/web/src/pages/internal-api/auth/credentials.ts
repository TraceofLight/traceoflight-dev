import type { APIRoute } from 'astro';

import { clearAdminAuthCookies } from '../../../lib/admin-auth';
import { requestBackend } from '../../../lib/backend-api';
import { readJsonSafe } from '../../../lib/http';

export const prerender = false;

interface CredentialUpdateRequest {
  loginId?: string;
  password?: string;
}

export const PUT: APIRoute = async ({ request, cookies }) => {
  let payload: CredentialUpdateRequest = {};
  try {
    payload = (await request.json()) as CredentialUpdateRequest;
  } catch {
    return new Response(JSON.stringify({ detail: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const loginId = payload.loginId?.trim() ?? '';
  const password = payload.password ?? '';
  if (!loginId || !password) {
    return new Response(JSON.stringify({ detail: 'loginId and password are required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  let upstream: Response;
  try {
    upstream = await requestBackend('/admin/auth/credentials', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        login_id: loginId,
        password,
      }),
    });
  } catch {
    return new Response(JSON.stringify({ detail: 'Backend auth service is unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  const responsePayload = await readJsonSafe(upstream);
  if (!upstream.ok) {
    return new Response(JSON.stringify(responsePayload ?? { detail: 'Failed to update admin credentials' }), {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  clearAdminAuthCookies(cookies);
  return new Response(JSON.stringify(responsePayload ?? { ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
