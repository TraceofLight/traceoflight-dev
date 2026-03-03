import type { APIRoute } from 'astro';

import { requestBackend } from '../../../lib/backend-api';

export const prerender = false;

function json(detail: string, status: number): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function parseProxyUploadPayload(
  request: Request,
): Promise<{ uploadUrl: string; contentType: string; body: ArrayBuffer } | Response> {
  const uploadUrl = String(request.headers.get('x-upload-url') ?? '').trim();
  const contentType = String(
    request.headers.get('x-upload-content-type')
      ?? request.headers.get('content-type')
      ?? 'application/octet-stream',
  ).trim();
  const binaryBody = await request.arrayBuffer();

  if (!uploadUrl) {
    return json('x-upload-url header is required', 400);
  }
  if (binaryBody.byteLength === 0) {
    return json('request body is empty', 400);
  }

  return {
    uploadUrl,
    contentType: contentType || 'application/octet-stream',
    body: binaryBody,
  };
}

export const POST: APIRoute = async ({ request }) => {
  const payload = await parseProxyUploadPayload(request);
  if (payload instanceof Response) {
    return payload;
  }

  const upstreamResponse = await requestBackend('/media/upload-proxy', {
    method: 'POST',
    headers: {
      'content-type': payload.contentType || 'application/octet-stream',
      'x-upload-url': payload.uploadUrl,
      'x-upload-content-type': payload.contentType || 'application/octet-stream',
    },
    body: payload.body,
  });
  const upstreamBody = await upstreamResponse.text();

  return new Response(upstreamBody, {
    status: upstreamResponse.status,
    headers: {
      'content-type': upstreamResponse.headers.get('content-type') ?? 'application/json',
    },
  });
};
