import type { APIRoute } from 'astro';

import { requestBackend } from '../../../lib/backend-api';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ message: 'slug is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const query = url.search ? url.search : '';
  const response = await requestBackend(`/posts/${slug}${query}`);
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
  });
};
