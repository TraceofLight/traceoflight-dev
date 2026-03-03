import type { APIRoute } from 'astro';

import { requestBackend } from '../../../lib/backend-api';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const response = await requestBackend('/media/upload-url', {
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
