import type { APIRoute } from 'astro';

import { requestBackend } from '../../../lib/backend-api';
import { serverLogger } from '../../../lib/server/logging';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  serverLogger.debug('media.upload_url_proxy_requested', {
    payload_length: body.length,
  });
  const response = await requestBackend('/media/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const responseBody = await response.text();
  serverLogger.debug('media.upload_url_proxy_returned', {
    status: response.status,
    content_type: response.headers.get('content-type') ?? 'application/json',
    payload_length: responseBody.length,
  });

  return new Response(responseBody, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
};
