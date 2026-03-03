import type { APIRoute } from 'astro';

import { requestBackend } from '../../lib/backend-api';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const query = url.search ? url.search : '';
  const response = await requestBackend(`/posts${query}`);
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const response = await requestBackend('/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const responseBody = await response.text();

  return new Response(responseBody, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
};
